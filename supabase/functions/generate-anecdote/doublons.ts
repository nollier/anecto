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
//   2. le thème — par le modèle (voir `DOUBLONS_PLAN_SYSTEM` dans `plan.ts`,
//      une fois pour tous les sujets d'un plan), pour ce que le premier
//      contrôle ne voit pas : deux articles sur le même objet
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
