// Base Mérimée, via la Plateforme ouverte du patrimoine (ministère de la
// Culture). Une notice par monument protégé ou inventorié, avec un historique
// qui est exactement la matière qu'on cherche : dates de construction,
// commanditaires, architectes, remaniements, usages successifs.
//
// Gratuite, sans clé.
//
// API POPv2, en service depuis l'été 2026. L'ancienne route
// `/search/merimee/_msearch` répond 404 depuis au moins le 17/08 : pendant
// ces semaines, ce fichier rendait un dossier vide et Wikipédia faisait tout.
// Les routes de la v2 ne sont pas documentées ; celle-ci vient du contrat
// ts-rest embarqué dans le site www.pop.culture.gouv.fr :
//
//   GET /search/simple?bases[]=merimee&facets[COM][]=<commune>&size=<n>
//
// Les tableaux passent en notation crochets : `bases=merimee` est refusé
// (« Expected array »). La recherche rend directement HIST et DESC, sans
// appel par notice.
//
// Attention au champ HISTORIQUE : dans la v2, c'est le journal des
// modifications de la notice (noms et courriels des agents), pas un texte
// d'histoire. Il ne doit jamais entrer dans un dossier.

import { type SourceDoc, toPlainText } from './sources.ts';

const ENDPOINT = 'https://api.pop.culture.gouv.fr/search/simple';
const NOTICE_URL = 'https://www.pop.culture.gouv.fr/notice/merimee/';

// Lille compte 273 notices, dont six seulement dépassent 300 caractères de
// texte : on en demande large pour trier ensuite par richesse.
const TAILLE_RECHERCHE = 300;
const MAX_NOTICES = 8;
const MIN_CHARS = 300;
const MAX_CHARS_PER_DOC = 4000;
const TIMEOUT_MS = 20000;

const CHAMPS_TEXTE = ['HIST', 'DESC'];
const CHAMPS_TITRE = ['TICO', 'TITR', 'DENO', 'APPL'];

// deno-lint-ignore no-explicit-any
type Source = Record<string, any>;

function firstString(source: Source, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0].trim();
    }
  }
  return '';
}

function simplifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function communes(source: Source): string[] {
  const com = source.COM;
  if (Array.isArray(com)) return com.filter((c): c is string => typeof c === 'string');
  return typeof com === 'string' ? [com] : [];
}

/** Départements des notices, lus dans le code INSEE (« 42207 » → « 42 »). */
function departements(source: Source): string[] {
  let insee: unknown = source.INSEE;
  if (typeof insee === 'string' && insee.trim().startsWith('[')) {
    try {
      insee = JSON.parse(insee);
    } catch {
      // Laissé tel quel : le code est alors lu comme une chaîne simple.
    }
  }
  const codes = Array.isArray(insee) ? insee : [insee];
  return codes
    .filter((c): c is string => typeof c === 'string' && c.length >= 2)
    // Corse (2A, 2B) et outre-mer (971…) : trois caractères suffisent à les
    // distinguer, deux suffisent ailleurs.
    .map((c) => (c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2)));
}

/**
 * Les notices exploitables pour cette commune, de la plus riche à la moins
 * riche. Fonction pure : elle se teste sous Node.
 *
 * Rend une liste vide quand la commune est ambiguë. `facets[COM]` filtre sur
 * le nom seul, et Saint-Paul existe dans une dizaine de départements : mieux
 * vaut pas de notice qu'une chapelle de Saint-Paul (Oise) dans une anecdote
 * sur Saint-Paul de La Réunion.
 */
export function selectionnerNotices(
  sources: Source[],
  city: string,
  exclure: string[] = []
): SourceDoc[] {
  const ville = simplifier(city);
  const deLaVille = sources.filter((s) => communes(s).some((c) => simplifier(c) === ville));

  const dpts = new Set(deLaVille.flatMap(departements));
  if (dpts.size > 1) {
    console.error(
      `Mérimée : « ${city} » existe dans plusieurs départements (${[...dpts].join(', ')}), notices écartées.`
    );
    return [];
  }

  const dejaVus = new Set(exclure.map(simplifier));
  const docs: SourceDoc[] = [];

  for (const source of deLaVille) {
    const texte = toPlainText(
      CHAMPS_TEXTE.map((champ) => firstString(source, [champ]))
        .filter(Boolean)
        .join('\n\n')
    );
    if (texte.length < MIN_CHARS) continue;

    const ref = firstString(source, ['REF']);
    const titre = firstString(source, CHAMPS_TITRE) || `Notice Mérimée ${ref}`;
    if (dejaVus.has(simplifier(titre))) continue;

    docs.push({
      origine: 'merimee',
      title: titre,
      url: ref ? `${NOTICE_URL}${encodeURIComponent(ref)}` : NOTICE_URL,
      editeur: 'Base Mérimée — ministère de la Culture',
      extract: texte.slice(0, MAX_CHARS_PER_DOC),
    });
  }

  return docs.sort((a, b) => b.extract.length - a.extract.length).slice(0, MAX_NOTICES);
}

/**
 * @param exclure titres de notices déjà exploitées : comme pour Wikipédia,
 *                c'est ce qui fait tourner le dossier d'un lot à l'autre.
 */
export async function fetchPatrimoineDocs(city: string, exclure: string[] = []): Promise<SourceDoc[]> {
  const params = new URLSearchParams();
  params.append('bases[]', 'merimee');
  params.append('facets[COM][]', city);
  params.append('size', String(TAILLE_RECHERCHE));

  let payload: unknown;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error('Mérimée', res.status, (await res.text()).slice(0, 300));
      return [];
    }
    payload = await res.json();
  } catch (err) {
    console.error('Mérimée injoignable', err);
    return [];
  }

  // deno-lint-ignore no-explicit-any
  const hits: any[] = (payload as any)?.hits ?? [];
  if (!Array.isArray(hits) || hits.length === 0) return [];

  const sources = hits
    .map((hit) => hit?._source)
    .filter((s): s is Source => !!s && typeof s === 'object');

  return selectionnerNotices(sources, city, exclure);
}
