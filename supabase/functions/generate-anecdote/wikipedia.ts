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
//   3. Le patrimoine bâti n'est pas le seul axe. Les trente anecdotes de
//      Bordeaux sortaient toutes de la recherche par monument : basiliques,
//      fontaines, cimetières, gare, châteaux d'eau. Le corpus tournait bien
//      d'un bâtiment à l'autre, mais jamais d'un sujet à l'autre — un lecteur
//      qui a lu vingt façades ne revient pas pour la vingt-et-unième.
//      L'axe `personnalites` ouvre un second gisement, celui des gens : les catégories de
//      naissance, de décès et de personnalité liée rendent des articles aussi
//      datés que ceux des monuments, et racontent autre chose.
//
//   4. Un troisième axe, `histoire`, depuis le 9 octobre : les événements,
//      les fêtes, les institutions disparues. Lille avait 47 anecdotes et des
//      lots qui revenaient vides, alors que la catégorie « Histoire de Lille »
//      compte soixante articles (Fête de l'Épinette, Jeanne Maillotte, Vœu du
//      faisan) et l'article « Histoire de Lille » six sièges datés.
//
//   5. Un quatrième, `mentions`, depuis le 10 octobre, pour les villes que
//      les trois autres ont épuisées. Saint-Jean-de-Luz n'avait plus que des
//      notices de 400 à 900 caractères, alors que 1 834 articles de Wikipédia
//      la citent : son port, son phare, ses corsaires, la colonisation basque
//      des Amériques. On les trouve par la recherche plein texte, et on ne
//      garde que ceux qui parlent vraiment de la ville et racontent une
//      histoire datée (voir `estRacontable`).
//
// API MediaWiki : gratuite, sans clé. Elle applique en revanche une limite de
// débit — d'où le nombre volontairement réduit de requêtes par dossier.

import { melanger, type SourceDoc } from './sources.ts';

const API = 'https://fr.wikipedia.org/w/api.php';

// Wikimedia demande un User-Agent identifiable et répond 403 sinon.
const USER_AGENT = 'Anecto/1.0 (https://github.com/nollier/anecto)';

const MAX_CHARS_PER_DOC = 10000;
// Nombre d'articles de monuments retenus par dossier. Au-delà, le modèle
// s'éparpille et le coût des deux passes augmente sans gain de qualité.
const MAX_ARTICLES = 7;
// Articles lus au plus, sur l'axe des mentions, pour en trouver sept qui
// racontent : quatre paquets de sept.
const MAX_LECTURES_MENTIONS = 28;
const TIMEOUT_MS = 15000;

/**
 * L'axe de recherche du dossier.
 *
 * `patrimoine` est l'historique et reste le défaut : aucun appel existant ne
 * change de comportement. `personnalites` sert à sortir une ville de l'ornière
 * quand son corpus ne parle plus que de pierres.
 */
export type Axe = 'patrimoine' | 'personnalites' | 'histoire' | 'mentions';

/**
 * L'ordre dans lequel un lot tourne d'un axe à l'autre. `mentions` vient en
 * dernier : un lot fait trois plans, il n'y arrive que lorsqu'un des trois
 * premiers axes n'a plus de source neuve.
 */
export const AXES: Axe[] = ['patrimoine', 'personnalites', 'histoire', 'mentions'];

/** Lit un axe venu de la base ou d'une requête. Inconnu : `patrimoine`. */
export function lireAxe(valeur: unknown): Axe {
  return AXES.includes(valeur as Axe) ? (valeur as Axe) : 'patrimoine';
}

/**
 * Les axes à essayer, à partir de `premier`, dans l'ordre de rotation. Un axe
 * sans source neuve cède sa place au suivant dans le même plan, au lieu de
 * coûter l'un des trois plans du lot.
 */
export function ordreAxes(premier: Axe): Axe[] {
  const i = AXES.indexOf(premier);
  return [...AXES.slice(i), ...AXES.slice(0, i)];
}

// Repli quand la commune n'a ni catégorie ni liste de monuments : on filtre
// alors les liens de la page ville, comme avant.
//
// La liste d'origine décrit une commune de France métropolitaine : église,
// château, halles, beffroi. Elle rend une anecdote pour Saint-Paul de La
// Réunion, où le patrimoine porte d'autres noms — le cimetière marin, la
// grotte des Premiers Français, le lazaret de la Grande Chaloupe, les
// sucreries. Aucun de ces articles ne commençait par un mot reconnu, et le
// dossier revenait avec deux documents au lieu de sept.
//
// Les ajouts restent des mots qui désignent un lieu daté et racontable. On
// n'ajoute ni « rue » ni « quartier » : leurs articles énumèrent, ils ne
// racontent pas.
const PATRIMOINE =
  /^(église|cathédrale|abbaye|chapelle|basilique|prieuré|collégiale|couvent|séminaire|presbytère|calvaire|temple|mosquée|synagogue|pagode|château|fort|citadelle|batterie|redoute|poudrière|tour|donjon|remparts?|porte|manoir|villa|case|hôtel|halles?|beffroi|moulin|pont|phare|sémaphore|musée|théâtre|arènes|aqueduc|maison|place|statue|monument|stèle|croix|fontaine|lavoir|palais|opéra|prison|bagne|caserne|lazaret|hospice|hôpital|léproserie|cimetière|nécropole|grotte|dolmen|menhir|oppidum|thermes|sucrerie|distillerie|usine|manufacture|entrepôt|gare|kiosque|conservatoire|bibliothèque|observatoire|jardin|domaine|habitation|cave)\b/i;

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

  // Mélangés rang par rang, comme les personnalités : sans cela, le dossier
  // prenait toujours les sept premiers de la catégorie, par ordre alphabétique,
  // et un article qui n'avait rien donné revenait au plan suivant.
  const candidats = [
    ...melanger([...categorieA, ...categorieDe]),
    ...melanger(listeMH.filter((t) => PATRIMOINE.test(t))),
    ...melanger(liensVille.filter((t) => PATRIMOINE.test(t))),
  ];

  // Les pages de liste ne racontent rien : elles énumèrent.
  const utiles = candidats.filter((t) => !/^(liste|catégorie)\b/i.test(t));

  return [...new Set(utiles)];
}


/**
 * Les personnalités candidates, de la plus sûre à la moins sûre.
 *
 * Les quatre gisements ne se valent pas. La liste rédigée et la catégorie
 * « Personnalité liée à » sont tenues à la main : ce qui s'y trouve a été jugé
 * digne d'y être. Les catégories de décès et de naissance, elles, ramassent
 * tout — pour Bordeaux, plus de mille entrées dont l'essentiel est des
 * sportifs contemporains dont l'article tient en un palmarès.
 *
 * D'où l'ordre, et d'où le mélange à l'intérieur de chaque rang : sans lui,
 * `cmlimit` rendrait éternellement la même tranche alphabétique et le dossier
 * repartirait chaque fois des mêmes noms. Le décès passe avant la naissance
 * parce qu'une vie achevée dans la ville a laissé une tombe, une plaque ou une
 * rue — de quoi ouvrir sur un geste d'aujourd'hui, ce que le prompt réclame.
 */
async function trouverPersonnalites(cityTitle: string): Promise<string[]> {
  const [liste, liees, deces, naissances] = await Promise.all([
    liens(`Liste de personnalités liées à ${cityTitle}`),
    membresCategorie(`Catégorie:Personnalité liée à ${cityTitle}`),
    membresCategorie(`Catégorie:Décès à ${cityTitle}`),
    membresCategorie(`Catégorie:Naissance à ${cityTitle}`),
  ]);

  const candidats = [
    ...melanger(liste),
    ...melanger(liees),
    ...melanger(deces),
    ...melanger(naissances),
  ];

  // Mêmes exclusions que pour les monuments, plus celle des monuments
  // eux-mêmes : la liste de personnalités liées renvoie aussi vers les lieux
  // qui portent leur nom, et on les traite déjà par l'autre axe.
  const utiles = candidats.filter(
    (t) => !/^(liste|catégorie)\b/i.test(t) && !PATRIMOINE.test(t)
  );

  return [...new Set(utiles)];
}

// Ce qui, dans les liens d'un article d'histoire, porte le nom de la ville
// sans raconter d'histoire : découpages administratifs, transports, médias,
// clubs, démographie.
const HORS_HISTOIRE =
  /^(liste|catégorie|chronologie|canton|arrondissement|aire|unité urbaine|métropole|communauté|académie|diocèse|circonscription|démographie|quartiers? de|aéroport|gare|ligne|tramway|métro|autobus|boulevard périphérique|autoroute|université|lycée|école|stade|zénith|asptt|lille métropole|bfm|radio|télé|journal|club|équipe|association sportive|olympique)\b/i;

/**
 * Les articles d'histoire candidats : événements, fêtes, institutions,
 * épisodes.
 *
 * Les membres de « Catégorie:Histoire de X » et de quelques sous-catégories
 * attendues viennent en premier : ils parlent de la ville par construction.
 * Puis les liens des articles « Histoire de X » et « X » dont le titre nomme
 * la ville (« Siège de Lille (1667) », « Braderie de Lille ») — un lien vers
 * « Louis XIV » ou « Flandre » ne dit rien de la ville, et un titre qui la
 * nomme est le filtre le plus sûr qu'on ait sans lire l'article.
 */
async function trouverHistoire(cityTitle: string): Promise<string[]> {
  const nom = cityTitle.replace(/\s*\(.*\)$/, '').toLowerCase();
  const [histoire, sieges, fetes, detruits, militaire, liensHistoire, liensVille] = await Promise.all([
    membresCategorie(`Catégorie:Histoire de ${cityTitle}`),
    membresCategorie(`Catégorie:Siège de ${cityTitle}`),
    membresCategorie(`Catégorie:Fête à ${cityTitle}`),
    membresCategorie(`Catégorie:Bâtiment détruit à ${cityTitle}`),
    membresCategorie(`Catégorie:Vie militaire à ${cityTitle}`),
    liens(`Histoire de ${cityTitle}`),
    liens(cityTitle),
  ]);

  const nommeLaVille = (t: string) => t.toLowerCase().includes(nom);
  const candidats = [
    ...melanger([...histoire, ...sieges, ...fetes, ...detruits, ...militaire]),
    ...melanger([...liensHistoire, ...liensVille].filter(nommeLaVille)),
  ];

  const generaux = new Set([cityTitle, `Histoire de ${cityTitle}`].map((t) => t.toLowerCase()));
  const utiles = candidats.filter(
    (t) => !HORS_HISTOIRE.test(t) && !generaux.has(t.toLowerCase()) && !/^(rue|place|boulevard|avenue|quai)\b/i.test(t)
  );

  return [...new Set(utiles)];
}

// Ce que la recherche plein texte ramène et qui ne raconte rien : le sport
// (palmarès, saisons), les élections, les découpages, les transports, les
// listes. Le reste est jugé sur pièce par `estRacontable`.
const HORS_MENTIONS =
  /^\d{4}\b|(?<![\p{L}])(rugby|football|basket|handball|championnat|coupe de|saison|tour de france|élections?|canton|circonscription|intercommunalité|agglomération|communauté|arrondissement|liste|gare|ligne|route|autoroute|réseau|autobus|tramway|club|équipe|olympique|festival|série télévisée|téléfilm|émission|album|chanson)(?![\p{L}])/iu;

/**
 * Les articles qui citent la ville, du plus pertinent au moins pertinent
 * selon le moteur de Wikipédia. Le titre de l'article de la ville en est
 * retiré : on cherche ce qui en parle ailleurs.
 */
async function trouverMentions(cityTitle: string): Promise<string[]> {
  const nom = cityTitle.replace(/\s*\(.*\)$/, '');
  let titres: string[] = [];
  try {
    const data = await call({
      action: 'query',
      list: 'search',
      srsearch: `"${nom}"`,
      srlimit: '100',
      srnamespace: '0',
    });
    // deno-lint-ignore no-explicit-any
    titres = (data?.query?.search ?? []).map((h: any) => h.title as string);
  } catch (err) {
    console.error('Wikipédia mentions', err);
  }
  const generaux = new Set([cityTitle, `Histoire de ${cityTitle}`].map((t) => t.toLowerCase()));
  return titres.filter((t) => !generaux.has(t.toLowerCase()) && !HORS_MENTIONS.test(t));
}

/** Combien de fois l'article nomme la ville. */
export function occurrences(texte: string, nom: string): number {
  const plat = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-‐‑'’]/g, ' ').toLowerCase();
  const aiguille = plat(nom);
  if (!aiguille) return 0;
  return plat(texte).split(aiguille).length - 1;
}

// Seuils de `estRacontable`. Volontairement bas : ils écartent la fiche
// descriptive et l'article qui cite la ville en passant, et laissent au plan
// le soin de juger le reste sujet par sujet.
export const MIN_MILLESIMES = 4;
export const MIN_OCCURRENCES = 3;

/**
 * L'article raconte-t-il une histoire qui se passe dans la ville ?
 *
 * Un casino décrit par sa surface, ses horaires et ses tables de jeu ne fait
 * pas une anecdote ; son ouverture en 1928, sa faillite en 1934 et son rachat
 * en 1952 en font une. Faute de lire l'article, on compte ce qui distingue
 * l'un de l'autre : des millésimes différents, au moins quatre, et la ville
 * nommée au moins trois fois — un article qui la cite une fois en passant
 * parle d'autre chose. Le plan juge ensuite sujet par sujet.
 */
export function estRacontable(texte: string, nom: string): boolean {
  // Une autre commune, un réseau de bus : leur article cite la ville voisine
  // à chaque ligne, et ce qu'il raconte se passe ailleurs ou ne se raconte
  // pas. Le 10 octobre, « Ciboure » arrivait en tête des mentions de
  // Saint-Jean-de-Luz.
  if (/\b(est une commune|est un réseau de transport|est le réseau de transport)/i.test(texte.slice(0, 400))) {
    return false;
  }
  const millesimes = new Set(texte.match(/\b(?:1[0-9]\d{2}|20[0-2]\d)\b/g) ?? []);
  return millesimes.size >= MIN_MILLESIMES && occurrences(texte, nom) >= MIN_OCCURRENCES;
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
export async function fetchExtract(title: string): Promise<SourceDoc | null> {
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
 * @param axe     le gisement dans lequel puiser. Défaut `patrimoine`, qui est
 *                le comportement d'origine.
 * @param titreImpose article de la commune, quand son nom seul est ambigu.
 * @param steriles articles lus récemment sans qu'aucun sujet n'en sorte.
 *                Contrairement à `exclure`, ils sont écartés même quand il
 *                ne reste que l'article de la ville et son histoire : relire
 *                un article qui vient de ne rien donner ne donnera rien.
 */
export async function fetchWikipediaDocs(
  city: string,
  exclure: string[] = [],
  axe: Axe = 'patrimoine',
  titreImpose?: string,
  steriles: string[] = []
): Promise<SourceDoc[]> {
  const cityTitle = titreImpose ?? (await findCityTitle(city));
  if (!cityTitle) return [];

  const sansSuite = new Set(steriles.map((t) => t.toLowerCase()));
  const dejaVus = new Set([...exclure, ...steriles].map((t) => t.toLowerCase()));

  let sujets: string[] = [];
  try {
    sujets =
      axe === 'personnalites'
        ? await trouverPersonnalites(cityTitle)
        : axe === 'histoire'
          ? await trouverHistoire(cityTitle)
          : axe === 'mentions'
            ? await trouverMentions(cityTitle)
            : await trouverMonuments(cityTitle);
  } catch (err) {
    console.error(`Wikipédia ${axe}`, err);
  }

  const neufs = sujets.filter((t) => !dejaVus.has(t.toLowerCase()));

  // Quand tous les monuments ont servi, on revient sur l'article de la ville et
  // son histoire : ils restent riches, et c'est préférable à un dossier vide.
  //
  // Pas sur l'axe des personnalités : ces deux articles-là ne parlent que de
  // pierres et de démographie, et les glisser dans un dossier de biographies
  // suffirait à ramener le modèle au monument — c'est précisément ce à quoi
  // l'axe sert à échapper. Un dossier vide est alors la bonne réponse : il
  // remonte en clair dans `skipped`, plutôt que de rendre une trente-et-unième
  // façade sous couvert de sujet neuf.
  //
  // Sur l'axe histoire, « Histoire de X » est le premier document, pas un
  // repli : c'est là que les épisodes sont racontés.
  const contexte =
    axe === 'personnalites' || axe === 'mentions'
      ? []
      : (axe === 'histoire' ? [`Histoire de ${cityTitle}`] : [cityTitle, `Histoire de ${cityTitle}`]).filter(
          (t) =>
            !sansSuite.has(t.toLowerCase()) &&
            (axe === 'histoire' || neufs.length === 0 || !dejaVus.has(t.toLowerCase()))
        );

  // Deux fois plus de candidats sur l'axe des personnalités : `fetchExtract`
  // écarte les articles de moins de 1200 caractères, et les catégories de
  // naissance en sont pleines. Sans cette marge, un dossier de sept noms en
  // rendait deux.
  //
  const combien = axe === 'personnalites' ? MAX_ARTICLES * 2 : MAX_ARTICLES;

  const nom = cityTitle.replace(/\s*\(.*\)$/, '');
  const docs: SourceDoc[] = [];
  const lire = async (titres: string[]) => {
    const resultats = await Promise.allSettled(titres.map(fetchExtract));
    resultats.forEach((resultat, i) => {
      if (resultat.status === 'rejected') {
        console.error(`Wikipédia « ${titres[i]} »`, resultat.reason);
      } else if (resultat.value && parleDe(resultat.value, cityTitle, city)) {
        // Sur les axes qui ne sont pas tenus à la main (une catégorie, une
        // liste rédigée), l'article doit aussi raconter : des dates, et la
        // ville plus d'une fois.
        if ((axe === 'mentions' || axe === 'histoire') && !estRacontable(resultat.value.extract, nom)) return;
        docs.push(resultat.value);
      }
    });
  };

  // Les mentions se lisent par paquets de sept, jusqu'à sept articles qui
  // racontent : sur Saint-Jean-de-Luz, deux des quatorze premiers passaient.
  // Par paquets, et non d'un coup, parce que Wikipédia répond 429 au-delà
  // d'une quinzaine de lectures simultanées.
  if (axe === 'mentions') {
    for (let i = 0; i < Math.min(neufs.length, MAX_LECTURES_MENTIONS) && docs.length < MAX_ARTICLES; i += MAX_ARTICLES) {
      await lire(neufs.slice(i, i + MAX_ARTICLES));
    }
    return docs.slice(0, MAX_ARTICLES);
  }

  const titres = [...new Set([...neufs.slice(0, combien), ...contexte])];
  if (titres.length === 0) return [];
  await lire(titres);
  return docs;
}

/**
 * L'article mentionne-t-il la ville ?
 *
 * Les liens de la page ville filtrés par `PATRIMOINE` ramènent aussi des
 * articles de portée générale : « Habitation à loyer modéré (France) »,
 * « Hôtel-Dieu », « Église (édifice) ». Le 2 octobre, le dossier de
 * Saint-Chamond n'était fait que de ceux-là, et le lot de dix est revenu
 * vide : le modèle a refusé, à raison, d'écrire sur la ville à partir
 * d'articles qui ne la nomment pas.
 */
export function parleDe(doc: SourceDoc, cityTitle: string, city: string): boolean {
  const plat = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-‐‑'’]/g, ' ').toLowerCase();
  const texte = plat(`${doc.title}\n${doc.extract}`);
  const noms = [cityTitle.replace(/\s*\(.*\)$/, ''), city].map(plat).filter(Boolean);
  return noms.some((n) => texte.includes(n));
}
