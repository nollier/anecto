// Récupère de quoi ancrer l'anecdote dans un texte qui existe vraiment.
//
// L'API MediaWiki est gratuite, sans clé et sans quota, et les communes
// françaises y sont bien documentées. On ramène deux articles au plus :
// celui de la ville, et « Histoire de <ville> » quand il existe.

const API = 'https://fr.wikipedia.org/w/api.php';

// Wikimedia demande un User-Agent identifiable et le renvoie en 403 sinon.
const USER_AGENT = 'Anecto/1.0 (https://github.com/nollier/anecto)';

const MAX_CHARS_PER_DOC = 12000;
const MAX_CHARS_TOTAL = 20000;
const TIMEOUT_MS = 15000;

export interface WikiDoc {
  title: string;
  url: string;
  extract: string;
}

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

/** Extraits en texte brut pour une liste de titres. Les pages absentes sont ignorées. */
async function fetchExtracts(titles: string[]): Promise<WikiDoc[]> {
  if (titles.length === 0) return [];

  const data = await call({
    action: 'query',
    prop: 'extracts|info',
    explaintext: '1',
    exsectionformat: 'plain',
    inprop: 'url',
    redirects: '1',
    titles: titles.join('|'),
  });

  // deno-lint-ignore no-explicit-any
  const pages: Record<string, any> = data?.query?.pages ?? {};

  return Object.values(pages)
    .filter((page) => !page.missing && typeof page.extract === 'string')
    .map((page) => ({
      title: page.title as string,
      url:
        (page.fullurl as string) ??
        `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      extract: (page.extract as string).slice(0, MAX_CHARS_PER_DOC),
    }))
    .filter((doc) => doc.extract.trim().length > 500);
}

export async function fetchCityDocs(city: string): Promise<WikiDoc[]> {
  const cityTitle = await findCityTitle(city);
  if (!cityTitle) return [];

  const docs = await fetchExtracts([cityTitle, `Histoire de ${cityTitle}`]);

  // L'article de la ville d'abord : c'est le plus fiable des deux.
  docs.sort((a, b) => (a.title === cityTitle ? -1 : b.title === cityTitle ? 1 : 0));

  let total = 0;
  return docs.filter((doc) => {
    if (total >= MAX_CHARS_TOTAL) return false;
    doc.extract = doc.extract.slice(0, MAX_CHARS_TOTAL - total);
    total += doc.extract.length;
    return true;
  });
}
