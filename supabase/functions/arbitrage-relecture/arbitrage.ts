// La relecture des anecdotes que le vérificateur n'a pas su trancher, confiée
// à un arbitre plutôt qu'à un humain.
//
// Depuis le 10 octobre, une anecdote conforme en tout sauf le doute du
// vérificateur attendait un clic depuis le rapport du matin (`a_relire`).
// Le 25 novembre, cinq attendaient. Le travail du relecteur était toujours le
// même : lire chaque reproche, juger s'il est fondé (le vérificateur relève
// parfois ce qu'il conclut lui-même « cohérent »), faire corriger ce qui doit
// l'être, puis publier ou rejeter. C'est ce que fait l'arbitre.
//
// Ce fichier ne tient que le prompt et la lecture de la décision : aucune API
// Deno, pour que les tests tournent sous `node --test`.

export type Decision = 'publier' | 'corriger' | 'rejeter';

export interface Reproche {
  reproche: string;
  fonde: boolean;
  explication: string;
}

export interface Arbitrage {
  decision: Decision;
  hors_sujet: boolean;
  reproches: Reproche[];
  /** Ce que la réécriture doit changer, quand la décision est `corriger`. */
  consignes: string[];
  motif: string;
}

export const ARBITRAGE_SYSTEM = `Tu es rédacteur en chef d'une application d'anecdotes d'histoire locale. Un vérificateur de faits a relu une anecdote face à son dossier documentaire et a émis des doutes. Tu tranches à sa place : publier, faire corriger ou rejeter.

Le dossier est la seule référence. Ce que tu crois savoir par ailleurs ne compte pas.

1. Pour chaque reproche du vérificateur, dis s'il est fondé :
- fondé : l'anecdote affirme une date, un chiffre, un nom, un fait ou un lien de cause que le dossier n'établit pas, ou qu'il contredit ;
- non fondé : le dossier dit bien ce que l'anecdote affirme, ou le vérificateur conclut lui-même que c'est « cohérent », « dans le dossier », « pas un problème », ou il ne reproche qu'une omission ou une reformulation fidèle.
Vérifie en relisant le dossier, ne recopie pas l'avis du vérificateur.

2. Vérifie que l'anecdote parle bien de la ville annoncée, et pas d'une autre. Le dossier peut porter sur une autre ville (homonyme, ville portuaire, ville voisine) : un récit qui se passe à Douvres, Anvers ou Boulogne n'est pas un récit sur « Le Port », même s'il parle d'un port. Si les lieux du récit ne sont pas dans la ville annoncée, "hors_sujet" vaut true, quelle que soit la qualité du texte.

3. Décide :
- "publier" : aucun reproche fondé, et l'anecdote parle de la ville.
- "corriger" : des reproches fondés, mais secondaires : une phrase, une conclusion, un lien de cause ou un titre à retirer ou à reformuler, sans toucher au cœur du récit. Donne alors dans "consignes" une instruction précise par correction (quoi retirer ou reformuler, et comment le dire d'après le dossier).
- "rejeter" : l'anecdote est hors sujet, ou son idée centrale (celle que porte le titre ou l'accroche) repose sur une affirmation que le dossier n'établit pas et qu'on ne peut retirer sans vider le récit.

"motif" résume ta décision en une phrase courte, pour le rapport du matin.

Réponds uniquement par un objet json de cette forme :
{
  "reproches": [{"reproche": "résumé du reproche", "fonde": true, "explication": "une phrase"}],
  "hors_sujet": false,
  "decision": "corriger",
  "consignes": ["Retirer la phrase finale sur ... : le dossier ne le dit pas."],
  "motif": "Une conclusion non sourcée à retirer, le reste est fidèle."
}`;

/** Les reproches du vérificateur, sans la ligne de verdict qui les précède. */
export function reprochesDe(problemes: string[] | null): string[] {
  return (problemes ?? [])
    .filter((p) => !p.startsWith('Vérification :'))
    .map((p) => p.replace(/^Fond : /, ''));
}

export function arbitragePrompt(
  city: string,
  dossier: string,
  anecdote: { titre: string; accroche: string; periode: string; corps: string },
  reproches: string[],
  sansCorrection = false
): string {
  return `DOSSIER DOCUMENTAIRE (fourni pour la ville de ${city}, à vérifier : il peut porter sur une autre ville)
${dossier}

=== FIN DU DOSSIER ===

ANECDOTE (ville annoncée : ${city})
Titre : ${anecdote.titre}
Accroche : ${anecdote.accroche}
Période annoncée : ${anecdote.periode}

${anecdote.corps}

=== FIN DE L'ANECDOTE ===

REPROCHES DU VÉRIFICATEUR
${reproches.length > 0 ? reproches.map((r) => `- ${r}`).join('\n') : '- Doute général, sans reproche précis.'}
${
  sansCorrection
    ? `
Cette version a été corrigée et ne le sera plus. Juge-la pour elle-même, sans tenir compte des corrections passées : "publier" si aucun reproche n'est fondé et qu'elle parle de ${city}, "rejeter" sinon.`
    : ''
}
Ville annoncée : ${city}. Tranche et réponds en json.`;
}

/**
 * La décision, rendue cohérente avec ce que l'arbitre a lui-même constaté :
 * un reproche jugé fondé interdit de publier en l'état, un récit hors sujet
 * se rejette, et une correction sans consigne ne corrigerait rien. Une
 * réponse illisible ne publie jamais : elle renvoie `null`, et l'anecdote
 * reste en relecture humaine.
 */
export function lireArbitrage(brut: unknown, sansCorrection = false): Arbitrage | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as Record<string, unknown>;
  const decisions: Decision[] = ['publier', 'corriger', 'rejeter'];
  if (!decisions.includes(b.decision as Decision)) return null;

  const reproches: Reproche[] = Array.isArray(b.reproches)
    ? (b.reproches as unknown[])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
          reproche: String(r.reproche ?? '').trim(),
          fonde: r.fonde !== false,
          explication: String(r.explication ?? '').trim(),
        }))
    : [];
  const consignes = Array.isArray(b.consignes)
    ? (b.consignes as unknown[]).map((c) => String(c ?? '').trim()).filter(Boolean)
    : [];
  const horsSujet = b.hors_sujet === true;
  const motif = String(b.motif ?? '').trim();
  const fondes = reproches.filter((r) => r.fonde);

  let decision = b.decision as Decision;
  if (horsSujet) decision = 'rejeter';
  if (decision === 'publier' && fondes.length > 0) decision = 'corriger';
  if (decision === 'corriger' && consignes.length === 0) {
    if (fondes.length === 0) return null;
    consignes.push(...fondes.map((r) => `Retirer ou reformuler d'après le dossier : ${r.reproche}`));
  }
  if (sansCorrection && decision === 'corriger') decision = 'rejeter';

  return {
    decision,
    hors_sujet: horsSujet,
    reproches,
    consignes: decision === 'corriger' ? consignes : [],
    motif: motif || (horsSujet ? 'Hors sujet : le récit ne parle pas de la ville.' : ''),
  };
}
