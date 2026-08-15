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

const MAX_CHARS_PER_DOC = 8000;
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

/** Extraits en texte brut. Les pages absentes sont ignorées. */
async function fetchExtracts(titles: string[]): Promise<SourceDoc[]> {
  if (titles.length === 0) return [];

  const data = await call({
    action: 'query',
    prop: 'extracts|info',
    explaintext: '1',
    exsectionformat: 'plain',
    // Sans exlimit, MediaWiki ne renvoie l'extrait que du premier titre.
    exlimit: 'max',
    inprop: 'url',
    redirects: '1',
    titles: titles.join('|'),
  });

  // deno-lint-ignore no-explicit-any
  const pages: Record<string, any> = data?.query?.pages ?? {};

  return Object.values(pages)
    .filter((page) => !page.missing && typeof page.extract === 'string')
    .map((page) => ({
      origine: 'wikipedia' as const,
      title: page.title as string,
      url:
        (page.fullurl as string) ??
        `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      editeur: 'Wikipédia',
      extract: (page.extract as string).slice(0, MAX_CHARS_PER_DOC),
    }))
    .filter((doc) => doc.extract.trim().length > 400);
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
    cityTitle,
    `Histoire de ${cityTitle}`,
    `Liste des monuments historiques de ${cityTitle}`,
    ...linked,
  ];

  const docs = await fetchExtracts([...new Set(titres)]);

  // L'article de la ville en tête : c'est le plus fiable et le mieux relu.
  docs.sort((a, b) => Number(b.title === cityTitle) - Number(a.title === cityTitle));
  return docs;
}
