// La rédaction, contrôlée comme les sources : par des règles, pas par un avis.
//
// `verification.ts` répond à « est-ce vrai ? ». Ce fichier répond à « est-ce
// écrit comme on l'a demandé ? » — la forme que le prompt de rédaction impose
// (longueur, paragraphes, voix impersonnelle, zéro affect) et que le modèle
// oublie une fois sur cinq. Une anecdote qui échoue ici n'est pas publiée : elle
// repart en correction avec la liste exacte de ce qui ne va pas.
//
// L'orthographe n'est pas contrôlable par des règles : c'est le vérificateur
// qui la relève (champ `fautes`), et la publication exige qu'il n'en trouve
// aucune.
//
// Aucune API Deno ici : les tests tournent sous Node, comme `verification.ts`.

// 220 depuis le 2 octobre, avec le plancher en caractères de `index.ts`.
export const MIN_MOTS = 220;
export const MAX_MOTS = 430;
export const MIN_PARAGRAPHES = 4;
export const MAX_PARAGRAPHES = 5;
export const MIN_MOTS_ACCROCHE = 10;
export const MAX_MOTS_ACCROCHE = 28;
export const MAX_TITRE_CHARS = 140;

// Formes fléchies comprises : « remarquables », « étonnante ».
const AFFECT =
  /(?<![\p{L}])(incroyables?|fascinant(?:e|s|es)?|étonnant(?:e|s|es)?|tragiques?|remarquables?|exceptionnel(?:le|s|les)?)(?![\p{L}])/giu;

// Des labels officiels, pas des jugements : « Jardin remarquable »,
// « Site patrimonial remarquable », « Arbre remarquable ».
const LABELS = /(?<![\p{L}])(jardins?|arbres?|site patrimonial|sites patrimoniaux)\s+remarquables?(?![\p{L}])/giu;

// Les seuls qu'on sache remplacer sans relire la phrase : même nature, même
// accord, même sens à peu près. Les autres (« tragique », « étonnant »)
// changent la phrase et restent au modèle.
const SUBSTITUTS: Record<string, string> = {
  remarquable: 'notable',
  remarquables: 'notables',
  exceptionnel: 'hors norme',
  exceptionnelle: 'hors norme',
  exceptionnels: 'hors norme',
  exceptionnelles: 'hors norme',
};
const SUBSTITUABLES = /(?<![\p{L}])(remarquables?|exceptionnel(?:le|s|les)?)(?![\p{L}])/giu;

/**
 * Remplace « remarquable » et « exceptionnel » hors citations et hors labels.
 *
 * Le 8 octobre, deux anecdotes d'Arcachon ont été rejetées après trois
 * corrections pour « les styles les plus remarquables de la ville » : la
 * phrase vient de l'article, le modèle la reprend à chaque réécriture, et la
 * règle la refuse à chaque fois. Un mot à changer ne vaut pas une anecdote.
 */
export function neutraliserAffects(texte: string): string {
  return texte
    .split(/(«[^»]*»|“[^”]*”|"[^"]*")/)
    .map((morceau, i) => {
      if (i % 2 === 1) return morceau; // une citation : intouchable
      const labels: string[] = [];
      const protege = morceau.replace(LABELS, (m) => `\uE000${labels.push(m) - 1}\uE000`);
      return protege
        .replace(SUBSTITUABLES, (mot) => {
          const sub = SUBSTITUTS[mot.toLowerCase()];
          return mot[0] === mot[0].toUpperCase() ? sub[0].toUpperCase() + sub.slice(1) : sub;
        })
        .replace(/\uE000(\d+)\uE000/g, (_, n) => labels[Number(n)]);
    })
    .join('');
}

/**
 * Découpe un paragraphe en phrases. Prudente : un point suivi d'une
 * majuscule ne coupe pas après une initiale (« M. Dupont », « J.-C. ») ni
 * après une abréviation d'une ou deux lettres (« s. », « av. »).
 */
export function phrases(paragraphe: string): string[] {
  const morceaux = paragraphe.split(/(?<=[.!?…»])\s+(?=[A-ZÀÂÉÈÊÎÔÙÛÇ«"0-9])/u);
  const fusion: string[] = [];
  for (const m of morceaux) {
    const precedent = fusion[fusion.length - 1];
    if (precedent && /(?:^|[\s(.-])\p{L}{1,2}\.$/u.test(precedent)) {
      fusion[fusion.length - 1] = `${precedent} ${m}`;
    } else {
      fusion.push(m);
    }
  }
  return fusion;
}

/** Ce qu'une phrase apporte : des dates, des chiffres, des noms propres. */
function poids(phrase: string): number {
  const chiffres = (phrase.match(/\d+/g) ?? []).length;
  const noms = (phrase.slice(1).match(/(?<![.!?]\s)\b\p{Lu}\p{Ll}+/gu) ?? []).length;
  return chiffres * 3 + noms;
}

/**
 * Ramène un corps trop long sous `cible` mots en retirant des phrases, sans
 * modèle : on ne fait qu'enlever, donc rien de non sourcé ne peut entrer.
 *
 * Le 9 octobre, « La meute qui gardait Saint-Malo » a été rejetée à 449
 * puis 448 mots (plafond 430) après deux passes de resserrement par le
 * modèle, qui raccourcit à peine. Dix-huit mots à retirer ne valaient pas
 * une anecdote.
 *
 * Règles : le premier paragraphe (l'attaque) et le dernier (ce qu'il en
 * reste) ne sont pas touchés ; dans ceux du milieu, la première phrase reste
 * (elle porte le pivot) ; on retire d'abord les phrases qui pèsent le moins
 * (sans date, sans chiffre, sans nom), les plus longues d'abord à poids
 * égal. Rend null si la cible est hors d'atteinte sans vider un paragraphe.
 */
export function couperAuFormat(corps: string, cible = MAX_MOTS - 10): string | null {
  const paragraphes = corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (mots(corps) <= cible) return corps;
  if (paragraphes.length < 3) return null;

  const decoupe = paragraphes.map((p) => phrases(p));
  type Candidate = { p: number; i: number; poids: number; mots: number };
  const candidates: Candidate[] = [];
  for (let p = 1; p < decoupe.length - 1; p++) {
    for (let i = 1; i < decoupe[p].length; i++) {
      candidates.push({ p, i, poids: poids(decoupe[p][i]), mots: mots(decoupe[p][i]) });
    }
  }
  candidates.sort((a, b) => a.poids - b.poids || b.mots - a.mots);

  const retirees = new Set<string>();
  let total = mots(corps);
  for (const c of candidates) {
    if (total <= cible) break;
    if (total - c.mots < MIN_MOTS) continue;
    retirees.add(`${c.p}:${c.i}`);
    total -= c.mots;
  }
  if (total > cible) return null;

  return decoupe
    .map((ph, p) => ph.filter((_, i) => !retirees.has(`${p}:${i}`)).join(' '))
    .join('\n\n');
}

const PRONOMS = /(?<![\p{L}])(je|j'|j’|nous|vous)(?![\p{L}])/giu;

const OUVERTURES_BANNIES = [/^au c(œ|oe)ur d/i, /^situé(e)? (en|à|au|dans)/i, /^dans le centre/i];

export interface ARediger {
  titre: string;
  accroche: string;
  corps: string;
}

export interface Qualite {
  ok: boolean;
  problemes: string[];
}

function mots(texte: string): number {
  const t = texte.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Le texte de l'auteur, sans ce qu'il cite. Un « nous » ou un point
 * d'interrogation entre guillemets appartient à la personne citée — le
 * récit, lui, reste impersonnel.
 */
export function horsCitations(texte: string): string {
  return texte.replace(/«[^»]*»/g, ' ').replace(/“[^”]*”/g, ' ').replace(/"[^"]*"/g, ' ');
}

export function controlerRedaction(r: ARediger): Qualite {
  const problemes: string[] = [];
  const titre = r.titre.trim();
  const accroche = r.accroche.trim();
  const corps = r.corps.trim();

  if (!titre) problemes.push('Titre absent.');
  if (titre.length > MAX_TITRE_CHARS) {
    problemes.push(`Titre trop long (${titre.length} caractères, maximum ${MAX_TITRE_CHARS}).`);
  }
  if (/[.]$/.test(titre)) problemes.push('Le titre se termine par un point.');

  const motsAccroche = mots(accroche);
  if (motsAccroche < MIN_MOTS_ACCROCHE || motsAccroche > MAX_MOTS_ACCROCHE) {
    problemes.push(
      `Accroche de ${motsAccroche} mots, attendu entre ${MIN_MOTS_ACCROCHE} et ${MAX_MOTS_ACCROCHE}.`
    );
  }
  if (/[.]$/.test(accroche)) problemes.push("L'accroche se termine par un point.");

  const motsCorps = mots(corps);
  if (motsCorps < MIN_MOTS || motsCorps > MAX_MOTS) {
    problemes.push(`Corps de ${motsCorps} mots, attendu entre ${MIN_MOTS} et ${MAX_MOTS}.`);
  }

  const paragraphes = corps.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (paragraphes < MIN_PARAGRAPHES || paragraphes > MAX_PARAGRAPHES) {
    problemes.push(
      `${paragraphes} paragraphe(s), attendu ${MIN_PARAGRAPHES} ou ${MAX_PARAGRAPHES}, séparés par une ligne vide.`
    );
  }

  if (/\*\*|__|^#|^\s*[-*] /m.test(corps)) {
    problemes.push('Mise en forme Markdown dans le corps (gras, titre ou liste).');
  }

  if (OUVERTURES_BANNIES.some((re) => re.test(corps))) {
    problemes.push(`Ouverture par une situation géographique générique : « ${corps.slice(0, 40)}… ».`);
  }

  const texteAuteur = horsCitations(`${accroche}\n${corps}`).replace(LABELS, ' ');

  const affects = [...new Set([...texteAuteur.matchAll(AFFECT)].map((m) => m[1].toLowerCase()))];
  if (affects.length > 0) {
    problemes.push(`Adjectif(s) d'affect interdit(s) : ${affects.join(', ')}.`);
  }

  const pronoms = [...new Set([...texteAuteur.matchAll(PRONOMS)].map((m) => m[1].toLowerCase()))];
  if (pronoms.length > 0) {
    problemes.push(`Voix personnelle (${pronoms.join(', ')}) : le récit doit rester impersonnel.`);
  }

  if (texteAuteur.includes('?')) {
    problemes.push('Question posée au lecteur : aucune question rhétorique.');
  }
  if (/saviez-vous/i.test(texteAuteur)) {
    problemes.push('Formule « saviez-vous » interdite.');
  }

  return { ok: problemes.length === 0, problemes };
}
