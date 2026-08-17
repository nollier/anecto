// Dossier documentaire Wikipédia.
//
// L'article général d'une commune donne peu d'anecdotes : quelques lignes
// d'histoire noyées dans la démographie. Le gisement est dans les articles de
// monuments — chaque château, église, hôtel particulier ou halle a le sien, et
// c'est là que se trouvent les récits datés.
//
// Deux principes gouvernent ce fichier :
//
//   1. On cherche les monuments par CATÉGORIE plutôt qu'en filtrant les liens
//      de la page ville avec une expression régulière. « Catégorie:Monument
//      historique à Rennes » rend 53 articles, tous pertinents ; le filtrage
//      par titre en rendait six, choisis sur la seule foi de leur premier mot.
//
//   2. Le dossier TOURNE. On exclut les articles déjà exploités par les
//      anecdotes existantes, si bien que chaque génération explore un terrain
//      neuf. Sans cela le modèle revenait indéfiniment au même monument, et
//      trente anecdotes par ville étaient hors d'atteinte.
//
// API MediaWiki : gratuite, sans clé. Elle applique en revanche une limite de
// débit — d'où le nombre volontairement réduit de requêtes par dossier.

import type { SourceDoc } from './sources.ts';

const API = 'https://fr.wikipedia.org/w/api.php';

// Wikimedia demande un User-Agent identifiable et répond 403 sinon.
const USER_AGENT = 'Anecto/1.0 (https://github.com/nollier/anecto)';

const MAX_CHARS_PER_DOC = 10000;
// Nombre d'articles de monuments retenus par dossier. Au-delà, le modèle
// s'éparpille et le coût des deux passes augmente sans gain de qualité.
const MAX_ARTICLES = 7;
const TIMEOUT_MS = 15000;

// Repli quand la commune n'a ni catégorie ni liste de monuments : on filtre
// alors les liens de la page ville, comme avant.
const PATRIMOINE =
  /^(église|cathédrale|abbaye|chapelle|basilique|prieuré|collégiale|couvent|château|fort|citadelle|tour|donjon|remparts?|porte|manoir|hôtel|halles?|beffroi|moulin|pont|phare|musée|temple|théâtre|arènes|aqueduc|maison|place|statue|monument|palais|opéra|prison|caserne)\b/i;

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
    throw new Error(`Wikipédia ${res.status} : ${(await res.text()).slice(0, 200)}`);
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

/** Membres d'une catégorie, ou liste vide si elle n'existe pas. */
async function membresCategorie(nom: string): Promise<string[]> {
  try {
    const data = await call({
      action: 'query',
      list: 'categorymembers',
      cmtitle: nom,
      cmnamespace: '0',
      cmlimit: '500',
    });
    // deno-lint-ignore no-explicit-any
    return (data?.query?.categorymembers ?? []).map((m: any) => m.title as string);
  } catch {
    return [];
  }
}

/** Liens sortants d'un article, ou liste vide s'il n'existe pas. */
async function liens(titre: string): Promise<string[]> {
  try {
    const data = await call({
      action: 'query',
      prop: 'links',
      plnamespace: '0',
      pllimit: '500',
      titles: titre,
    });
    // deno-lint-ignore no-explicit-any
    const pages: Record<string, any> = data?.query?.pages ?? {};
    // deno-lint-ignore no-explicit-any
    return Object.values(pages).flatMap((p) => (p.links ?? []).map((l: any) => l.title as string));
  } catch {
    return [];
  }
}

/**
 * Les monuments candidats, du plus sûr au moins sûr.
 *
 * La casse des catégories varie d'une commune à l'autre — « à Rennes »,
 * « de Bordeaux » — et rien ne garantit qu'elles existent. On tente les deux
 * formes, puis la liste des monuments historiques, puis les liens de la page
 * ville. Chaque source échoue en silence : c'est le cumul qui compte.
 */
async function trouverMonuments(cityTitle: string): Promise<string[]> {
  const [categorieA, categorieDe, listeMH, liensVille] = await Promise.all([
    membresCategorie(`Catégorie:Monument historique à ${cityTitle}`),
    membresCategorie(`Catégorie:Monument historique de ${cityTitle}`),
    liens(`Liste des monuments historiques de ${cityTitle}`),
    liens(cityTitle),
  ]);

  const candidats = [
    ...categorieA,
    ...categorieDe,
    ...listeMH.filter((t) => PATRIMOINE.test(t)),
    ...liensVille.filter((t) => PATRIMOINE.test(t)),
  ];

  // Les pages de liste ne racontent rien : elles énumèrent.
  const utiles = candidats.filter((t) => !/^(liste|catégorie)\b/i.test(t));

  return [...new Set(utiles)];
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
  // Une notice de trois lignes ne porte pas un récit de 400 mots.
  if (extract.trim().length <= 1200) return null;

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

/**
 * @param exclure titres d'articles déjà exploités par des anecdotes existantes.
 *                C'est ce paramètre qui fait tourner le dossier.
 */
export async function fetchWikipediaDocs(
  city: string,
  exclure: string[] = []
): Promise<SourceDoc[]> {
  const cityTitle = await findCityTitle(city);
  if (!cityTitle) return [];

  const dejaVus = new Set(exclure.map((t) => t.toLowerCase()));

  let monuments: string[] = [];
  try {
    monuments = await trouverMonuments(cityTitle);
  } catch (err) {
    console.error('Wikipédia monuments', err);
  }

  const neufs = monuments.filter((t) => !dejaVus.has(t.toLowerCase()));

  // Quand tous les monuments ont servi, on revient sur l'article de la ville et
  // son histoire : ils restent riches, et c'est préférable à un dossier vide.
  const contexte = [cityTitle, `Histoire de ${cityTitle}`].filter(
    (t) => neufs.length === 0 || !dejaVus.has(t.toLowerCase())
  );

  const titres = [...new Set([...neufs.slice(0, MAX_ARTICLES), ...contexte])];
  if (titres.length === 0) return [];

  const resultats = await Promise.allSettled(titres.map(fetchExtract));

  const docs: SourceDoc[] = [];
  resultats.forEach((resultat, i) => {
    if (resultat.status === 'rejected') {
      console.error(`Wikipédia « ${titres[i]} »`, resultat.reason);
    } else if (resultat.value) {
      docs.push(resultat.value);
    }
  });

  return docs;
}
