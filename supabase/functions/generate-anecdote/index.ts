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
// Depuis le 7 octobre, un lot ne fait plus lire le dossier entier à chaque
// essai. Il choisit d'abord ses sujets en un seul appel, vérifie que chacun
// repose sur une phrase réelle d'un article réel (voir `plan.ts`), puis les
// rédige un par un à partir de ce seul article. Les sujets attendent dans
// `sujets_anecdote` : ce qu'un appel n'a pas le temps d'écrire, le mode
// `poursuivre` (toutes les cinq minutes) l'écrit. Un lot qui finit sous sa
// cible est replanifié pour ce qui manque, trois fois au plus.
//
// Le corps de la requête accepte `axe` : `patrimoine` (défaut, le
// comportement d'origine), `personnalites` ou `histoire`. Il choisit le gisement
// Wikipédia du dossier, et avec lui ce dont l'anecdote parlera. Une ville
// dont les trente anecdotes décrivent toutes une façade se relance sur
// l'autre axe sans que rien d'autre ne bouge.
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// la fonction coûte de l'argent à chaque exécution et n'est pas destinée à
// être appelée depuis l'app.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, compterAvec, DEEPSEEK_MODEL } from './deepseek.ts';
import { type Axe, fetchExtract, fetchWikipediaDocs, lireAxe, ordreAxes } from './wikipedia.ts';
import { fetchPatrimoineDocs } from './patrimoine.ts';
import type { SourceDoc } from './sources.ts';
import { controler, normalize } from './verification.ts';
import { controlerRedaction, couperAuFormat, MAX_MOTS, MIN_MOTS, neutraliserAffects, type Qualite } from './qualite.ts';
import { articleDejaTraite, articlesSpecifiques, type Existante } from './doublons.ts';
import {
  DOUBLONS_PLAN_SYSTEM,
  doublonsPlanPrompt,
  dossierPlan,
  numerosDoublons,
  PLAN_SYSTEM,
  planPrompt,
  documentsSteriles,
  MIN_CHARS_ARTICLE_SUJET,
  type SujetRetenu,
  sujetImpose,
  trierPropositions,
} from './plan.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_COUNT = 10;
// Un récit (rédaction, allongement éventuel, vérification) prend jusqu'à
// 90 s. On n'en commence plus passé ce délai : la limite d'une Edge Function
// est de 150 s, et un récit coupé en route est un récit payé pour rien. Ce qui
// reste est écrit par le mode `poursuivre`.
const DEBUT_MAX_REDACTION_MS = 50_000;
// Récits écrits en parallèle : deux appels DeepSeek simultanés, pas plus.
const REDACTIONS_SIMULTANEES = 2;

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
  cityPlaceId: string | null = null,
  steriles: string[] = []
): Promise<SourceDoc[]> {
  // Mérimée ne décrit que des immeubles protégés : hors de l'axe patrimoine,
  // ses notices n'apportent rien et occupent 12 000 caractères du dossier. On
  // ne l'interroge pas, et on économise l'appel.
  const [wiki, merimee] = await Promise.allSettled([
    fetchWikipediaDocs(city, exclure, axe, cityPlaceId ? TITRES_WIKIPEDIA[cityPlaceId] : undefined, steriles),
    axe === 'patrimoine' ? fetchPatrimoineDocs(city, [...exclure, ...steriles]) : Promise.resolve([]),
  ]);

  if (wiki.status === 'rejected') console.error('Wikipédia', wiki.reason);
  if (merimee.status === 'rejected') console.error('Mérimée', merimee.reason);

  // Un document trop court pour porter un récit ne sert qu'à payer des jetons :
  // le plan l'écarte de toute façon (« trop peu pour un récit »). Le 10
  // octobre, quatre notices de Saint-Jean-de-Luz de 418 à 964 caractères
  // revenaient ainsi à chaque plan.
  const portent = (d: SourceDoc) => d.extract.length >= MIN_CHARS_ARTICLE_SUJET;
  return [
    ...budget((wiki.status === 'fulfilled' ? wiki.value : []).filter(portent), MAX_CHARS_WIKIPEDIA),
    ...budget((merimee.status === 'fulfilled' ? merimee.value : []).filter(portent), MAX_CHARS_MERIMEE),
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
  mentions:
    "Les articles du dossier ne portent pas sur la ville elle-même : chacun parle d'un lieu, d'une personne, d'un navire, d'une entreprise ou d'un événement qui la concerne. Le sujet est l'épisode qui se passe dans la ville, pas le reste de l'article. Ce qui fait un bon sujet : un épisode daté, avec ses acteurs et ses chiffres, qui s'est passé là. Une description n'est pas un sujet : surface, capacité, horaires, équipements, tarifs, palmarès ne font pas une anecdote. Pas de généralité géographique, pas de guide touristique, pas de démographie.\n\nSi aucun article ne raconte un épisode qui se passe dans la ville demandée, renvoie trouve = false.",
  histoire:
    "Le dossier porte sur l'histoire de la ville : événements, sièges, incendies, épidémies, fêtes et processions, institutions disparues, métiers et industries. Ce qui fait un bon sujet : un épisode daté, avec ses acteurs et ses chiffres, une coutume et son origine, une institution et ce qu'elle a laissé. Pas de résumé de plusieurs siècles, pas de chronologie, pas de généralité géographique, pas de guide touristique, pas de démographie.\n\nL'épisode doit se passer dans la ville demandée. Un article du dossier peut parler surtout d'une région ou d'un pays : n'en retiens que ce qui se passe dans la ville, et si rien ne s'y passe, renvoie trouve = false.",
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

// Le sujet est choisi et sourcé avant d'arriver ici (voir `plan.ts`) : le
// modèle ne reçoit que l'article qui le porte, et la consigne de s'y tenir.
function redactionPrompt(city: string, docs: SourceDoc[], sujet: SujetRetenu): string {
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

${sujetImpose(sujet)}

Écris une anecdote d'histoire locale sur ${city}, uniquement à partir du dossier ci-dessus. Réponds en json.`;
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

// La même passe sert à resserrer. Le 8 octobre, à Lille, un récit sur Wicar
// est parti en correction pour 432 mots (plafond 430), et un autre sur
// l'hôtel Petipas de Walle pour 208 mots alors qu'il avait assez de
// caractères pour échapper à l'allongement. Une passe ciblée coûte moins
// qu'un tour de correction, qui relit et revérifie tout.
type Sens = 'allonger' | 'resserrer';

function compterMots(texte: string): number {
  return texte.split(/\s+/).filter(Boolean).length;
}

/** Ce qu'il faut faire du corps pour qu'il entre dans le format, ou null. */
function sensAjustement(corps: string): Sens | null {
  if (corps.length < MIN_CHARS_A_ALLONGER) return null;
  const mots = compterMots(corps);
  if (corps.length < MIN_BODY_CHARS || mots < MIN_MOTS) return 'allonger';
  if (corps.length > MAX_BODY_CHARS || mots > MAX_MOTS) return 'resserrer';
  return null;
}

function allongementPrompt(
  city: string,
  redaction: Pick<Redaction, 'titre' | 'accroche' | 'corps' | 'periode'>,
  docs: SourceDoc[],
  sens: Sens = 'allonger'
): string {
  const n = compterMots(redaction.corps);
  const consigne =
    sens === 'resserrer'
      ? `Ce corps fait ${n} mots (${redaction.corps.length} caractères). Il en faut entre 260 et 400, jamais plus de 400, en 4 ou 5 paragraphes séparés par une ligne vide.
Resserre-le : retire les redites et les détails secondaires, sans rien ajouter. Garde le sujet, le titre, le ton, et toutes les dates, noms et chiffres essentiels.
Recopie au moins trois citations exactes du dossier qui établissent le récit resserré. Réponds en json.`
      : `Ce corps fait ${n} mots (${redaction.corps.length} caractères). Il en faut entre 260 et 400, jamais plus de 400 : au moins 1 500 caractères, en 4 ou 5 paragraphes séparés par une ligne vide.
Étoffe-le à partir du dossier : les dates exactes, les noms, les sommes, les dimensions, les circonstances que le dossier donne sur ce même sujet et que le texte n'utilise pas encore. Garde le sujet, le titre et le ton. N'ajoute rien qui ne soit dans le dossier, pas de remplissage ni de phrase générale.
Recopie au moins trois citations exactes du dossier qui établissent le récit allongé.
Si le dossier ne contient pas assez de matière sur ce sujet pour atteindre 260 mots sans inventer, renvoie trouve = false et explique pourquoi dans raison. Réponds en json.`;
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

ANECDOTE ${sens === 'resserrer' ? 'TROP LONGUE' : 'TROP COURTE'}
Titre : ${redaction.titre}
Accroche : ${redaction.accroche}
Période annoncée : ${redaction.periode}

${redaction.corps}

=== FIN DE L'ANECDOTE ===

${consigne}`;
}

/**
 * Une passe pour amener un corps trop court ou trop long au format. Rend la
 * rédaction ajustée, même encore hors format (`ajuster` juge si elle s'en
 * rapproche), ou null si le modèle renonce.
 */
async function allonger(
  apiKey: string,
  axe: Axe,
  city: string,
  redaction: Redaction,
  docs: SourceDoc[],
  sens: Sens = 'allonger'
): Promise<Redaction | null> {
  const r = await chatJSON<Redaction>({
    apiKey,
    system: redactionSystem(axe),
    user: allongementPrompt(city, redaction, docs, sens),
    temperature: 0.4,
    maxTokens: 3000,
    etape: sens,
    ville: city,
  });
  if (!r?.trouve) return null;
  const corps = String(r.corps ?? '').trim();
  if (!corps) return null;
  return {
    ...r,
    titre: String(r.titre ?? '').trim() || redaction.titre,
    accroche: String(r.accroche ?? '').trim() || redaction.accroche,
    corps,
    periode: String(r.periode ?? '').trim() || redaction.periode,
  };
}

/**
 * De combien un corps sort du format, en mots (les caractères comptés à six
 * par mot). Zéro : il y est.
 */
function ecartFormat(corps: string): number {
  const mots = compterMots(corps);
  const horsMots = Math.max(0, MIN_MOTS - mots, mots - MAX_MOTS);
  const horsChars = Math.max(0, MIN_BODY_CHARS - corps.length, corps.length - MAX_BODY_CHARS);
  return horsMots + horsChars / 6;
}

// Deux passes au plus. Une seule ne suffisait pas : le 9 octobre, des
// brouillons attendaient encore en correction à 434, 454, 499 et 530 mots,
// et le 8, deux anecdotes ont été rejetées à 458 et 464 mots. Le modèle
// resserre, mais pas assez d'un coup ; on repart de sa version plus courte.
const PASSES_AJUSTEMENT = 2;

/**
 * Amène le corps au format en une ou deux passes. Chaque passe ne remplace
 * le texte que si elle le rapproche du format : une passe qui rallonge un
 * texte trop long, ou qui renonce, laisse la version précédente.
 */
async function ajuster(
  apiKey: string,
  axe: Axe,
  city: string,
  redaction: Redaction,
  docs: SourceDoc[]
): Promise<Redaction> {
  let meilleure = redaction;
  for (let passe = 0; passe < PASSES_AJUSTEMENT; passe++) {
    const sens = sensAjustement(meilleure.corps);
    if (!sens) break;
    let candidate: Redaction | null = null;
    try {
      candidate = await allonger(apiKey, axe, city, meilleure, docs, sens);
    } catch (err) {
      console.error('Ajustement de longueur', err);
    }
    if (!candidate || ecartFormat(candidate.corps) >= ecartFormat(meilleure.corps)) break;
    meilleure = candidate;
  }
  // Encore trop long après le modèle : on retire des phrases nous-mêmes.
  if (sensAjustement(meilleure.corps) === 'resserrer') {
    const coupe = couperAuFormat(meilleure.corps);
    if (coupe) meilleure = { ...meilleure, corps: coupe };
  }
  return meilleure;
}

/** L'accroche et le corps sans les adjectifs d'affect qu'on sait remplacer. */
function neutraliser(r: Redaction): Redaction {
  return { ...r, accroche: neutraliserAffects(r.accroche), corps: neutraliserAffects(r.corps) };
}

// ------------------------------------------------------------- génération

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
    etape: 'verification',
    ville: city,
  });
  return {
    verdict: v?.verdict ?? 'refute',
    confiance: v?.confiance ?? 'faible',
    problemes: Array.isArray(v?.problemes) ? v.problemes : [],
    fautes: Array.isArray(v?.fautes) ? v.fautes : [],
    notes: v?.notes ?? '',
  };
}

// --------------------------------------------------------------- rédaction

/** Un sujet choisi et sourcé par le plan, en attente dans `sujets_anecdote`. */
interface Sujet {
  id: string;
  lot_id: string | null;
  city: string;
  city_place_id: string | null;
  axe: string;
  sujet: string;
  angle: string;
  faits: string[] | null;
  citation: string;
  article: string;
  url: string;
  editeur: string;
  origine: SourceDoc['origine'];
  extrait: string;
  tentatives: number;
}

interface BilanSujet {
  sujet: string;
  ok: boolean;
  publiable: boolean;
  motif: string;
}

// Une panne (DeepSeek, réseau) laisse au sujet une seconde chance ; un refus
// du modèle ou un contrôle raté, non : le sujet était mal choisi.
const MAX_TENTATIVES_SUJET = 2;

interface Existant {
  existantes: Existante[];
  articlesExploites: string[];
}

/**
 * Ce que la ville a déjà : anecdotes en vie, et, pour le plan, sujets en
 * attente (ils comptent comme écrits) et sujets ratés (leur article sort du
 * dossier, il a déjà été essayé).
 */
async function lireExistant(
  supabase: Db,
  city: string,
  cityPlaceId: string | null,
  avecSujets: boolean
): Promise<Existant> {
  const anecdotesQuery = supabase.from('anecdotes').select('title, hook, sources, status').limit(500);
  const { data: anecdotes, error } = cityPlaceId
    ? await anecdotesQuery.eq('city_place_id', cityPlaceId)
    : await anecdotesQuery.eq('city', city);
  // Sans l'existant, le contrôle des doublons ne voit rien : mieux vaut ne
  // rien écrire que réécrire ce qui est déjà publié.
  if (error) throw new Error(`Existant illisible : ${error.message}`);

  const articlesDe = (sources: unknown) =>
    ((sources ?? []) as Array<{ titre?: string }>)
      .map((s) => s.titre)
      .filter((t): t is string => typeof t === 'string');

  // Une anecdote rejetée ne bloque pas son thème — elle l'a souvent été parce
  // qu'elle parlait d'autre chose que de la ville.
  const existantes: Existante[] = (anecdotes ?? [])
    .filter((row) => row.status !== 'rejected')
    .map((row) => ({ titre: row.title, accroche: row.hook ?? null, articles: articlesDe(row.sources) }));
  const articles = (anecdotes ?? []).flatMap((row) => articlesDe(row.sources));

  if (avecSujets) {
    const sujetsQuery = supabase
      .from('sujets_anecdote')
      .select('sujet, angle, article, statut')
      .in('statut', ['a_rediger', 'en_cours', 'echoue'])
      .limit(500);
    const { data: sujets, error: sujetsError } = cityPlaceId
      ? await sujetsQuery.eq('city_place_id', cityPlaceId)
      : await sujetsQuery.eq('city', city);
    if (sujetsError) throw new Error(`Sujets illisibles : ${sujetsError.message}`);
    for (const s of sujets ?? []) {
      if (s.statut !== 'echoue') existantes.push({ titre: s.sujet, accroche: s.angle, articles: [s.article] });
      // L'article général d'une ville porte d'autres sujets : un échec ne l'épuise pas.
      articles.push(...articlesSpecifiques([s.article], city));
    }
  }

  return { existantes, articlesExploites: [...new Set(articles)] };
}

// Le libellé que `generated_by` porte pour chaque axe, et que le mode
// `corriger` relit pour réécrire avec le bon prompt.
const LIBELLES_AXE: Record<Axe, string> = {
  patrimoine: '',
  personnalites: ' (axe personnalités)',
  histoire: ' (axe histoire)',
  mentions: ' (axe mentions)',
};

function axeDeLibelle(generatedBy: string | null): Axe {
  const g = generatedBy ?? '';
  if (g.includes(LIBELLES_AXE.personnalites)) return 'personnalites';
  if (g.includes(LIBELLES_AXE.histoire)) return 'histoire';
  if (g.includes(LIBELLES_AXE.mentions)) return 'mentions';
  return 'patrimoine';
}

async function redigerSujet(apiKey: string, supabase: Db, s: Sujet): Promise<BilanSujet> {
  const axe = lireAxe(s.axe);
  const doc: SourceDoc = {
    origine: s.origine,
    title: s.article,
    url: s.url,
    editeur: s.editeur,
    extract: s.extrait,
  };
  const docs = [doc];
  const nom = `${s.city} — ${s.sujet}`;

  const conclure = async (statut: 'redige' | 'echoue' | 'a_rediger', motif: string, extra = {}) => {
    await supabase.from('sujets_anecdote').update({ statut, motif, ...extra }).eq('id', s.id);
    if (s.lot_id) {
      await supabase.rpc('actualiser_lot', {
        p_lot: s.lot_id,
        p_sautees: statut === 'echoue' ? [`${nom} : ${motif}`] : [],
      });
    }
  };
  const echouer = async (motif: string): Promise<BilanSujet> => {
    await conclure('echoue', motif);
    return { sujet: nom, ok: false, publiable: false, motif };
  };

  try {
    const redaction = await chatJSON<Redaction>({
      apiKey,
      system: redactionSystem(axe),
      user: redactionPrompt(s.city, docs, { ...s, faits: s.faits ?? [] }),
      temperature: 0.5,
      maxTokens: 3000,
      etape: 'redaction',
      ville: s.city,
    });
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
    if (!clean.titre) return echouer('Titre manquant.');
    if (!clean.accroche || clean.accroche.length > MAX_ACCROCHE_CHARS) {
      return echouer(`Accroche absente ou trop longue (${clean.accroche.length} caractères).`);
    }
    // Ratées, les passes laissent le texte tel quel : hors caractères, il
    // est écarté ci-dessous ; hors mots seulement, la correction le reprendra.
    clean = neutraliser(await ajuster(apiKey, axe, s.city, clean, docs));
    if (clean.corps.length < MIN_BODY_CHARS || clean.corps.length > MAX_BODY_CHARS) {
      return echouer(
        `Corps hors format : ${clean.corps.length} caractères, attendu entre ${MIN_BODY_CHARS} et ${MAX_BODY_CHARS}.`
      );
    }

    const controle = controler(clean, doc.extract);
    if (!controle.ok) return echouer(controle.reason!);
    const citations = controle.citationsValides;

    // Entre le plan et la rédaction, un autre lot a pu exploiter l'article.
    const { existantes } = await lireExistant(supabase, s.city, s.city_place_id, false);
    const deja = articleDejaTraite([doc.title], existantes, s.city);
    if (deja) return echouer(`« ${doc.title} » a déjà servi à « ${deja.titre} ».`);

    const verification = await verifier(apiKey, s.city, clean, docs);
    // Un `refute` part en brouillon avec ses problèmes : le mode `corriger`
    // tente de le réparer. Il ne sera jamais publié tel quel.
    const qualite = controlerRedaction(clean);
    const publiable = estPubliable(verification, qualite);

    const { data: inserted, error } = await supabase
      .from('anecdotes')
      .insert({
        city: s.city,
        city_place_id: s.city_place_id,
        title: clean.titre,
        hook: clean.accroche,
        body: clean.corps,
        period: clean.periode || null,
        source: `${doc.editeur} — ${doc.title}`,
        source_url: doc.url,
        sources: [{ url: doc.url, titre: doc.title, editeur: doc.editeur }],
        confidence: verification.confiance ?? 'faible',
        verdict: verification.verdict,
        verification_notes: notesDe(verification, citations),
        qualite_ok: qualite.ok,
        qualite_problemes: qualite.problemes,
        problemes: problemesDe(verification, qualite),
        // L'axe n'apparaît que lorsqu'il n'est pas celui d'origine : le mode
        // `corriger` le relit dans ce libellé.
        generated_by: `deepseek:${DEEPSEEK_MODEL} + ${doc.origine}${LIBELLES_AXE[axe]}`,
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = index unique (city_place_id, lower(title)).
      if (error.code === '23505') return echouer(`Titre déjà pris : « ${clean.titre} ».`);
      throw new Error(`Insertion échouée : ${error.message}`);
    }

    const motif = publiable ? 'Publiable.' : problemesDe(verification, qualite).join(' ; ');
    await conclure('redige', motif, { anecdote_id: inserted.id, publiable });
    return { sujet: nom, ok: true, publiable, motif };
  } catch (err) {
    const motif = err instanceof Error ? err.message : String(err);
    console.error('Rédaction', s.id, motif);
    if (s.tentatives < MAX_TENTATIVES_SUJET) {
      await conclure('a_rediger', `Interrompue, reprise au prochain passage : ${motif}`);
      return { sujet: nom, ok: false, publiable: false, motif };
    }
    return echouer(motif);
  }
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
 * Le dossier d'un brouillon déjà en base : les documents qu'il crédite.
 * Plus étroit que le dossier d'origine — c'est voulu : une correction ne
 * doit s'appuyer que sur ce que l'anecdote cite.
 *
 * D'abord le texte gardé avec son sujet dans `sujets_anecdote` : c'est celui
 * que la rédaction a lu, mot pour mot. Le 8 octobre, deux brouillons de
 * Strasbourg ont été rejetés pour « sources introuvables » parce que leur
 * notice Mérimée n'était pas parmi les huit que la relecture rapportait.
 */
async function dossierDe(supabase: Db, b: Brouillon): Promise<SourceDoc[]> {
  const { data: gardes } = await supabase
    .from('sujets_anecdote')
    .select('article, url, editeur, origine, extrait')
    .eq('anecdote_id', b.id)
    .limit(1);
  const garde = gardes?.[0];
  if (garde?.extrait) {
    return [
      {
        origine: garde.origine,
        title: garde.article,
        url: garde.url,
        editeur: garde.editeur,
        extract: garde.extrait,
      },
    ];
  }

  const sources = b.sources ?? [];
  const wiki = sources.filter((s) => s.editeur === 'Wikipédia' && s.titre);
  const merimee = sources.filter((s) => s.editeur !== 'Wikipédia' && s.titre);

  const [wikiDocs, merimeeDocs] = await Promise.all([
    Promise.allSettled(wiki.map((s) => fetchExtract(s.titre!))),
    merimee.length > 0 ? fetchPatrimoineDocs(b.city, [], Infinity) : Promise.resolve([]),
  ]);

  const docs: SourceDoc[] = [];
  for (const r of wikiDocs) {
    if (r.status === 'fulfilled' && r.value) docs.push(r.value);
    else if (r.status === 'rejected') console.error('Wikipédia (correction)', r.reason);
  }
  // Par l'URL, qui porte la référence de la notice : à Strasbourg, plusieurs
  // notices s'intitulent « Immeuble, puis foyer de jeunes ».
  const urlsMerimee = new Set(merimee.map((s) => s.url).filter(Boolean));
  const titresMerimee = new Set(merimee.filter((s) => !s.url).map((s) => s.titre));
  docs.push(...merimeeDocs.filter((d) => urlsMerimee.has(d.url) || titresMerimee.has(d.title)));
  return docs;
}

type Issue = 'publiable' | 'a_reprendre' | 'abandonnee' | 'echec' | 'a_relire';

/**
 * Un brouillon que seul le doute du vérificateur retient : rédaction
 * conforme, aucune faute, citations retrouvées dans la source, mais un
 * verdict `doute`. Après trois corrections, il ne part plus au rejet : il
 * attend une relecture humaine, qui tranche depuis le rapport du matin.
 *
 * Le 9 octobre, deux anecdotes ont été rejetées ainsi, dont une pour une
 * médaille datée de 1839 que le dossier date lui-même de 1839. Un `refute`,
 * une faute ou une citation introuvable restent des rejets : ce n'est pas au
 * relecteur de rattraper un texte inventé.
 */
function relisible(verdict: string | null, qualiteOk: boolean | null, problemes: string[] | null): boolean {
  return (
    verdict === 'doute' &&
    qualiteOk === true &&
    !(problemes ?? []).some((p) => p.startsWith('Orthographe') || p.startsWith('Rédaction'))
  );
}

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
  const axe = axeDeLibelle(b.generated_by);
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
    // La version en base a passé tous les contrôles sauf le vérificateur : la
    // réécriture ratée n'y change rien, elle part en relecture.
    if (abandon && relisible(b.verdict, b.qualite_ok, b.problemes)) {
      await supabase
        .from('anecdotes')
        .update({ corrections: tentative, a_relire: true })
        .eq('id', b.id);
      await journal('a_relire', motif);
      return { id: b.id, ville: b.city, titre: b.title, issue: 'a_relire', motif };
    }
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

  const docs = await dossierDe(supabase, b);
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
      etape: 'correction',
      ville: b.city,
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
  clean = neutraliser(await ajuster(apiKey, axe, b.city, clean, docs));

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
  const aRelire = !publiable && tentative >= MAX_CORRECTIONS && relisible(verification.verdict, qualite.ok, restants);
  const abandon = !publiable && !aRelire && tentative >= MAX_CORRECTIONS;
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
    ...(aRelire ? { a_relire: true } : {}),
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

  const issue: Issue = publiable ? 'publiable' : aRelire ? 'a_relire' : abandon ? 'abandonnee' : 'a_reprendre';
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

// -------------------------------------------------------------------- plan

interface Lot {
  id: string;
  city: string;
  city_place_id: string | null;
  axe: string;
}

// Combien de temps un document lu sans résultat reste hors des dossiers. Un
// mois : assez pour que le plan explore le reste du gisement, pas au point
// d'oublier qu'un article a pu s'enrichir sur Wikipédia depuis.
const JOURS_STERILITE = 30;

/** Les documents lus récemment pour cette ville sans qu'aucun sujet n'en sorte. */
async function lireSteriles(supabase: Db, city: string, cityPlaceId: string | null): Promise<string[]> {
  const depuis = new Date(Date.now() - JOURS_STERILITE * 86_400_000).toISOString();
  const requete = supabase.from('sources_steriles').select('article').gte('created_at', depuis).limit(1000);
  const { data, error } = cityPlaceId
    ? await requete.eq('city_place_id', cityPlaceId)
    : await requete.eq('city', city);
  // Sans la liste, le dossier relit peut-être un article stérile : c'est le
  // comportement d'avant, pas une raison d'arrêter le lot.
  if (error) {
    console.error('Sources stériles illisibles', error);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.article as string))];
}

interface BilanPlan {
  ville: string;
  axe: Axe;
  retenus: number;
  ecartes: string[];
}

/**
 * Choisit jusqu'à `combien` sujets pour le lot et les met en attente. Un seul
 * appel lit le dossier entier ; tout ce qui suit ne lit qu'un article.
 */
async function planifier(
  apiKey: string,
  supabase: Db,
  lot: Lot,
  combien: number,
  axe: Axe
): Promise<BilanPlan> {
  const bilan = (retenus: number, ecartes: string[]): BilanPlan => ({ ville: lot.city, axe, retenus, ecartes });

  // Compté avant l'appel : un plan qui plante a coûté, il compte dans les trois.
  await supabase.rpc('actualiser_lot', { p_lot: lot.id, p_planification: true });

  const { existantes, articlesExploites } = await lireExistant(supabase, lot.city, lot.city_place_id, true);
  const steriles = await lireSteriles(supabase, lot.city, lot.city_place_id);

  // Pas de dossier, pas d'anecdote : on ne retombe jamais sur la mémoire du
  // modèle. Et pas d'appel payant pour le constater. Mais un axe épuisé ne
  // coûte plus un plan : le 9 octobre, Saint-Paul et Saint-Chamond ont
  // dépensé deux de leurs trois plans sur un patrimoine vide. On essaie les
  // axes suivants dans le même plan.
  const vides: string[] = [];
  let docs: SourceDoc[] = [];
  for (const essai of ordreAxes(axe)) {
    docs = await buildDossier(lot.city, articlesExploites, essai, lot.city_place_id, steriles);
    if (docs.length > 0) {
      axe = essai;
      break;
    }
    vides.push(
      `Aucune source neuve pour « ${lot.city} » sur l'axe ${essai} : ${articlesExploites.length} articles déjà exploités, ${steriles.length} lus récemment sans résultat.`
    );
  }
  if (docs.length === 0) {
    await supabase.rpc('actualiser_lot', { p_lot: lot.id, p_sautees: vides });
    return bilan(0, vides);
  }

  // Quelques propositions de plus que nécessaire : le tri en écarte.
  const plan = await chatJSON<{ sujets?: unknown }>({
    apiKey,
    system: PLAN_SYSTEM,
    user: planPrompt(lot.city, dossierPlan(docs), Math.min(combien + 4, 14), existantes),
    temperature: 0.3,
    maxTokens: 4000,
    etape: 'plan',
    ville: lot.city,
  });

  const tri = trierPropositions(plan?.sujets, docs, existantes, lot.city);
  let retenus = tri.retenus;
  const ecartes = [...vides, ...tri.ecartes];

  if (retenus.length > 0 && existantes.length > 0) {
    try {
      const reponse = await chatJSON<unknown>({
        apiKey,
        system: DOUBLONS_PLAN_SYSTEM,
        user: doublonsPlanPrompt(lot.city, retenus, existantes),
        temperature: 0,
        maxTokens: 800,
        etape: 'doublons',
        ville: lot.city,
      });
      const doublons = numerosDoublons(reponse, retenus.length);
      ecartes.push(
        ...retenus
          .filter((_, i) => doublons.has(i + 1))
          .map((r) => `« ${r.sujet} » : thème déjà traité.`)
      );
      retenus = retenus.filter((_, i) => !doublons.has(i + 1));
    } catch (err) {
      // Sans réponse, on ne sait pas : mieux vaut un plan perdu qu'un doublon.
      ecartes.push(`Contrôle des doublons impossible : ${err instanceof Error ? err.message : String(err)}`);
      retenus = [];
    }
  }

  // Un document dont aucun sujet n'a survécu ne revient pas avant un mois.
  // Seulement quand le plan a répondu : un appel en échec ne dit rien des
  // documents.
  if (Array.isArray(plan?.sujets)) {
    const sansSuite = documentsSteriles(docs, retenus);
    if (sansSuite.length > 0) {
      const { error } = await supabase.from('sources_steriles').insert(
        sansSuite.map((article) => ({
          city: lot.city,
          city_place_id: lot.city_place_id,
          article,
          axe,
          lot_id: lot.id,
        }))
      );
      if (error) console.error('Sources stériles', error);
    }
  }

  retenus = retenus.slice(0, combien);
  const parTitre = new Map(docs.map((d) => [d.title, d]));
  if (retenus.length > 0) {
    const { error } = await supabase.from('sujets_anecdote').insert(
      retenus.map((r) => {
        const doc = parTitre.get(r.article)!;
        return {
          lot_id: lot.id,
          city: lot.city,
          city_place_id: lot.city_place_id,
          axe,
          sujet: r.sujet,
          angle: r.angle,
          faits: r.faits,
          citation: r.citation,
          article: doc.title,
          url: doc.url,
          editeur: doc.editeur,
          origine: doc.origine,
          extrait: doc.extract,
        };
      })
    );
    if (error) throw new Error(`Sujets non enregistrés : ${error.message}`);
  }

  await supabase.rpc('actualiser_lot', {
    p_lot: lot.id,
    p_sautees: retenus.length < combien ? [`Plan ${axe} : ${retenus.length} sujet(s) retenu(s) sur ${combien}.`, ...ecartes] : [],
  });
  return bilan(retenus.length, ecartes);
}

/** Écrit les sujets en attente, deux à la fois, tant que le temps le permet. */
async function rediger(apiKey: string, supabase: Db, debut: number, lotId: string | null) {
  const bilans: BilanSujet[] = [];
  while (Date.now() - debut < DEBUT_MAX_REDACTION_MS) {
    // Un à un plutôt que tout le lot d'un coup : ce qui n'est pas réservé
    // reste disponible pour le passage suivant si le temps manque.
    const { data, error } = await supabase.rpc('reserver_sujets', {
      p_limit: REDACTIONS_SIMULTANEES,
      p_lot: lotId,
    });
    if (error) {
      console.error('Réservation des sujets', error);
      break;
    }
    const sujets = (data ?? []) as Sujet[];
    if (sujets.length === 0) break;
    bilans.push(...(await Promise.all(sujets.map((s) => redigerSujet(apiKey, supabase, s)))));
  }
  return bilans;
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
  const debut = Date.now();
  const { data: lot, error } = await supabase
    .from('lots_generation')
    .insert({ mode: 'generation', city, city_place_id: cityPlaceId, axe, demandees: count })
    .select('id, city, city_place_id, axe')
    .single();
  if (error) {
    return { status: 500, body: { error: `Lot non enregistré : ${error.message}` } };
  }

  let plan: BilanPlan;
  try {
    plan = await planifier(apiKey, supabase, lot as Lot, count, axe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Plan', message);
    await supabase
      .from('lots_generation')
      .update({ erreur: message, duree_ms: Date.now() - debut })
      .eq('id', lot.id);
    return { status: 502, body: { lot: lot.id, error: message } };
  }

  const rediges = await rediger(apiKey, supabase, debut, lot.id);
  await supabase.from('lots_generation').update({ duree_ms: Date.now() - debut }).eq('id', lot.id);

  return {
    status: 200,
    body: {
      lot: lot.id,
      plan,
      // Le reste du lot est écrit par le mode `poursuivre`.
      rediges,
    },
  };
}

/**
 * Le passage régulier : replanifie un lot resté sous sa cible, puis écrit
 * les sujets en attente, tous lots confondus.
 */
async function poursuivre(
  apiKey: string,
  supabase: Db
): Promise<{ status: number; body: Record<string, unknown> }> {
  const debut = Date.now();
  const plans: BilanPlan[] = [];

  const { data: lots, error } = await supabase.rpc('lots_a_completer', { p_limit: 1 });
  if (error) console.error('Lots à compléter', error);

  for (const l of (lots ?? []) as Array<Lot & { planifications: number; manque: number }>) {
    // Chaque plan change d'axe : si les monuments n'ont pas suffi, les gens
    // de la ville prennent le relais, puis son histoire. Un axe sans source
    // neuve passe la main au suivant dans le même plan (voir `planifier`).
    const axes = ordreAxes(lireAxe(l.axe));
    const axe = axes[l.planifications % axes.length];
    try {
      plans.push(await planifier(apiKey, supabase, l, Math.min(l.manque, MAX_COUNT), axe));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Replanification', l.id, message);
      await supabase.from('lots_generation').update({ erreur: message }).eq('id', l.id);
    }
  }

  const rediges = await rediger(apiKey, supabase, debut, null);
  return { status: 200, body: { plans, rediges } };
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

  // Chaque appel DeepSeek de cette requête laisse une ligne : le rapport du
  // matin en tire la consommation de la veille.
  compterAvec(async (c) => {
    const { error } = await supabase.from('deepseek_appels').insert(c);
    if (error) console.error('Suivi DeepSeek', error);
  });

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

  if (body.mode === 'poursuivre') {
    const { status, body: reponse } = await poursuivre(DEEPSEEK_API_KEY, supabase);
    return json(reponse, status);
  }

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const cityPlaceId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_COUNT);
  // Une valeur inconnue retombe sur `patrimoine` plutôt que d'échouer : les
  // appelants existants — `produire_lot`, `produire_villes_demandees` — n'en
  // envoient aucune, et c'est leur comportement d'hier qu'il faut préserver.
  const axe = lireAxe(body.axe);

  if (!city) {
    return fail('Paramètre `city` manquant.');
  }

  // Le lot tient son propre journal (`lots_generation`), mis à jour sujet
  // par sujet : il s'écrit sur plusieurs appels.
  const { status, body: reponse } = await generer(
    DEEPSEEK_API_KEY,
    supabase,
    city,
    cityPlaceId,
    count,
    axe
  );
  return json(reponse, status);
});
