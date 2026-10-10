// Le choix des voisines, sans réseau : il se teste sous Node.

/** Le rayon dans lequel une commune est une voisine. */
export const RAYON_KM = 30;
/** Les voisines gardées par ville : assez pour des mois, pas au-delà. */
export const MAX_VOISINES = 10;
/** Sous ce seuil, Wikipédia et Mérimée n'ont presque rien à dire. */
export const POPULATION_MIN = 1500;
/** Écart toléré entre le centre de la commune et le lieu que Google rend. */
export const ECART_MAX_KM = 6;

export interface Commune {
  insee: string;
  nom: string;
  departement: string | null;
  population: number | null;
  distance_km: number;
}

export function simplifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’]/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Les communes proches, sans la ville elle-même : elle sort de la recherche à
 * quelques centaines de mètres de son propre centre.
 */
export function sansLaVille(communes: Commune[], ville: string): Commune[] {
  const nom = simplifier(ville);
  return communes.filter((c) => !(simplifier(c.nom) === nom && c.distance_km < 5));
}
