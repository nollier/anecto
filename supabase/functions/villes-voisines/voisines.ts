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

/**
 * Ce qui suit le nom dans la recherche Google. Le 19 novembre, Saint-Paul
 * (La Réunion) n'a gardé que 4 voisines sur 11 : « Le Port, France » ou
 * « Saint-Denis, France » rendaient un homonyme de métropole, écarté par le
 * contrôle des 6 km. Outre-mer, on nomme le territoire.
 */
const OUTRE_MER: Record<string, string> = {
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
};

export function territoire(departement: string | null): string {
  return (departement && OUTRE_MER[departement]) || 'France';
}

/**
 * Outre-mer, les grandes communes montent jusqu'aux cirques : leur centre
 * officiel tombe dans les hauts, à 7 km du bourg pour Saint-Denis, 10 km
 * pour La Possession. Le territoire nommé dans la recherche écarte déjà les
 * homonymes ; la tolérance peut s'élargir.
 */
export const ECART_MAX_OUTRE_MER_KM = 15;

export function ecartMaxKm(departement: string | null): number {
  return departement && OUTRE_MER[departement] ? ECART_MAX_OUTRE_MER_KM : ECART_MAX_KM;
}
