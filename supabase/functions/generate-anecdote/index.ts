// Génère une anecdote pour une ville et l'enregistre en `draft`.
//
// Le principe : le modèle n'écrit jamais de mémoire. On lui donne d'abord des
// textes qui existent, il rédige à partir d'eux, et il doit recopier mot pour
// mot les phrases sur lesquelles il s'appuie. On vérifie ensuite ces citations
// par simple comparaison de chaînes — pas par jugement d'un modèle.
//
//   1. ancrage      — Wikipédia (article de la ville, son histoire, ses
//                     monuments liés) et base Mérimée (notices des monuments
//                     protégés, ministère de la Culture) ;
//   2. rédaction    — anecdote + citations verbatim tirées de ces articles ;
//   3. contrôle     — les citations existent-elles dans la source ? les
//                     millésimes du texte figurent-ils dans la source ?
//                     (déterministe, aucun modèle impliqué)
//   4. vérification — un second appel DeepSeek relit l'anecdote face à
//                     l'extrait et rend un verdict.
//
// Une anecdote dont les citations sont introuvables est rejetée : c'est le
// signe que le modèle a inventé. Ce qui survit reste malgré tout en `draft`,
// parce qu'un extrait Wikipédia n'est pas une validation éditoriale.
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// la fonction coûte de l'argent à chaque exécution et n'est pas destinée à
// être appelée depuis l'app.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, DEEPSEEK_MODEL, DeepSeekError } from './deepseek.ts';
import { fetchWikipediaDocs } from './wikipedia.ts';
import { fetchPatrimoineDocs } from './patrimoine.ts';
import type { SourceDoc } from './sources.ts';
import { controler, normalize } from './verification.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_COUNT = 10;

// Un récit de 320 à 400 mots, pas un paragraphe. Le plancher est là pour
// refuser un texte court : le modèle, faute de matière, a tendance à rendre
// trois phrases plutôt qu'à répondre trouve = false.
//
// 1700 et non 1200 : au plancher précédent, le modèle rendait systématiquement
// 1200 à 1500 caractères — il vise le minimum, il ne le dépasse pas. Les
// anecdotes qu'on veut pour modèle en font 1800 à 2100, et c'est cette
// longueur-là qui laisse la place aux dates, aux sommes et aux noms qui font
// qu'on retient quelque chose.
const MIN_BODY_CHARS = 1700;
const MAX_BODY_CHARS = 3800; // la table plafonne à 4000
const MAX_ACCROCHE_CHARS = 180;

// Enveloppes de dossier, par origine : sans réservation, Wikipédia remplirait
// tout et les notices Mérimée n'atteindraient jamais le modèle.
const MAX_CHARS_WIKIPEDIA = 70000;
const MAX_CHARS_MERIMEE = 12000;

/** Tronque une liste de documents à un budget global de caractères. */
function budget(docs: SourceDoc[], max: number): SourceDoc[] {
  let total = 0;
  const retenus: SourceDoc[] = [];
  for (const doc of docs) {
    if (total >= max) break;
    const extract = doc.extract.slice(0, max - total);
    retenus.push({ ...doc, extract });
    total += extract.length;
  }
  return retenus;
}

/**
 * Le dossier soumis au modèle. Les deux sources sont interrogées en parallèle
 * et indépendamment : si l'une échoue, l'autre fait le travail.
 */
async function buildDossier(city: string, exclure: string[]): Promise<SourceDoc[]> {
  const [wiki, merimee] = await Promise.allSettled([
    fetchWikipediaDocs(city, exclure),
    fetchPatrimoineDocs(city),
  ]);

  if (wiki.status === 'rejected') console.error('Wikipédia', wiki.reason);
  if (merimee.status === 'rejected') console.error('Mérimée', merimee.reason);

  return [
    ...budget(wiki.status === 'fulfilled' ? wiki.value : [], MAX_CHARS_WIKIPEDIA),
    ...budget(merimee.status === 'fulfilled' ? merimee.value : [], MAX_CHARS_MERIMEE),
  ];
}

// ---------------------------------------------------------------- passe 1

const REDACTION_SYSTEM = `Tu racontes des histoires vraies d'histoire locale à partir d'un dossier documentaire qu'on te fournit. Tu ne disposes d'aucune autre source, et ta mémoire ne fait pas foi : tout ce que tu écris doit se trouver dans le dossier.

Ce qui fait un bon sujet : une coutume disparue, un épisode historique daté, l'origine d'un toponyme, un usage oublié d'un bâtiment, une prouesse technique, un objet qui a survécu. Pas de généralité géographique, pas de guide touristique, pas de démographie.

FORME ATTENDUE

- "titre" : 2 à 6 mots, sans point final. C'est une étiquette courte, reprise dans la notification quotidienne — surtout pas une phrase.
- "accroche" : une seule phrase de 12 à 25 mots, sans point final. Elle part d'aujourd'hui et du concret — ce qu'on voit, ce qu'on traverse, ce qu'on ignore en passant — et annonce la surprise sans la déflorer.
- "corps" : 320 à 400 mots, en 4 ou 5 paragraphes séparés par une ligne vide. En dessous de 320 mots le récit est toujours trop maigre : c'est le signe qu'il manque des dates, des sommes ou des noms que le dossier contient pourtant.

COMMENT RACONTER

Premier paragraphe : pars d'un geste ordinaire d'aujourd'hui — ce qu'on longe, ce qu'on traverse, ce devant quoi on passe sans le voir — puis installe l'étonnement. Ce geste doit rester dans ce que le dossier décrit : le bâtiment qu'il mentionne, la rue qu'il nomme, l'objet qu'il situe.
Interdit d'ouvrir par une situation géographique générique. « Au cœur du centre historique de X », « Située en Bretagne, la ville de X », « Dans le centre-ville de X » : ces formules sont bannies. On commence par quelqu'un qui fait quelque chose, ou par l'objet lui-même.
Paragraphes du milieu : déroule l'histoire dans l'ordre, avec ses dates, ses noms, ses chiffres. Ce sont les détails précis qui font qu'on retient — une dimension, un coût, le nom de l'ingénieur, la durée d'un chantier, le nombre de pièces. Ne résume pas ce que le dossier détaille : si tu connais la somme exacte, écris-la ; si tu connais le jour, écris le jour. Un récit qui dit « au XVIIIe siècle » quand le dossier dit « le 15 septembre 1763 » a perdu ce qui faisait son intérêt.
Dernier paragraphe : ce qu'il en reste aujourd'hui. La dernière phrase apporte un renversement, ou un détail concret qu'on n'attendait pas — pris dans le dossier, jamais ajouté par toi, et jamais une conclusion générale.

Présent de narration pour la colonne vertébrale du récit, y compris pour les événements anciens : « les cloches sonnent », jamais « les cloches se mirent à sonner ». Pas de passé simple, pas d'imparfait narratif.
Les autres temps restent permis pour ce qui encadre ce récit : ce qui le précède, ce qu'il advient ensuite, ce qu'il en reste. « Il ne repartira plus jamais », « la maison a été détruite en 1944 », « la boucle était bouclée » sont justes à leur place. Le présent est la règle du déroulé, pas une contrainte sur la phrase finale.

Aucune morale, aucun « saviez-vous que », aucune question rhétorique, aucune adresse au lecteur.

RÈGLES ABSOLUES

- N'écris aucune date, aucun chiffre, aucun nom propre qui ne figure pas dans le dossier. Cela vaut pour l'accroche autant que pour le corps.
- L'interdiction couvre aussi ce qui n'est ni date, ni chiffre, ni nom : la situation d'un lieu, une comparaison, une appréciation. Écrire « sur les hauteurs de la ville » quand le dossier dit « au pied du coteau » est une faute au même titre qu'une date inventée. Écrire « quinze mètres de plus que la cathédrale » suppose que le dossier donne les deux longueurs, pas une seule. Dans le doute, écris ce que le dossier dit, avec ses mots.
- L'accroche et la dernière phrase obéissent aux mêmes règles que le reste — et c'est là qu'on les enfreint. Le geste d'aujourd'hui comme le renversement final se prennent dans le dossier, jamais dans ce que tu crois savoir du lieu. Si le dossier ne fournit pas de quoi les écrire, écris-en une plus plate plutôt qu'une plus belle : une accroche sans effet est réparable, une accroche fausse fait rejeter tout le texte.
- Recopie dans "citations" les phrases exactes du dossier qui établissent ton récit — caractère pour caractère, sans reformuler, sans couper un mot, sans corriger la ponctuation. Elles sont comparées automatiquement au dossier : une citation approximative fait rejeter tout le travail.
- Il te faut au moins trois citations distinctes, couvrant les affirmations principales du récit.
- Si le dossier ne permet pas d'écrire 320 mots sans rien inventer, renvoie trouve = false. C'est une réponse acceptable et attendue : mieux vaut rien qu'un récit brodé.

Réponds uniquement par un objet json de cette forme :
{
  "trouve": true,
  "titre": "L'usine sous la route",
  "accroche": "Sur la route Saint-Malo–Dinard, on roule au-dessus de la plus grande centrale marémotrice du monde",
  "corps": "…",
  "periode": "1961–1966",
  "citations": ["phrase exacte tirée du dossier", "autre phrase exacte", "troisième phrase exacte"],
  "raison": ""
}

Si trouve vaut false, renseigne raison et laisse les autres champs vides.`;

interface Redaction {
  trouve: boolean;
  titre: string;
  accroche: string;
  corps: string;
  periode: string;
  citations: string[];
  raison: string;
}

// ---------------------------------------------------------------- passe 2

const VERIFICATION_SYSTEM = `Tu es vérificateur de faits. On te donne un dossier documentaire et une anecdote rédigée par quelqu'un d'autre. Ton travail est de contester l'anecdote, pas de la valider par politesse.

La seule question qui compte : chaque affirmation de l'anecdote est-elle soutenue par le dossier ? Ce que tu crois savoir par ailleurs ne compte pas. Une affirmation absente du dossier est un problème, même si elle te paraît vraie.

Vérifie en particulier les dates, les chiffres, les noms propres, et les liens de cause à effet — un texte peut n'utiliser que des éléments présents dans le dossier tout en affirmant entre eux un rapport que le dossier n'établit pas.

Sois bref : trois problèmes au maximum, une phrase chacun, sans recopier de longs passages.

Verdicts :
- "confirme" : tout est soutenu par le dossier.
- "doute" : le fond est soutenu, mais un détail est absent du dossier ou déformé.
- "refute" : une affirmation contredit le dossier, ou l'essentiel n'y figure pas.

Réponds uniquement par un objet json de cette forme :
{
  "verdict": "doute",
  "confiance": "moyenne",
  "problemes": ["le lien entre X et Y n'est pas établi par le dossier"],
  "notes": "Bref commentaire pour le relecteur humain."
}

confiance vaut haute, moyenne ou faible.`;

interface Verification {
  verdict: 'confirme' | 'doute' | 'refute';
  confiance: 'haute' | 'moyenne' | 'faible';
  problemes: string[];
  notes: string;
}

// ----------------------------------------------------------------- prompts

function dossier(docs: SourceDoc[]): string {
  return docs
    .map((doc) => `=== ${doc.title} — ${doc.editeur} (${doc.url}) ===\n${doc.extract}`)
    .join('\n\n');
}

function redactionPrompt(city: string, docs: SourceDoc[], existingTitles: string[]): string {
  // Sans cette consigne, le modèle revient au document le plus volumineux du
  // dossier et enchaîne trois anecdotes sur le même monument : éviter un titre
  // déjà pris ne suffit pas, il faut demander de changer de document.
  const dejaVues =
    existingTitles.length > 0
      ? `\n\nAnecdotes déjà enregistrées pour cette ville :\n${existingTitles
          .map((t) => `- ${t}`)
          .join('\n')}\n\nChoisis un sujet tiré d'un AUTRE document du dossier que ceux-là. Le dossier compte plusieurs articles : sers-t'en.`
      : '';

  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

Écris une anecdote d'histoire locale sur ${city}, uniquement à partir du dossier ci-dessus. Réponds en json.${dejaVues}`;
}

function verificationPrompt(city: string, redaction: Redaction, docs: SourceDoc[]): string {
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

ANECDOTE À VÉRIFIER
Titre : ${redaction.titre}
Accroche : ${redaction.accroche}
Période annoncée : ${redaction.periode}

${redaction.corps}

Vérifie chaque affirmation contre le dossier — l'accroche compte autant que le corps — et réponds en json.`;
}

// ------------------------------------------------------------- génération

type Resultat =
  | { ok: true; redaction: Redaction; verification: Verification; citations: string[] }
  | { ok: false; reason: string };

async function generateOne(
  apiKey: string,
  city: string,
  docs: SourceDoc[],
  existingTitles: string[]
): Promise<Resultat> {
  const redaction = await chatJSON<Redaction>({
    apiKey,
    system: REDACTION_SYSTEM,
    user: redactionPrompt(city, docs, existingTitles),
    // Le dossier borne déjà le contenu ; un peu de liberté sert seulement à
    // ne pas ressortir toujours le même passage.
    temperature: 0.7,
    maxTokens: 3000,
  });

  if (!redaction?.trouve) {
    return { ok: false, reason: redaction?.raison || "Rien d'exploitable dans le dossier." };
  }

  const titre = String(redaction.titre ?? '').trim();
  const accroche = String(redaction.accroche ?? '').trim();
  const corps = String(redaction.corps ?? '').trim();

  if (!titre) {
    return { ok: false, reason: 'Titre manquant.' };
  }
  if (!accroche || accroche.length > MAX_ACCROCHE_CHARS) {
    return { ok: false, reason: `Accroche absente ou trop longue (${accroche.length} caractères).` };
  }
  if (corps.length < MIN_BODY_CHARS || corps.length > MAX_BODY_CHARS) {
    return {
      ok: false,
      reason: `Corps hors format : ${corps.length} caractères, attendu entre ${MIN_BODY_CHARS} et ${MAX_BODY_CHARS}.`,
    };
  }

  const clean: Redaction = {
    ...redaction,
    titre,
    accroche,
    corps,
    periode: String(redaction.periode ?? '').trim(),
  };

  const sourceText = docs.map((d) => d.extract).join('\n\n');
  const controle = controler(clean, sourceText);
  if (!controle.ok) {
    return { ok: false, reason: controle.reason! };
  }

  // 2500 et non 800 : le vérificateur cite les passages qu'il conteste, et un
  // récit de 400 mots lui en donne beaucoup plus qu'un paragraphe. À 800, sa
  // réponse était coupée en plein JSON — l'erreur remontait alors comme un
  // « JSON invalide renvoyé par DeepSeek » qui ne disait rien de la cause.
  let verification: Verification;
  try {
    verification = await chatJSON<Verification>({
      apiKey,
      system: VERIFICATION_SYSTEM,
      user: verificationPrompt(city, clean, docs),
      temperature: 0,
      maxTokens: 2500,
    });
  } catch (err) {
    // Une vérification ratée ne condamne que cette anecdote. Auparavant elle
    // remontait jusqu'à l'appelant et emportait toute la ville : sur un lot de
    // trois, une réponse malformée en faisait perdre trois.
    return {
      ok: false,
      reason: `Vérification impossible : ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (verification?.verdict === 'refute') {
    return {
      ok: false,
      reason: `Rejetée à la vérification : ${(verification.problemes ?? []).join(' ; ') || verification.notes || 'contredit le dossier'}`,
    };
  }

  return { ok: true, redaction: clean, verification, citations: controle.citationsValides };
}

// -------------------------------------------------------------------- HTTP

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }
  if (!DEEPSEEK_API_KEY) {
    return fail("DEEPSEEK_API_KEY n'est pas configurée sur la fonction.", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Corps de requête JSON invalide.');
  }

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const cityPlaceId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_COUNT);

  if (!city) {
    return fail('Paramètre `city` manquant.');
  }

  // L'existant est lu AVANT le dossier : ce sont les articles déjà exploités
  // qui déterminent lesquels on va chercher. C'est ce qui fait tourner le
  // corpus d'une génération à l'autre, et rend atteignables trente anecdotes
  // par ville — sans quoi le modèle revient au même monument indéfiniment.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const existingQuery = supabase.from('anecdotes').select('title, sources').limit(500);
  const { data: existing } = cityPlaceId
    ? await existingQuery.eq('city_place_id', cityPlaceId)
    : await existingQuery.eq('city', city);

  const titles: string[] = (existing ?? []).map((row) => row.title);

  const articlesExploites = [
    ...new Set(
      (existing ?? []).flatMap((row) =>
        ((row.sources ?? []) as Array<{ titre?: string }>)
          .map((s) => s.titre)
          .filter((t): t is string => typeof t === 'string')
      )
    ),
  ];

  let docs: SourceDoc[];
  try {
    docs = await buildDossier(city, articlesExploites);
  } catch (err) {
    console.error('Dossier', err);
    return json(
      { created: 0, skipped: [], error: `Ancrage documentaire indisponible : ${err}` },
      502
    );
  }

  // Pas de dossier, pas d'anecdote : on ne retombe jamais sur la mémoire du
  // modèle, c'est précisément ce qu'on cherche à éviter.
  if (docs.length === 0) {
    return json({
      created: 0,
      skipped: [
        `Aucune source neuve pour « ${city} » : les ${articlesExploites.length} articles disponibles ont tous été exploités.`,
      ],
      anecdotes: [],
    });
  }
  const created: unknown[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    let result: Resultat;
    try {
      result = await generateOne(DEEPSEEK_API_KEY, city, docs, titles);
    } catch (err) {
      const message = err instanceof DeepSeekError ? err.message : String(err);
      console.error('DeepSeek', message);
      return json({ created: created.length, skipped, error: message }, 502);
    }

    if (!result.ok) {
      skipped.push(result.reason);
      continue;
    }

    const { redaction, verification, citations } = result;

    // Ne créditer que les documents qui portent réellement une citation
    // vérifiée, du plus contributif au moins.
    //
    // Le dossier compte six ou huit articles, et l'anecdote n'en exploite
    // presque jamais plus d'un. Créditer tout le dossier produisait une ligne
    // « Wikipédia — Paris ; Wikipédia — Histoire de Paris ; … » illisible, et
    // surtout un lien « Source » pointant vers l'article général de la ville —
    // où le lecteur venu vérifier ne trouvait pas le fait annoncé. Une source
    // qu'on ne peut pas vérifier ne vaut pas mieux que pas de source.
    const contributions = docs
      .map((doc) => {
        const extrait = normalize(doc.extract);
        return { doc, poids: citations.filter((c) => extrait.includes(normalize(c))).length };
      })
      .filter((c) => c.poids > 0)
      .sort((a, b) => b.poids - a.poids);

    // Filet : les citations ont été validées contre la concaténation du
    // dossier, une seule pourrait théoriquement chevaucher deux documents.
    const retenus = contributions.length > 0 ? contributions.map((c) => c.doc) : [docs[0]];

    const sources = retenus.map((doc) => ({
      url: doc.url,
      titre: doc.title,
      editeur: doc.editeur,
    }));

    const notes = [
      `Verdict : ${verification.verdict} (confiance ${verification.confiance}).`,
      ...(verification.problemes ?? []),
      verification.notes ?? '',
      `Citations vérifiées automatiquement dans la source (${citations.length}) :`,
      ...citations.map((c) => `« ${c} »`),
    ]
      .filter(Boolean)
      .join('\n');

    const { data: inserted, error } = await supabase
      .from('anecdotes')
      .insert({
        city,
        city_place_id: cityPlaceId,
        title: redaction.titre,
        hook: redaction.accroche,
        body: redaction.corps,
        period: redaction.periode || null,
        source: sources.map((s) => `${s.editeur} — ${s.titre}`).join(' ; '),
        source_url: sources[0].url,
        sources,
        confidence: verification.confiance ?? 'faible',
        // Le verdict a sa colonne depuis que la publication peut se faire sans
        // relecture : `valider_automatiquement` n'accepte qu'un `confirme` en
        // confiance haute, et lire cette condition dans une phrase française
        // de `verification_notes` reviendrait à publier au gré d'une
        // reformulation du prompt.
        verdict: verification.verdict,
        verification_notes: notes,
        generated_by: `deepseek:${DEEPSEEK_MODEL} + ${[...new Set(docs.map((d) => d.origine))].join('+')}`,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      // 23505 = index unique (city_place_id, lower(title)) : déjà générée.
      if (error.code === '23505') {
        skipped.push(`Doublon : « ${redaction.titre} »`);
      } else {
        console.error('Insertion échouée', error);
        return json({ created: created.length, skipped, error: error.message }, 500);
      }
    } else {
      created.push(inserted);
      titles.push(redaction.titre);
    }
  }

  return json({
    created: created.length,
    // Rend visible ce qui a réellement nourri le modèle : c'est ici qu'on voit
    // si Mérimée a répondu, et avec quel volume.
    dossier: docs.map((d) => ({
      origine: d.origine,
      titre: d.title,
      url: d.url,
      caracteres: d.extract.length,
    })),
    skipped,
    anecdotes: created,
  });
});
