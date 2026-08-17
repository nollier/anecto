// Dossier documentaire Wikipédia.
//
// L'article général d'une commune donne peu d'anecdotes : quelques lignes
// d'histoire noyées dans la démographie. Le gisement est dans les articles
// liés — chaque château, église, fort ou halle a souvent le sien, et c'est là
// que se trouvent les récits datés.
//
// API MediaWiki : gratuite, sans clé, sans quota.

import type { SourceDoc } from './sources.ts';

const API = 'https://fr.wikipedia.org/w/api.php';

// Wikimedia demande un User-Agent identifiable et répond 403 sinon.
const USER_AGENT = 'Anecto/1.0 (https://github.com/nollier/anecto)';

// Un article de monument fait couramment 30 000 à 40 000 caractères, et c'est
// dans le détail — dimensions, coûts, noms d'ingénieurs, durée des chantiers —
// que se trouve la matière d'un récit. Tronquer à 8 000 revenait à ne garder
// que l'introduction.
const MAX_CHARS_PER_DOC = 16000;
const MAX_LINKED_ARTICLES = 6;
const TIMEOUT_MS = 15000;

// Titres d'articles qui promettent du récit plutôt que de la statistique.
const PATRIMOINE =
  /^(église|cathédrale|abbaye|chapelle|basilique|prieuré|collégiale|couvent|château|fort|citadelle|tour|donjon|remparts?|porte|manoir|hôtel|halles?|beffroi|moulin|pont|phare|musée|temple|théâtre|arènes|aqueduc|maison|place|statue|monument)\b/i;

// deno-lint-ignore no-explicit-any
async function call(params: Record<string, string>): Promise<any> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ format: 'json', ...params })) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Wikipédia ${res.status} : ${await res.text()}`);
  }
  return await res.json();
}

/** Titre de l'article le plus probable pour cette ville. */
async function findCityTitle(city: string): Promise<string | null> {
  const data = await call({
    action: 'query',
    list: 'search',
    srsearch: city,
    srlimit: '5',
    srnamespace: '0',
  });

  const hits: Array<{ title: string }> = data?.query?.search ?? [];
  if (hits.length === 0) return null;

  // Un titre identique au nom saisi vaut mieux que le premier résultat de
  // pertinence, qui peut être une homonymie ou une personnalité locale.
  const exact = hits.find((h) => h.title.toLowerCase() === city.toLowerCase());
  return (exact ?? hits[0]).title;
}

/** Articles liés depuis la page de la ville qui ressemblent à du patrimoine. */
async function findLinkedHeritage(cityTitle: string): Promise<string[]> {
  const data = await call({
    action: 'query',
    prop: 'links',
    plnamespace: '0',
    pllimit: '500',
    titles: cityTitle,
  });

  // deno-lint-ignore no-explicit-any
  const pages: Record<string, any> = data?.query?.pages ?? {};
  const links: string[] = Object.values(pages).flatMap((page) =>
    // deno-lint-ignore no-explicit-any
    (page.links ?? []).map((l: any) => l.title as string)
  );

  const retenus = links.filter((title) => PATRIMOINE.test(title));

  // Un monument dont le titre cite la ville lui appartient à coup sûr ;
  // les autres peuvent être des articles génériques homonymes.
  const local = (title: string) => title.toLowerCase().includes(cityTitle.toLowerCase());
  retenus.sort((a, b) => Number(local(b)) - Number(local(a)));

  return retenus.slice(0, MAX_LINKED_ARTICLES);
}

/**
 * Extrait en texte brut d'un seul article. Page absente ou trop maigre : null.
 *
 * Une requête par titre, et non une requête groupée. L'API TextExtracts refuse
 * de renvoyer plus d'un article *complet* à la fois, quelle que soit la valeur
 * d'`exlimit` : elle abaisse la limite à 1 et se contente de le signaler dans
 * un champ `warnings` que personne ne lit —
 *
 *   "exlimit" was too large for a whole article extracts request, lowered to 1.
 *
 * Groupées, huit demandes sur neuf revenaient donc vides, sans la moindre
 * erreur : le dossier se réduisait au premier article que MediaWiki daignait
 * traiter, qui n'était même pas celui de la ville.
 */
async function fetchExtract(title: string): Promise<SourceDoc | null> {
  const data = await call({
    action: 'query',
    prop: 'extracts|info',
    explaintext: '1',
    exsectionformat: 'plain',
    inprop: 'url',
    redirects: '1',
    titles: title,
  });

  // deno-lint-ignore no-explicit-any
  const pages: Record<string, any> = data?.query?.pages ?? {};
  const page = Object.values(pages)[0];

  if (!page || page.missing || typeof page.extract !== 'string') return null;

  const extract = (page.extract as string).slice(0, MAX_CHARS_PER_DOC);
  if (extract.trim().length <= 400) return null;

  return {
    origine: 'wikipedia',
    title: page.title as string,
    url:
      (page.fullurl as string) ??
      `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    editeur: 'Wikipédia',
    extract,
  };
}

export async function fetchWikipediaDocs(city: string): Promise<SourceDoc[]> {
  const cityTitle = await findCityTitle(city);
  if (!cityTitle) return [];

  let linked: string[] = [];
  try {
    linked = await findLinkedHeritage(cityTitle);
  } catch (err) {
    // Les articles liés sont un bonus : leur absence ne doit pas tout bloquer.
    console.error('Wikipédia liens', err);
  }

  const titres = [
    ...new Set([
      cityTitle,
      `Histoire de ${cityTitle}`,
      `Liste des monuments historiques de ${cityTitle}`,
      ...linked,
    ]),
  ];

  // En parallèle : neuf allers-retours en séquence tiendraient mal dans le
  // temps d'exécution de la fonction. Un titre inexistant — « Histoire de X »
  // n'existe pas pour toutes les communes — ne doit rien interrompre.
  const resultats = await Promise.allSettled(titres.map(fetchExtract));

  const docs: SourceDoc[] = [];
  resultats.forEach((resultat, i) => {
    if (resultat.status === 'rejected') {
      console.error(`Wikipédia « ${titres[i]} »`, resultat.reason);
    } else if (resultat.value) {
      docs.push(resultat.value);
    }
  });

  // L'article de la ville en tête : c'est le plus fiable et le mieux relu.
  docs.sort((a, b) => Number(b.title === cityTitle) - Number(a.title === cityTitle));
  return docs;
}
