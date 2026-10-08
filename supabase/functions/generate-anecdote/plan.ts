// Choisir les sujets avant d'écrire.
//
// Jusqu'au 7 octobre, chaque essai d'un lot envoyait le dossier entier
// (huit articles, 80 000 caractères) au modèle en lui laissant choisir le
// sujet, rédiger, puis passer les contrôles. Un sujet refusé — doublon,
// citation introuvable, matière trop maigre — coûtait le dossier entier, et
// le suivant repartait de zéro. Le 7 octobre, cinq lots de dix ont rendu deux
// anecdotes à eux cinq.
//
// Désormais le lot se fait en trois temps :
//
//   1. plan       — un seul appel lit le dossier entier et propose une liste
//                   de sujets : l'article qui le porte, l'objet précis, les
//                   faits datés qu'il en tire, une phrase recopiée ;
//   2. contrôle   — déterministe (ce fichier) : l'article existe dans le
//                   dossier, la phrase s'y trouve mot pour mot, l'article est
//                   assez long pour un récit, il n'a pas déjà servi ; puis un
//                   seul appel compare la liste entière à l'existant ;
//   3. rédaction  — chaque sujet retenu est écrit à partir de son seul
//                   article, dix fois plus court que le dossier.
//
// Aucune API Deno ici : les tests tournent sous Node, comme `verification.ts`.

import { articleDejaTraite, estArticleGeneral, type Existante } from './doublons.ts';
import { MIN_CITATION_CHARS, normalize } from './verification.ts';

/** Un article plus court ne porte pas 240 mots sans broder. */
export const MIN_CHARS_ARTICLE_SUJET = 1500;

/** Un article général (la ville, son histoire) porte plusieurs sujets, pas tous. */
export const MAX_SUJETS_PAR_ARTICLE_GENERAL = 3;

/** Ce que le modèle propose. */
export interface Proposition {
  /** Numéro du document dans le dossier (voir `dossierPlan`). */
  document?: number;
  article: string;
  sujet: string;
  angle: string;
  faits: string[];
  citation: string;
}

/** Un document du dossier, réduit à ce que le contrôle regarde. */
export interface DocPlan {
  title: string;
  extract: string;
}

export interface SujetRetenu extends Proposition {
  /** Le titre exact du document, tel qu'il est dans le dossier. */
  article: string;
}

export interface TriPlan {
  retenus: SujetRetenu[];
  ecartes: string[];
}

function simplifier(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Le dossier tel que le plan le lit : chaque document porte un numéro, et
 * c'est ce numéro que le modèle rend. Le 8 octobre, invité à recopier le
 * titre, il a recopié toute la ligne d'en-tête (« Hôtel Petipas de Walle —
 * Wikipédia (https://…) ») et le lot de Lille est resté vide.
 */
export function dossierPlan(docs: Array<DocPlan & { editeur?: string }>): string {
  return docs
    .map((d, i) => `=== DOCUMENT ${i + 1} : ${d.title}${d.editeur ? ` (${d.editeur})` : ''} ===\n${d.extract}`)
    .join('\n\n');
}

/**
 * Le document que désigne une proposition : par son numéro d'abord, sinon
 * par son titre, en tolérant ce que le modèle colle autour (éditeur, URL,
 * « DOCUMENT 3 : »).
 */
export function documentDe<D extends DocPlan>(p: Partial<Proposition>, docs: D[]): D | undefined {
  const n = Number(p.document);
  if (Number.isInteger(n) && n >= 1 && n <= docs.length) return docs[n - 1];

  const brut = simplifier(String(p.article ?? '').replace(/^\s*document\s*\d+\s*:\s*/i, ''));
  if (!brut) return undefined;
  const exact = docs.find((d) => simplifier(d.title) === brut);
  if (exact) return exact;
  // Le titre suivi d'autre chose : on garde le plus long titre qui préfixe.
  return docs
    .filter((d) => {
      const t = simplifier(d.title);
      return brut.startsWith(t) && /^[\s—–\-(:,]/.test(brut.slice(t.length));
    })
    .sort((a, b) => b.title.length - a.title.length)[0];
}

/**
 * Le tri déterministe des propositions. Rien n'y dépend d'un modèle : un
 * sujet dont la phrase n'est pas dans l'article désigné est un sujet inventé,
 * et on ne dépense pas une rédaction dessus.
 *
 * @param existantes anecdotes en vie et sujets en attente pour la ville.
 */
export function trierPropositions(
  propositions: unknown,
  docs: DocPlan[],
  existantes: Existante[],
  ville: string
): TriPlan {
  const retenus: SujetRetenu[] = [];
  const ecartes: string[] = [];
  const parArticle = new Map<string, number>();

  for (const brut of Array.isArray(propositions) ? propositions : []) {
    const p = (brut ?? {}) as Partial<Proposition>;
    const sujet = String(p.sujet ?? '').trim();
    const angle = String(p.angle ?? '').trim();
    const citation = String(p.citation ?? '').trim();
    const faits = Array.isArray(p.faits)
      ? p.faits.map((f) => String(f).trim()).filter(Boolean).slice(0, 6)
      : [];
    const doc = documentDe(p, docs);
    const nom = sujet || angle || '(sans nom)';

    if (!sujet || !angle) {
      ecartes.push(`« ${nom} » : sujet ou angle manquant.`);
      continue;
    }
    if (!doc) {
      ecartes.push(`« ${nom} » : l'article « ${p.article ?? ''} » n'est pas dans le dossier.`);
      continue;
    }
    if (citation.length < MIN_CITATION_CHARS || !normalize(doc.extract).includes(normalize(citation))) {
      ecartes.push(`« ${nom} » : la phrase citée ne figure pas dans « ${doc.title} ».`);
      continue;
    }
    if (doc.extract.length < MIN_CHARS_ARTICLE_SUJET) {
      ecartes.push(`« ${nom} » : « ${doc.title} » fait ${doc.extract.length} caractères, trop peu pour un récit.`);
      continue;
    }
    const general = estArticleGeneral(doc.title, ville);
    if (!general) {
      const deja = articleDejaTraite([doc.title], existantes, ville);
      if (deja) {
        ecartes.push(`« ${nom} » : « ${doc.title} » a déjà servi à « ${deja.titre} ».`);
        continue;
      }
    }
    const cle = simplifier(doc.title);
    const n = parArticle.get(cle) ?? 0;
    if (n >= (general ? MAX_SUJETS_PAR_ARTICLE_GENERAL : 1)) {
      ecartes.push(`« ${nom} » : « ${doc.title} » porte déjà un sujet de ce lot.`);
      continue;
    }
    if (retenus.some((r) => simplifier(r.sujet) === simplifier(sujet))) {
      ecartes.push(`« ${nom} » : proposé deux fois.`);
      continue;
    }
    parArticle.set(cle, n + 1);
    retenus.push({ article: doc.title, sujet, angle, faits, citation });
  }

  return { retenus, ecartes };
}

// ------------------------------------------------------------------ prompts

export const PLAN_SYSTEM = `Tu prépares le travail d'un rédacteur d'anecdotes d'histoire locale. On te donne un dossier documentaire sur une ville, fait de plusieurs articles. Tu ne rédiges rien : tu repères dans le dossier des sujets d'anecdote distincts, chacun assez documenté pour un récit de 250 à 400 mots.

Un bon sujet est un objet précis, qu'on peut désigner par un nom propre ou une date : tel bâtiment et ce qui lui est arrivé, telle personne et un épisode daté de sa vie, tel événement, telle coutume, l'origine de tel nom. Pas une généralité (« l'histoire de la ville », « le patrimoine religieux »), pas de démographie, pas de géographie.

Règles :
- Chaque sujet repose sur UN SEUL document du dossier. Donne son numéro dans "document" (le nombre qui suit « === DOCUMENT ») et son titre dans "article".
- L'article doit contenir lui-même, sur ce sujet, au moins trois faits précis (dates, noms, chiffres) : sans eux, pas de récit possible. Liste-les dans "faits", en quelques mots chacun, tels que l'article les donne.
- "citation" : une phrase de l'article, recopiée caractère pour caractère, qui établit le cœur du sujet. Elle est comparée automatiquement à l'article : une phrase approximative fait écarter le sujet.
- Le sujet doit se passer dans la ville demandée ou s'y rattacher directement.
- Deux sujets ne portent jamais sur le même objet. Un article de monument ou de personne ne donne qu'un sujet ; l'article général de la ville ou de son histoire peut en donner plusieurs, sur des objets différents.
- N'en propose aucun qui reprenne l'objet d'une anecdote déjà écrite, même sous un autre angle.
- Moins de sujets solides vaut mieux que davantage de sujets maigres. Si le dossier n'en offre aucun, renvoie une liste vide.

Réponds uniquement par un objet json :
{
  "sujets": [
    {
      "document": 3,
      "article": "titre du document",
      "sujet": "l'objet précis, en quelques mots",
      "angle": "ce que l'anecdote raconte, en une phrase",
      "faits": ["fait daté 1", "fait daté 2", "fait daté 3"],
      "citation": "phrase exacte de l'article"
    }
  ]
}`;

export function planPrompt(
  ville: string,
  dossier: string,
  combien: number,
  existantes: Existante[]
): string {
  const deja =
    existantes.length > 0
      ? `\n\nANECDOTES DÉJÀ ÉCRITES OU PRÉVUES POUR ${ville.toUpperCase()} (sujets interdits)\n${existantes
          .map((e) => `- ${e.titre}${e.accroche ? ` : ${e.accroche}` : ''}`)
          .join('\n')}`
      : '';
  return `DOSSIER DOCUMENTAIRE SUR ${ville.toUpperCase()}
${dossier}

=== FIN DU DOSSIER ===${deja}

Propose jusqu'à ${combien} sujets d'anecdote distincts sur ${ville}, tirés du dossier. Réponds en json.`;
}

// Le contrôle des doublons, une fois pour toute la liste plutôt qu'une fois
// par récit rédigé : un doublon écarté ici n'a coûté aucune rédaction.
export const DOUBLONS_PLAN_SYSTEM = `Tu es éditeur d'une application qui envoie chaque jour une anecdote d'histoire locale sur une ville. Un lecteur ne doit jamais recevoir deux anecdotes sur le même thème.

On te donne une liste numérotée de sujets candidats et la liste des anecdotes déjà écrites pour la même ville. Pour chaque candidat, dis s'il a le même objet précis (tel bâtiment, telle personne, tel événement, telle coutume, l'origine de tel mot) qu'une anecdote existante, même sous un autre angle ou à une autre époque.

Deux objets distincts de même nature (deux églises, deux incendies à des dates différentes) ne sont pas des doublons. Un lieu ou un personnage cité en passant ne fait pas un doublon.

Réponds uniquement en json : {"doublons": [{"numero": 1, "titre": "titre de l'anecdote existante"}]}. Liste vide s'il n'y en a aucun.`;

export function doublonsPlanPrompt(
  ville: string,
  candidats: Array<Pick<Proposition, 'sujet' | 'angle'>>,
  existantes: Existante[]
): string {
  return `VILLE : ${ville}

ANECDOTES DÉJÀ ÉCRITES
${existantes.map((e) => `- ${e.titre}${e.accroche ? ` : ${e.accroche}` : ''}`).join('\n')}

CANDIDATS
${candidats.map((c, i) => `${i + 1}. ${c.sujet} : ${c.angle}`).join('\n')}

Quels candidats reprennent l'objet d'une anecdote déjà écrite ? Réponds en json.`;
}

/** Les numéros (à partir de 1) que le modèle déclare doublons. */
export function numerosDoublons(reponse: unknown, total: number): Set<number> {
  const liste = (reponse as { doublons?: unknown })?.doublons;
  const numeros = new Set<number>();
  for (const d of Array.isArray(liste) ? liste : []) {
    const n = Number((d as { numero?: unknown })?.numero);
    if (Number.isInteger(n) && n >= 1 && n <= total) numeros.add(n);
  }
  return numeros;
}

/** La consigne de rédaction d'un sujet déjà choisi et sourcé. */
export function sujetImpose(s: Pick<Proposition, 'sujet' | 'angle' | 'faits'>): string {
  return `SUJET IMPOSÉ
Objet : ${s.sujet}
Angle : ${s.angle}
Faits repérés dans l'article : ${s.faits.length > 0 ? s.faits.join(' ; ') : '(non précisés)'}

Écris l'anecdote sur ce sujet et seulement celui-ci, à partir de l'article ci-dessus. Tu peux t'appuyer sur tout ce que l'article dit de ce sujet, au-delà des faits repérés. Si l'article ne permet pas d'écrire 240 mots sur ce sujet sans rien inventer, renvoie trouve = false.`;
}
