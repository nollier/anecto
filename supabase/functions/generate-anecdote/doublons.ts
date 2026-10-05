// Ne jamais écrire deux fois le même thème pour une ville.
//
// Le prompt de rédaction liste déjà les titres existants, et le dossier exclut
// les articles déjà exploités. Ça ne suffit pas : le dossier est construit une
// fois par appel, et sur un lot de dix le modèle revient au document le plus
// riche. Saint-Chamond en a reçu quatre sur l'aqueduc du Gier dans le même
// lot, sous quatre titres différents.
//
// Deux contrôles, dans cet ordre :
//
//   1. l'article — déterministe. Une anecdote tirée d'un article de monument
//      ou de personne déjà exploité par une anecdote en vie (publiée ou en
//      brouillon) traite le même sujet. Les articles généraux de la ville
//      portent, eux, des dizaines de sujets : ils ne comptent pas ici.
//   2. le thème — par le modèle (voir `DOUBLON_SYSTEM`), pour ce que le
//      premier contrôle ne voit pas : deux articles sur le même objet
//      (« Dolmen » et « Menhir » racontant tous deux l'origine du mot), ou
//      l'article général de la ville.
//
// Ce fichier n'importe rien de Deno : il se teste sous Node, comme
// `verification.ts`.

/** Une anecdote en vie pour la ville : publiée, ou en attente de relecture. */
export interface Existante {
  titre: string;
  accroche: string | null;
  /** Titres des articles crédités en source. */
  articles: string[];
}

function simplifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * L'article de la commune ou de son histoire : il couvre la ville entière, et
 * deux anecdotes peuvent y puiser deux sujets sans rapport.
 *
 * « Saint-Paul (La Réunion) » pour Saint-Paul, « Histoire de Lille » pour Lille.
 */
export function estArticleGeneral(article: string, ville: string): boolean {
  const a = simplifier(article);
  const v = simplifier(ville);
  return a === v || a.startsWith(`${v} (`) || a.startsWith('histoire de ');
}

/**
 * Les articles qu'une anecdote épuise : tous ceux qu'elle crédite, sauf les
 * articles généraux de la ville, qui portent d'autres sujets.
 */
export function articlesSpecifiques(articles: string[], ville: string): string[] {
  return articles.filter((a) => !estArticleGeneral(a, ville));
}

/**
 * L'anecdote existante qui exploite déjà l'un des articles spécifiques de la
 * candidate, ou null.
 */
export function articleDejaTraite(
  articles: string[],
  existantes: Existante[],
  ville: string
): { article: string; titre: string } | null {
  for (const article of articles) {
    if (estArticleGeneral(article, ville)) continue;
    const cle = simplifier(article);
    const deja = existantes.find((e) => e.articles.some((a) => simplifier(a) === cle));
    if (deja) return { article, titre: deja.titre };
  }
  return null;
}

export const DOUBLON_SYSTEM = `Tu es éditeur d'une application qui envoie chaque jour une anecdote d'histoire locale sur une ville. Un lecteur ne doit jamais recevoir deux anecdotes sur le même thème.

On te donne une anecdote candidate et la liste des anecdotes déjà écrites pour la même ville. Dis si la candidate traite le même thème que l'une d'elles.

Pour décider, nomme d'abord le sujet principal de la candidate : un objet précis, qu'on peut désigner par un nom propre ou une date (tel bâtiment, telle personne, tel événement, telle coutume, l'origine de tel mot). Puis cherche ce même objet dans la liste.

Doublon : une anecdote existante a le même objet précis pour sujet principal, même si le titre, l'angle, l'époque mise en avant ou les détails diffèrent. La construction puis la fermeture du même hôpital, deux récits sur l'aqueduc de la ville, sur l'origine du même mot ou sur la même bataille sont des doublons.

Pas un doublon : deux objets distincts, même s'ils sont de même nature. Deux malouinières différentes, deux églises, deux hôtels particuliers, une course hippique et une course de voiliers, deux incendies à des dates différentes sont des thèmes différents. Partager une catégorie, une période, un quartier, ou un lieu ou un personnage cité en passant ne fait pas un doublon.

Si l'objet précis de la candidate ne figure pas comme sujet principal dans la liste, ce n'est pas un doublon.

Réponds uniquement en json : {"doublon": true|false, "titre": "titre de l'anecdote existante en cas de doublon, sinon chaîne vide", "raison": "une phrase"}`;

export function doublonPrompt(
  ville: string,
  candidate: { titre: string; accroche: string; corps: string },
  existantes: Existante[]
): string {
  const liste = existantes
    .map((e) => `- ${e.titre}${e.accroche ? ` : ${e.accroche}` : ''}`)
    .join('\n');
  return `VILLE : ${ville}

ANECDOTES DÉJÀ ÉCRITES
${liste}

CANDIDATE
Titre : ${candidate.titre}
Accroche : ${candidate.accroche}

${candidate.corps}

La candidate traite-t-elle le même thème que l'une des anecdotes déjà écrites ? Réponds en json.`;
}
