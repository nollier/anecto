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
// Publiable = verdict `confirme`, confiance `haute`, aucune faute relevée par
// le vérificateur, et rédaction conforme aux règles de `qualite.ts`. Tout
// brouillon qui n'y est pas repasse par le mode `corriger` (voir plus bas) :
// on donne au modèle la liste exacte de ce qui ne va pas, il réécrit, on
// recontrôle tout. Trois tentatives, puis rejet motivé.
//
// Chaque appel laisse une ligne dans `lots_generation` : demandé, obtenu, et
// la raison de chaque anecdote écartée. Un lot de dix qui en rend trois se
// lit dans le rapport du lendemain, plus seulement dans une réponse HTTP que
// personne ne regarde.
//
// Le corps de la requête accepte `axe` : `patrimoine` (défaut, le
// comportement d'origine) ou `personnalites`. Il choisit le gisement
// Wikipédia du dossier, et avec lui ce dont l'anecdote parlera. Une ville
// dont les trente anecdotes décrivent toutes une façade se relance sur
// l'autre axe sans que rien d'autre ne bouge.
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// la fonction coûte de l'argent à chaque exécution et n'est pas destinée à
// être appelée depuis l'app.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, DEEPSEEK_MODEL, DeepSeekError } from './deepseek.ts';
import { type Axe, fetchExtract, fetchWikipediaDocs } from './wikipedia.ts';
import { fetchPatrimoineDocs } from './patrimoine.ts';
import type { SourceDoc } from './sources.ts';
import { controler, normalize } from './verification.ts';
import { controlerRedaction, MAX_MOTS, MIN_MOTS, type Qualite } from './qualite.ts';
import {
  articleDejaTraite,
  DOUBLON_SYSTEM,
  doublonPrompt,
  estArticleGeneral,
  type Existante,
} from './doublons.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_COUNT = 10;
// Sous la limite de 150 s d'une Edge Function, marge comprise pour le
// dernier récit commencé.
const BUDGET_LOT_MS = 100_000;

const client = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
type Db = ReturnType<typeof client>;

// Un récit de 240 à 400 mots, pas un paragraphe. Le plancher est là pour
// refuser un texte court : le modèle, faute de matière, a tendance à rendre
// trois phrases plutôt qu'à répondre trouve = false.
//
// 1700 et non 1200 : au plancher précédent, le modèle rendait systématiquement
// 1200 à 1500 caractères — il vise le minimum, il ne le dépasse pas. Les
// anecdotes qu'on veut pour modèle en font 1800 à 2100, et c'est cette
// longueur-là qui laisse la place aux dates, aux sommes et aux noms qui font
// qu'on retient quelque chose.
//
// 1300 depuis le 2 octobre : à 1700, Arcachon et Lille ne sortaient plus
// rien. Leurs articles de monuments font 1 400 à 2 000 caractères, trop peu
// pour 320 mots sans broder, et l'allongement renonçait à juste titre. Mieux
// vaut un récit de 250 mots tenu qu'une ville à sec.
const MIN_BODY_CHARS = 1300;
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
// Communes dont le nom seul mène ailleurs sur Wikipédia. « Saint-Paul »
// est une page d'homonymie : la recherche ramenait Paul de Tarse, la
// basilique de Rome ou Saint-Paul-de-Vence pour une ville qui est à La
// Réunion. Clé : le place_id Google de la ville.
const TITRES_WIKIPEDIA: Record<string, string> = {
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ': 'Saint-Paul (La Réunion)',
};

async function buildDossier(
  city: string,
  exclure: string[],
  axe: Axe,
  cityPlaceId: string | null = null
): Promise<SourceDoc[]> {
  // Mérimée ne décrit que des immeubles protégés : sur l'axe des
  // personnalités, ses notices n'apportent rien et occupent 12 000 caractères
  // du dossier. On ne l'interroge pas, et on économise l'appel.
  const [wiki, merimee] = await Promise.allSettled([
    fetchWikipediaDocs(city, exclure, axe, cityPlaceId ? TITRES_WIKIPEDIA[cityPlaceId] : undefined),
    axe === 'personnalites' ? Promise.resolve([]) : fetchPatrimoineDocs(city, exclure),
  ]);

  if (wiki.status === 'rejected') console.error('Wikipédia', wiki.reason);
  if (merimee.status === 'rejected') console.error('Mérimée', merimee.reason);

  return [
    ...budget(wiki.status === 'fulfilled' ? wiki.value : [], MAX_CHARS_WIKIPEDIA),
    ...budget(merimee.status === 'fulfilled' ? merimee.value : [], MAX_CHARS_MERIMEE),
  ];
}

// ---------------------------------------------------------------- passe 1

// Le seul passage qui change d'un axe à l'autre. Le reste du prompt — forme,
// temps, interdits, format json — vaut pour les deux : ce qu'on change, c'est
// ce qu'on cherche dans le dossier, pas la manière de le raconter.
//
// Sans cette substitution, un dossier de biographies rendait quand même des
// anecdotes de bâtiment : le modèle suivait la liste de sujets du prompt, y
// pêchait « un usage oublié d'un bâtiment », et allait le chercher dans la
// seule phrase de l'article qui mentionnait une adresse.
const SUJETS: Record<Axe, string> = {
  patrimoine:
    "Ce qui fait un bon sujet : une coutume disparue, un épisode historique daté, l'origine d'un toponyme, un usage oublié d'un bâtiment, une prouesse technique, un objet qui a survécu. Pas de généralité géographique, pas de guide touristique, pas de démographie.",
  personnalites:
    "Le dossier porte sur des gens, et c'est d'eux qu'il faut parler. Ce qui fait un bon sujet : un épisode daté de la vie de quelqu'un, un métier qu'on ne fait plus, une décision qui a coûté cher, une rencontre, une œuvre et ce qu'elle est devenue, ce qui porte encore son nom dans la ville. Une biographie n'est pas une anecdote : ne déroule pas une vie de la naissance à la mort, prends un épisode et raconte-le. Pas de palmarès, pas de liste d'œuvres, pas de généralité géographique, pas de guide touristique, pas de démographie.\n\nL'épisode que tu racontes doit se passer dans la ville demandée, ou s'y rattacher directement : la personne y naît, y meurt, y vit, y exerce, ou y laisse quelque chose qui porte son nom. Un article du dossier peut parler surtout d'ailleurs — un fief, une bataille, une commune voisine qui doit son nom au personnage. Celui-là ne fait pas d'anecdote pour cette ville : passe au suivant, et si aucun ne s'y rattache, renvoie trouve = false.",
};

const redactionSystem = (axe: Axe) =>
  `Tu racontes des histoires vraies d'histoire locale à partir d'un dossier documentaire qu'on te fournit. Tu ne disposes d'aucune autre source, et ta mémoire ne fait pas foi : tout ce que tu écris doit se trouver dans le dossier.

${SUJETS[axe]}

TON : CHRONIQUE DOCUMENTAIRE IMMERSIVE

Un récit au présent de narration, factuel et daté, qui raconte un lieu comme on raconte une histoire : sans émotion ajoutée, sans morale, sans « je ». C'est le ton d'un bon article de magazine d'histoire locale : précis comme une notice, fluide comme un récit.

FORME ATTENDUE

- "titre" : un hook à deux temps — élément concret, puis rebondissement. Le contraste fait l'accroche. Exemples : « Le fort bâti pour barrer la route aux Anglais est devenu le temple du rock anglo-saxon », « Madras pris pour le roi : récompensé par trois ans de Bastille ». Pas de point final.
- "accroche" : une seule phrase de 12 à 25 mots, sans point final. Elle plante le décor directement dans le sujet, par un lieu ou une date — aucun préambule.
- "corps" : 240 à 400 mots, en 4 ou 5 paragraphes séparés par une ligne vide. En dessous de 240 mots le récit est toujours trop maigre : c'est le signe qu'il manque des dates, des sommes ou des noms que le dossier contient pourtant.

COMMENT RACONTER

Attaque : directement dans le sujet. Le premier mot est déjà dedans, avec un lieu ou une date. Aucune introduction, aucun préambule. Interdit d'ouvrir par une situation géographique générique. « Au cœur du centre historique de X », « Située en Bretagne, la ville de X », « Dans le centre-ville de X » : ces formules sont bannies. On commence par quelqu'un qui fait quelque chose, ou par l'objet lui-même.

Paragraphes du milieu : déroule l'histoire dans l'ordre, avec ses dates, ses noms, ses chiffres. Le détail précis remplace l'adjectif. Là où un autre texte écrirait « une belle statue », écris « une Vierge de fonte argentée, haute de trois mètres ». Ne résume pas ce que le dossier détaille : si tu connais la somme exacte, écris-la ; si tu connais le jour, écris le jour. Un récit qui dit « au XVIIIe siècle » quand le dossier dit « le 15 septembre 1763 » a perdu ce qui faisait son intérêt.

Pivots temporels : pour changer d'époque, utilise de courtes phrases de bascule. « Puis vint la guerre. », « S'ensuit un siècle et demi de réemplois. », « C'est là qu'un festival s'en mêle. » Cinq mots, et on change de siècle. Ce rythme porte le récit.

Dernier paragraphe : ce qu'il en reste aujourd'hui. La dernière phrase est un fait, idéalement un lien avec aujourd'hui — jamais une conclusion générale, jamais une morale.

Vocabulaire précis, jamais décoratif : termes techniques assumés, non vulgarisés (chenal, môle, pétardage, déblaiement, quadrilatère de granit, brevet de capitaine). On ne simplifie pas pour le lecteur.

Zéro affect, zéro jugement : jamais « incroyable », « fascinant », « étonnant », « tragique », « remarquable », « exceptionnel ». Le drame est dans les faits, pas dans les adjectifs. Le lecteur ressent, l'auteur n'impose rien.

Présent de narration pour la colonne vertébrale du récit, y compris pour les événements anciens : « les cloches sonnent », jamais « les cloches se mirent à sonner ». Pas de passé simple, pas d'imparfait narratif.
Les autres temps restent permis pour ce qui encadre le récit : ce qui le précède, ce qu'il advient ensuite, ce qu'il en reste. Le présent est la règle du déroulé, pas une contrainte sur la phrase finale.

Voix impersonnelle : aucun « je », aucun « nous », aucun « vous ». Le récit est à la troisième personne. Le lecteur est spectateur, pas interlocuteur. Aucune morale, aucun « saviez-vous que », aucune question rhétorique, aucune adresse au lecteur.

RÈGLES ABSOLUES

- N'écris aucune date, aucun chiffre, aucun nom propre qui ne figure pas dans le dossier. Cela vaut pour l'accroche autant que pour le corps.
- Recopie dans "citations" les phrases exactes du dossier qui établissent ton récit — caractère pour caractère, sans reformuler, sans couper un mot, sans corriger la ponctuation. Elles sont comparées automatiquement au dossier : une citation approximative fait rejeter tout le travail.
- Il te faut au moins trois citations distinctes, couvrant les affirmations principales du récit.
- Si le dossier ne permet pas d'écrire 240 mots sans rien inventer, renvoie trouve = false. C'est une réponse acceptable et attendue : mieux vaut rien qu'un récit brodé.

ORTHOGRAPHE

- Écris en français correct avec tous les accents : à, é, è, ê, ù, ç, etc. Vérifie chaque « a » (verbe avoir) et « à » (préposition), chaque « ou » et « où ».
- Pas de faute de grammaire, pas d'accord manquant, pas d'apostrophe oubliée.

Réponds uniquement par un objet json de cette forme :
{
  "trouve": true,
  "titre": "Madras pris pour le roi : récompensé par trois ans de Bastille",
  "accroche": "Le 21 septembre 1746, un Malouin hisse le pavillon fleurdelisé sur le fort Saint-Georges de Madras",
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

Ce qui n'est PAS un problème, et ne doit ni figurer dans "problemes" ni abaisser le verdict :
- une omission : l'anecdote raconte un épisode, pas tout le dossier. Ne relève jamais ce qu'elle « omet », « ne précise pas » ou « ne mentionne pas ».
- une reformulation fidèle, un résumé, un ordre de récit différent de celui du dossier.
- un nom ou une date écrits de deux façons dans le dossier lui-même, tant que l'anecdote reprend l'une des deux.
- une remarque que tu conclus toi-même par « ce qui est cohérent », « pas de problème » ou « acceptable » : ne l'écris pas.

Relève aussi, à part, les fautes d'orthographe, de grammaire, d'accord ou d'accent DE L'ANECDOTE (« a » pour « à », accent manquant, accord oublié). Cite le mot fautif et sa correction. Les fautes du dossier ne te concernent pas, et un mot correctement écrit n'est pas une faute. Une faute n'est pas un problème de fond : elle ne change pas le verdict, mais elle empêche la publication. Sans faute, "fautes" est une liste vide.

Verdicts :
- "confirme" : chaque affirmation de l'anecdote est soutenue par le dossier. C'est le verdict attendu d'un texte fidèle, même s'il laisse de côté une partie du dossier.
- "doute" : une affirmation précise (date, chiffre, nom, lien de cause) est absente du dossier ou déformée.
- "refute" : une affirmation contredit le dossier, ou l'essentiel n'y figure pas.

confiance dit à quel point tu es sûr de ton verdict : "haute" quand tu as pu confronter chaque affirmation au dossier.

Réponds uniquement par un objet json de cette forme :
{
  "verdict": "confirme",
  "confiance": "haute",
  "problemes": [],
  "fautes": [],
  "notes": "Bref commentaire pour le relecteur humain."
}

confiance vaut haute, moyenne ou faible.`;

interface Verification {
  verdict: 'confirme' | 'doute' | 'refute';
  confiance: 'haute' | 'moyenne' | 'faible';
  problemes: string[];
  fautes?: string[];
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

// ------------------------------------------------------------- allongement

// Le modèle vise le plancher et reste dessous : sur les lots du 1er et du
// 2 octobre, 37 récits sur 40 sont sortis entre 1 000 et 1 700 caractères,
// alors que le prompt demandait 320 à 400 mots. Ils étaient jetés sans autre
// forme de procès, et la ville restait en stock bas. Un récit court mais
// juste a déjà fait le plus dur — choisir un sujet et le sourcer : on lui
// redonne une passe pour l'étoffer à partir du même dossier, plutôt que de
// repartir de zéro.
//
// En dessous de ce seuil, il n'y a pas de récit à étoffer : trois phrases.
const MIN_CHARS_A_ALLONGER = 800;

function allongementPrompt(
  city: string,
  redaction: Pick<Redaction, 'titre' | 'accroche' | 'corps' | 'periode'>,
  docs: SourceDoc[]
): string {
  const n = redaction.corps.trim().split(/\s+/).length;
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

ANECDOTE TROP COURTE
Titre : ${redaction.titre}
Accroche : ${redaction.accroche}
Période annoncée : ${redaction.periode}

${redaction.corps}

=== FIN DE L'ANECDOTE ===

Ce corps fait ${n} mots (${redaction.corps.length} caractères). Il en faut entre 260 et 400, jamais plus de 400 : au moins 1 500 caractères, en 4 ou 5 paragraphes séparés par une ligne vide.
Étoffe-le à partir du dossier : les dates exactes, les noms, les sommes, les dimensions, les circonstances que le dossier donne sur ce même sujet et que le texte n'utilise pas encore. Garde le sujet, le titre et le ton. N'ajoute rien qui ne soit dans le dossier, pas de remplissage ni de phrase générale.
Recopie au moins trois citations exactes du dossier qui établissent le récit allongé.
Si le dossier ne contient pas assez de matière sur ce sujet pour atteindre 260 mots sans inventer, renvoie trouve = false et explique pourquoi dans raison. Réponds en json.`;
}

/**
 * Une passe pour amener un corps trop court au format. Rend la rédaction
 * allongée, ou null si le modèle renonce ou rend encore un texte hors format.
 */
async function allonger(
  apiKey: string,
  axe: Axe,
  city: string,
  redaction: Redaction,
  docs: SourceDoc[]
): Promise<Redaction | null> {
  const r = await chatJSON<Redaction>({
    apiKey,
    system: redactionSystem(axe),
    user: allongementPrompt(city, redaction, docs),
    temperature: 0.4,
    maxTokens: 3000,
  });
  if (!r?.trouve) return null;
  const corps = String(r.corps ?? '').trim();
  if (corps.length < MIN_BODY_CHARS || corps.length > MAX_BODY_CHARS) return null;
  // Le 2 octobre, la première version de cette passe a rendu 520 à 590 mots :
  // dans les caractères, hors du compte de mots que `qualite.ts` exige.
  const mots = corps.split(/\s+/).length;
  if (mots < MIN_MOTS || mots > MAX_MOTS) return null;
  return {
    ...r,
    titre: String(r.titre ?? '').trim() || redaction.titre,
    accroche: String(r.accroche ?? '').trim() || redaction.accroche,
    corps,
    periode: String(r.periode ?? '').trim() || redaction.periode,
  };
}

// ------------------------------------------------------------- génération

type Resultat =
  | {
      ok: true;
      redaction: Redaction;
      verification: Verification;
      qualite: Qualite;
      citations: string[];
      retenus: SourceDoc[];
    }
  | { ok: false; reason: string };

/** La seule définition de « publiable », côté fonction. `est_publiable` en base dit la même chose. */
function estPubliable(verification: Verification, qualite: Qualite): boolean {
  return (
    verification.verdict === 'confirme' &&
    verification.confiance === 'haute' &&
    (verification.fautes ?? []).length === 0 &&
    qualite.ok
  );
}

/** Tout ce qui empêche la publication, dans les termes qu'on redonnera au modèle. */
function problemesDe(verification: Verification, qualite: Qualite): string[] {
  const liste: string[] = [];
  if (verification.verdict !== 'confirme' || verification.confiance !== 'haute') {
    liste.push(
      `Vérification : verdict ${verification.verdict}, confiance ${verification.confiance}.`,
      ...(verification.problemes ?? []).map((p) => `Fond : ${p}`)
    );
  }
  liste.push(...(verification.fautes ?? []).map((f) => `Orthographe : ${f}`));
  liste.push(...qualite.problemes.map((p) => `Rédaction : ${p}`));
  return liste;
}

/**
 * Ne créditer que les documents qui portent réellement une citation
 * vérifiée, du plus contributif au moins.
 *
 * Le dossier compte six ou huit articles, et l'anecdote n'en exploite
 * presque jamais plus d'un. Créditer tout le dossier produisait une ligne
 * « Wikipédia — Paris ; Wikipédia — Histoire de Paris ; … » illisible, et
 * surtout un lien « Source » pointant vers l'article général de la ville —
 * où le lecteur venu vérifier ne trouvait pas le fait annoncé. Une source
 * qu'on ne peut pas vérifier ne vaut pas mieux que pas de source.
 */
function crediter(docs: SourceDoc[], citations: string[]): SourceDoc[] {
  const contributions = docs
    .map((doc) => {
      const extrait = normalize(doc.extract);
      return { doc, poids: citations.filter((c) => extrait.includes(normalize(c))).length };
    })
    .filter((c) => c.poids > 0)
    .sort((a, b) => b.poids - a.poids);

  // Filet : les citations ont été validées contre la concaténation du
  // dossier, une seule pourrait théoriquement chevaucher deux documents.
  return contributions.length > 0 ? contributions.map((c) => c.doc) : [docs[0]];
}

async function verifier(
  apiKey: string,
  city: string,
  redaction: Redaction,
  docs: SourceDoc[]
): Promise<Verification> {
  // 2500 et non 800 : le vérificateur cite les passages qu'il conteste, et un
  // récit de 400 mots lui en donne beaucoup plus qu'un paragraphe. À 800, sa
  // réponse était coupée en plein JSON — l'erreur remontait alors comme un
  // « JSON invalide renvoyé par DeepSeek » qui ne disait rien de la cause.
  const v = await chatJSON<Verification>({
    apiKey,
    system: VERIFICATION_SYSTEM,
    user: verificationPrompt(city, redaction, docs),
    temperature: 0,
    maxTokens: 2500,
  });
  return {
    verdict: v?.verdict ?? 'refute',
    confiance: v?.confiance ?? 'faible',
    problemes: Array.isArray(v?.problemes) ? v.problemes : [],
    fautes: Array.isArray(v?.fautes) ? v.fautes : [],
    notes: v?.notes ?? '',
  };
}

interface Doublon {
  doublon: boolean;
  titre?: string;
  raison?: string;
}

async function generateOne(
  apiKey: string,
  city: string,
  docs: SourceDoc[],
  existingTitles: string[],
  existantes: Existante[],
  axe: Axe
): Promise<Resultat> {
  const redaction = await chatJSON<Redaction>({
    apiKey,
    system: redactionSystem(axe),
    user: redactionPrompt(city, docs, existingTitles),
    // Le dossier borne déjà le contenu ; un peu de liberté sert seulement à
    // ne pas ressortir toujours le même passage.
    temperature: 0.7,
    maxTokens: 3000,
  });

  if (!redaction?.trouve) {
    return { ok: false, reason: redaction?.raison || "Rien d'exploitable dans le dossier." };
  }

  let clean: Redaction = {
    ...redaction,
    titre: String(redaction.titre ?? '').trim(),
    accroche: String(redaction.accroche ?? '').trim(),
    corps: String(redaction.corps ?? '').trim(),
    periode: String(redaction.periode ?? '').trim(),
  };

  if (!clean.titre) {
    return { ok: false, reason: 'Titre manquant.' };
  }
  if (!clean.accroche || clean.accroche.length > MAX_ACCROCHE_CHARS) {
    return { ok: false, reason: `Accroche absente ou trop longue (${clean.accroche.length} caractères).` };
  }
  if (clean.corps.length >= MIN_CHARS_A_ALLONGER && clean.corps.length < MIN_BODY_CHARS) {
    const avant = clean.corps.length;
    let allongee: Redaction | null = null;
    try {
      allongee = await allonger(apiKey, axe, city, clean, docs);
    } catch (err) {
      // Une passe ratée ne condamne que ce récit, pas le lot.
      console.error('Allongement', err);
    }
    if (!allongee) {
      return {
        ok: false,
        reason: `Corps hors format : ${avant} caractères, attendu entre ${MIN_BODY_CHARS} et ${MAX_BODY_CHARS}, et l'allongement n'a pas abouti.`,
      };
    }
    clean = allongee;
  }
  if (clean.corps.length < MIN_BODY_CHARS || clean.corps.length > MAX_BODY_CHARS) {
    return {
      ok: false,
      reason: `Corps hors format : ${clean.corps.length} caractères, attendu entre ${MIN_BODY_CHARS} et ${MAX_BODY_CHARS}.`,
    };
  }

  const sourceText = docs.map((d) => d.extract).join('\n\n');
  const controle = controler(clean, sourceText);
  if (!controle.ok) {
    return { ok: false, reason: controle.reason! };
  }
  const citations = controle.citationsValides;

  const retenus = crediter(docs, citations);

  // Le thème avant la vérification : un doublon n'a pas à coûter un second
  // appel de relecture.
  const memeArticle = articleDejaTraite(
    retenus.map((d) => d.title),
    existantes,
    city
  );
  if (memeArticle) {
    return {
      ok: false,
      reason: `Thème déjà traité : « ${clean.titre} » reprend l'article « ${memeArticle.article} », déjà exploité par « ${memeArticle.titre} ».`,
    };
  }

  if (existantes.length > 0) {
    let doublon: Doublon;
    try {
      doublon = await chatJSON<Doublon>({
        apiKey,
        system: DOUBLON_SYSTEM,
        user: doublonPrompt(city, clean, existantes),
        temperature: 0,
        maxTokens: 400,
      });
    } catch (err) {
      // Sans réponse, on ne sait pas : l'anecdote n'est pas enregistrée.
      return {
        ok: false,
        reason: `Contrôle des doublons impossible : ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (doublon?.doublon !== false) {
      return {
        ok: false,
        reason: `Thème déjà traité : « ${clean.titre} » double « ${doublon?.titre || '?'} ». ${doublon?.raison ?? ''}`.trim(),
      };
    }
  }

  let verification: Verification;
  try {
    verification = await verifier(apiKey, city, clean, docs);
  } catch (err) {
    // Une vérification ratée ne condamne que cette anecdote. Auparavant elle
    // remontait jusqu'à l'appelant et emportait toute la ville : sur un lot de
    // trois, une réponse malformée en faisait perdre trois.
    return {
      ok: false,
      reason: `Vérification impossible : ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Un `refute` n'est plus jeté : il part en brouillon, avec ses problèmes, et
  // le mode `corriger` tente de le réparer à partir de ses sources. Une seule
  // affirmation fausse suffisait à perdre un récit entier par ailleurs juste.
  // Il ne sera jamais publié tel quel : `est_publiable` exige `confirme`.
  const qualite = controlerRedaction(clean);

  return { ok: true, redaction: clean, verification, qualite, citations, retenus };
}

// -------------------------------------------------------------- correction

// Le nombre de réécritures accordées à un brouillon. Au-delà, ce que le
// modèle n'a pas su réparer en trois passes ne le sera pas à la quatrième :
// l'anecdote est rejetée, avec le motif, et la ville peut recevoir un lot neuf.
const MAX_CORRECTIONS = 3;

// Deux brouillons par appel : une correction coûte deux appels DeepSeek
// (réécriture, vérification), parfois trois. Au-delà, l'appel frôlerait la
// limite de durée d'une fonction.
const MAX_CORRECTIONS_PAR_APPEL = 2;

function correctionPrompt(
  city: string,
  redaction: Pick<Redaction, 'titre' | 'accroche' | 'corps' | 'periode'>,
  problemes: string[],
  docs: SourceDoc[]
): string {
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

ANECDOTE À CORRIGER
Titre : ${redaction.titre}
Accroche : ${redaction.accroche}
Période annoncée : ${redaction.periode}

${redaction.corps}

=== FIN DE L'ANECDOTE ===

CE QUI EMPÊCHE SA PUBLICATION
${problemes.map((p) => `- ${p}`).join('\n')}

Corrige cette anecdote pour lever chacun de ces points, sans en créer de nouveaux :
- une affirmation que le dossier ne soutient pas se supprime ou se reformule pour dire exactement ce que dit le dossier ; ne la remplace jamais par une autre affirmation non sourcée ;
- chaque faute signalée se corrige ;
- la forme reste celle demandée : titre, accroche, 240 à 400 mots en 4 ou 5 paragraphes séparés par une ligne vide.
Garde le même sujet et le même titre si rien ne l'interdit. Recopie de nouveau au moins trois citations exactes du dossier qui établissent le récit corrigé.
Si le dossier ne permet pas de corriger sans inventer, renvoie trouve = false et explique pourquoi dans raison. Réponds en json.`;
}

interface Brouillon {
  id: string;
  city: string;
  city_place_id: string | null;
  title: string;
  hook: string | null;
  body: string;
  period: string | null;
  sources: Array<{ url?: string; titre?: string; editeur?: string }> | null;
  verdict: string | null;
  confidence: string | null;
  problemes: string[] | null;
  qualite_ok: boolean | null;
  corrections: number;
  generated_by: string | null;
  verification_notes: string | null;
}

/**
 * Le dossier d'un brouillon déjà en base : les documents qu'il crédite,
 * relus à la source. Plus étroit que le dossier d'origine — c'est voulu :
 * une correction ne doit s'appuyer que sur ce que l'anecdote cite.
 */
async function dossierDe(b: Brouillon): Promise<SourceDoc[]> {
  const sources = b.sources ?? [];
  const wiki = sources.filter((s) => s.editeur === 'Wikipédia' && s.titre);
  const merimee = sources.filter((s) => s.editeur !== 'Wikipédia' && s.titre);

  const [wikiDocs, merimeeDocs] = await Promise.all([
    Promise.allSettled(wiki.map((s) => fetchExtract(s.titre!))),
    merimee.length > 0 ? fetchPatrimoineDocs(b.city) : Promise.resolve([]),
  ]);

  const docs: SourceDoc[] = [];
  for (const r of wikiDocs) {
    if (r.status === 'fulfilled' && r.value) docs.push(r.value);
    else if (r.status === 'rejected') console.error('Wikipédia (correction)', r.reason);
  }
  const titresMerimee = new Set(merimee.map((s) => s.titre));
  docs.push(...merimeeDocs.filter((d) => titresMerimee.has(d.title)));
  return docs;
}

type Issue = 'publiable' | 'a_reprendre' | 'abandonnee' | 'echec';

interface BilanCorrection {
  id: string;
  ville: string;
  titre: string;
  issue: Issue;
  motif: string;
}

async function corrigerBrouillon(
  apiKey: string,
  supabase: Db,
  b: Brouillon
): Promise<BilanCorrection> {
  const axe: Axe = (b.generated_by ?? '').includes('personnalités') ? 'personnalites' : 'patrimoine';
  const tentative = b.corrections + 1;
  const avant = {
    titre: b.title,
    verdict: b.verdict,
    confiance: b.confidence,
    qualite_ok: b.qualite_ok,
    problemes: b.problemes,
  };
  const actuelle = {
    titre: b.title,
    accroche: b.hook ?? '',
    corps: b.body,
    periode: b.period ?? '',
  };

  const journal = async (issue: Issue, motif: string, apres: unknown = null) => {
    await supabase.from('corrections_anecdote').insert({
      anecdote_id: b.id,
      tentative,
      issue,
      motif,
      avant,
      apres,
    });
  };

  // Une tentative ratée compte : sans ça, un brouillon dont les sources ont
  // disparu serait repris toutes les quinze minutes, indéfiniment.
  const echouer = async (motif: string): Promise<BilanCorrection> => {
    const abandon = tentative >= MAX_CORRECTIONS;
    await supabase
      .from('anecdotes')
      .update({ corrections: tentative, ...(abandon ? { status: 'rejected' } : {}) })
      .eq('id', b.id);
    if (abandon) {
      await supabase.from('rejets_anecdote').insert({
        city: b.city,
        city_place_id: b.city_place_id,
        titre: b.title,
        motif: `Non publiable après ${tentative} tentatives de correction. Dernier motif : ${motif}`,
      });
    }
    const issue: Issue = abandon ? 'abandonnee' : 'echec';
    await journal(issue, motif);
    return { id: b.id, ville: b.city, titre: b.title, issue, motif };
  };

  const docs = await dossierDe(b);
  if (docs.length === 0) {
    return echouer('Sources introuvables : aucun des documents crédités ne se relit.');
  }

  // Les brouillons d'avant ce mode n'ont ni problèmes structurés ni contrôle
  // de rédaction : on les évalue d'abord tels quels, contre le dossier relu.
  // Certains passent déjà — rien à réécrire.
  let problemes = b.problemes;
  if (!problemes || b.qualite_ok === null) {
    let v: Verification;
    try {
      v = await verifier(apiKey, b.city, actuelle as Redaction, docs);
    } catch (err) {
      return echouer(`Vérification impossible : ${err instanceof Error ? err.message : String(err)}`);
    }
    const q = controlerRedaction(actuelle);
    problemes = problemesDe(v, q);
    await supabase
      .from('anecdotes')
      .update({
        verdict: v.verdict,
        confidence: v.confiance,
        qualite_ok: q.ok,
        qualite_problemes: q.problemes,
        problemes,
      })
      .eq('id', b.id);
    if (estPubliable(v, q)) {
      await journal('publiable', 'Conforme en l’état après réévaluation.', { verdict: v.verdict, confiance: v.confiance });
      return { id: b.id, ville: b.city, titre: b.title, issue: 'publiable', motif: 'Conforme en l’état.' };
    }
  }

  let redaction: Redaction;
  try {
    redaction = await chatJSON<Redaction>({
      apiKey,
      system: redactionSystem(axe),
      user: correctionPrompt(b.city, actuelle, problemes, docs),
      temperature: 0.3,
      maxTokens: 3000,
    });
  } catch (err) {
    return echouer(`Réécriture impossible : ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!redaction?.trouve) {
    return echouer(`Le modèle renonce : ${redaction?.raison || 'aucune raison donnée'}`);
  }

  let clean: Redaction = {
    ...redaction,
    titre: String(redaction.titre ?? '').trim(),
    accroche: String(redaction.accroche ?? '').trim(),
    corps: String(redaction.corps ?? '').trim(),
    periode: String(redaction.periode ?? '').trim(),
  };

  // Même dérive qu'à la génération : la réécriture raccourcit, et le
  // contrôle de rédaction la recale pour quelques mots (« 296 mots, attendu
  // entre 300 et 430 »). Une passe d'allongement avant de conclure.
  const motsCorps = clean.corps.split(/\s+/).filter(Boolean).length;
  if (
    clean.corps.length >= MIN_CHARS_A_ALLONGER &&
    (clean.corps.length < MIN_BODY_CHARS || motsCorps < MIN_MOTS)
  ) {
    try {
      clean = (await allonger(apiKey, axe, b.city, clean, docs)) ?? clean;
    } catch (err) {
      console.error('Allongement (correction)', err);
    }
  }

  if (clean.corps.length < MIN_BODY_CHARS || clean.corps.length > MAX_BODY_CHARS) {
    return echouer(`Corps réécrit hors format : ${clean.corps.length} caractères.`);
  }
  if (!clean.accroche || clean.accroche.length > MAX_ACCROCHE_CHARS || !clean.titre) {
    return echouer('Titre ou accroche réécrits absents ou trop longs.');
  }

  const controle = controler(clean, docs.map((d) => d.extract).join('\n\n'));
  if (!controle.ok) {
    return echouer(`Réécriture non sourcée : ${controle.reason}`);
  }

  let verification: Verification;
  try {
    verification = await verifier(apiKey, b.city, clean, docs);
  } catch (err) {
    return echouer(`Vérification impossible : ${err instanceof Error ? err.message : String(err)}`);
  }

  const qualite = controlerRedaction(clean);
  const publiable = estPubliable(verification, qualite);
  const restants = problemesDe(verification, qualite);
  const abandon = !publiable && tentative >= MAX_CORRECTIONS;
  const retenus = crediter(docs, controle.citationsValides);
  const sources = retenus.map((doc) => ({ url: doc.url, titre: doc.title, editeur: doc.editeur }));

  const miseAJour = {
    title: clean.titre,
    hook: clean.accroche,
    body: clean.corps,
    period: clean.periode || null,
    source: sources.map((s) => `${s.editeur} — ${s.titre}`).join(' ; '),
    source_url: sources[0].url,
    sources,
    verdict: verification.verdict,
    confidence: verification.confiance,
    verification_notes: notesDe(verification, controle.citationsValides, tentative),
    qualite_ok: qualite.ok,
    qualite_problemes: qualite.problemes,
    problemes: restants,
    corrections: tentative,
    ...(abandon ? { status: 'rejected' } : {}),
  };

  let { error } = await supabase.from('anecdotes').update(miseAJour).eq('id', b.id);
  // 23505 : le nouveau titre existe déjà dans la ville. On garde l'ancien.
  if (error?.code === '23505') {
    ({ error } = await supabase
      .from('anecdotes')
      .update({ ...miseAJour, title: b.title })
      .eq('id', b.id));
  }
  if (error) {
    console.error('Mise à jour après correction', error);
    return echouer(`Enregistrement impossible : ${error.message}`);
  }

  const motif = publiable ? 'Corrigée : verdict confirmé, rédaction conforme.' : restants.join(' ; ');
  if (abandon) {
    await supabase.from('rejets_anecdote').insert({
      city: b.city,
      city_place_id: b.city_place_id,
      titre: clean.titre,
      motif: `Non publiable après ${tentative} tentatives de correction : ${motif}`,
    });
  }

  const issue: Issue = publiable ? 'publiable' : abandon ? 'abandonnee' : 'a_reprendre';
  await journal(issue, motif, {
    titre: clean.titre,
    verdict: verification.verdict,
    confiance: verification.confiance,
    qualite_ok: qualite.ok,
    problemes: restants,
  });
  return { id: b.id, ville: b.city, titre: clean.titre, issue, motif };
}

function notesDe(verification: Verification, citations: string[], tentative = 0): string {
  return [
    `Verdict : ${verification.verdict} (confiance ${verification.confiance}).`,
    tentative > 0 ? `Après ${tentative} correction(s).` : '',
    ...(verification.problemes ?? []),
    ...(verification.fautes ?? []).map((f) => `Faute : ${f}`),
    verification.notes ?? '',
    `Citations vérifiées automatiquement dans la source (${citations.length}) :`,
    ...citations.map((c) => `« ${c} »`),
  ]
    .filter(Boolean)
    .join('\n');
}

async function corriger(
  apiKey: string,
  supabase: Db,
  limite: number
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: ids, error: idsError } = await supabase.rpc('brouillons_a_corriger', {
    p_limit: limite,
  });
  if (idsError) {
    return { status: 500, body: { error: idsError.message } };
  }
  const liste = ((ids ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (liste.length === 0) {
    return { status: 200, body: { corrigees: 0, bilans: [] } };
  }

  const { data: brouillons, error } = await supabase
    .from('anecdotes')
    .select(
      'id, city, city_place_id, title, hook, body, period, sources, verdict, confidence, problemes, qualite_ok, corrections, generated_by, verification_notes'
    )
    .in('id', liste);
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  const bilans: BilanCorrection[] = [];
  for (const b of (brouillons ?? []) as Brouillon[]) {
    try {
      bilans.push(await corrigerBrouillon(apiKey, supabase, b));
    } catch (err) {
      console.error('Correction', b.id, err);
      bilans.push({
        id: b.id,
        ville: b.city,
        titre: b.title,
        issue: 'echec',
        motif: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { status: 200, body: { corrigees: bilans.length, bilans } };
}

// -------------------------------------------------------------- génération

async function generer(
  apiKey: string,
  supabase: Db,
  city: string,
  cityPlaceId: string | null,
  count: number,
  axe: Axe
): Promise<{ status: number; body: Record<string, unknown> }> {
  // L'existant est lu AVANT le dossier : ce sont les articles déjà exploités
  // qui déterminent lesquels on va chercher. C'est ce qui fait tourner le
  // corpus d'une génération à l'autre, et rend atteignables trente anecdotes
  // par ville — sans quoi le modèle revient au même monument indéfiniment.
  const existingQuery = supabase
    .from('anecdotes')
    .select('title, hook, sources, status')
    .limit(500);
  const { data: existing, error: existingError } = cityPlaceId
    ? await existingQuery.eq('city_place_id', cityPlaceId)
    : await existingQuery.eq('city', city);

  // Sans l'existant, le contrôle des doublons ne voit rien : mieux vaut ne
  // rien écrire que réécrire ce qui est déjà publié.
  if (existingError) {
    console.error('Existant', existingError);
    return { status: 500, body: { created: 0, skipped: [], error: existingError.message } };
  }

  const titles: string[] = (existing ?? []).map((row) => row.title);

  // Ce qu'un lecteur peut recevoir ou recevra : publié, ou en attente de
  // relecture. Une anecdote rejetée ne bloque pas son thème — elle l'a
  // souvent été parce qu'elle parlait d'autre chose que de la ville.
  const existantes: Existante[] = (existing ?? [])
    .filter((row) => row.status !== 'rejected')
    .map((row) => ({
      titre: row.title,
      accroche: row.hook ?? null,
      articles: ((row.sources ?? []) as Array<{ titre?: string }>)
        .map((s) => s.titre)
        .filter((t): t is string => typeof t === 'string'),
    }));

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
    docs = await buildDossier(city, articlesExploites, axe, cityPlaceId);
  } catch (err) {
    console.error('Dossier', err);
    return {
      status: 502,
      body: { created: 0, skipped: [], error: `Ancrage documentaire indisponible : ${err}` },
    };
  }

  // Pas de dossier, pas d'anecdote : on ne retombe jamais sur la mémoire du
  // modèle, c'est précisément ce qu'on cherche à éviter.
  if (docs.length === 0) {
    return {
      status: 200,
      body: {
        created: 0,
        skipped: [
          `Aucune source neuve pour « ${city} » sur l'axe ${axe} : les ${articlesExploites.length} articles disponibles ont tous été exploités.`,
        ],
        anecdotes: [],
      },
    };
  }
  const dossierComplet = docs;
  const created: unknown[] = [];
  const skipped: string[] = [];
  let publiables = 0;

  const debut = Date.now();
  for (let i = 0; i < count; i++) {
    // Chaque récit coûte jusqu'à quatre appels DeepSeek depuis l'allongement.
    // On s'arrête avant la limite de durée de la fonction : ce qui est écrit
    // est enregistré, le reste viendra au lot suivant.
    if (Date.now() - debut > BUDGET_LOT_MS) {
      skipped.push(`Temps écoulé après ${i} tentative(s) : le reste du lot est reporté.`);
      break;
    }
    if (docs.length === 0) {
      skipped.push(`Dossier épuisé après ${created.length} anecdote(s) : chaque article a déjà servi.`);
      break;
    }

    let result: Resultat;
    try {
      result = await generateOne(apiKey, city, docs, titles, existantes, axe);
    } catch (err) {
      const message = err instanceof DeepSeekError ? err.message : String(err);
      console.error('DeepSeek', message);
      return { status: 502, body: { created: created.length, publiables, skipped, error: message } };
    }

    if (!result.ok) {
      skipped.push(result.reason);
      continue;
    }

    const { redaction, verification, qualite, citations, retenus } = result;

    const sources = retenus.map((doc) => ({
      url: doc.url,
      titre: doc.title,
      editeur: doc.editeur,
    }));

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
        verification_notes: notesDe(verification, citations),
        // Même logique pour la rédaction et l'orthographe : des colonnes, pas
        // une phrase. `problemes` est vide quand l'anecdote est publiable, et
        // sinon c'est exactement ce que la correction donnera au modèle.
        qualite_ok: qualite.ok,
        qualite_problemes: qualite.problemes,
        problemes: problemesDe(verification, qualite),
        // L'axe n'apparaît que lorsqu'il n'est pas celui d'origine : les
        // 552 lignes déjà en base gardent leur libellé exact, et une requête
        // sur `generated_by` suffit à retrouver ce qui vient des gens.
        generated_by: `deepseek:${DEEPSEEK_MODEL} + ${[...new Set(docs.map((d) => d.origine))].join('+')}${
          axe === 'personnalites' ? ' (axe personnalités)' : ''
        }`,
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
        return {
          status: 500,
          body: { created: created.length, publiables, skipped, error: error.message },
        };
      }
    } else {
      created.push(inserted);
      if (estPubliable(verification, qualite)) publiables++;
      titles.push(redaction.titre);
      existantes.push({
        titre: redaction.titre,
        accroche: redaction.accroche,
        articles: sources.map((s) => s.titre),
      });
      // L'article spécifique qui vient de servir sort du dossier : les
      // suivantes du lot doivent puiser ailleurs, pas tourner autour du même
      // monument sous un autre titre.
      const servis = new Set(
        retenus.filter((d) => !estArticleGeneral(d.title, city)).map((d) => d.title)
      );
      docs = docs.filter((d) => !servis.has(d.title));
    }
  }

  return {
    status: 200,
    body: {
      created: created.length,
      // Créées ne veut pas dire publiables : les autres attendent le mode
      // `corriger`.
      publiables,
      // Rend visible ce qui a réellement nourri le modèle : c'est ici qu'on voit
      // si Mérimée a répondu, et avec quel volume.
      dossier: dossierComplet.map((d) => ({
        origine: d.origine,
        titre: d.title,
        url: d.url,
        caracteres: d.extract.length,
      })),
      skipped,
      anecdotes: created,
    },
  };
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

  const supabase = client();
  const debut = Date.now();

  // Le journal ne doit jamais faire échouer ce qu'il décrit : une ligne
  // perdue vaut mieux qu'un lot perdu.
  const journaliser = async (ligne: Record<string, unknown>) => {
    const { error } = await supabase
      .from('lots_generation')
      .insert({ ...ligne, duree_ms: Date.now() - debut });
    if (error) console.error('Journal des lots', error);
  };

  if (body.mode === 'corriger') {
    const limite = Math.min(Math.max(Number(body.limit) || 1, 1), MAX_CORRECTIONS_PAR_APPEL);
    const { status, body: reponse } = await corriger(DEEPSEEK_API_KEY, supabase, limite);
    const bilans = (reponse.bilans ?? []) as BilanCorrection[];
    if (bilans.length > 0 || reponse.error) {
      await journaliser({
        mode: 'correction',
        demandees: bilans.length,
        creees: bilans.filter((b) => b.issue !== 'echec').length,
        publiables: bilans.filter((b) => b.issue === 'publiable').length,
        sautees: bilans
          .filter((b) => b.issue !== 'publiable')
          .map((b) => `${b.ville} — « ${b.titre} » (${b.issue}) : ${b.motif}`),
        erreur: (reponse.error as string) ?? null,
      });
    }
    return json(reponse, status);
  }

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const cityPlaceId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_COUNT);
  // Une valeur inconnue retombe sur `patrimoine` plutôt que d'échouer : les
  // appelants existants — `produire_lot`, `produire_villes_demandees` — n'en
  // envoient aucune, et c'est leur comportement d'hier qu'il faut préserver.
  const axe: Axe = body.axe === 'personnalites' ? 'personnalites' : 'patrimoine';

  if (!city) {
    return fail('Paramètre `city` manquant.');
  }

  const { status, body: reponse } = await generer(
    DEEPSEEK_API_KEY,
    supabase,
    city,
    cityPlaceId,
    count,
    axe
  );

  await journaliser({
    mode: 'generation',
    city,
    city_place_id: cityPlaceId,
    axe,
    demandees: count,
    creees: Number(reponse.created ?? 0),
    publiables: Number(reponse.publiables ?? 0),
    sautees: reponse.skipped ?? [],
    erreur: (reponse.error as string) ?? null,
  });

  return json(reponse, status);
});
