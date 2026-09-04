export type FeedbackType = 'adore' | 'incomplete' | 'propose';

/** Une ligne de suggestion renvoyée par l'autocomplétion Google Places. */
export interface CitySuggestion {
  placeId: string;
  name: string;
  secondary: string;
}

/**
 * Une ville qu'Anecto sait servir. Le catalogue se déduit des anecdotes
 * validées, il ne comporte donc jamais de ville vide — et n'expose aucun
 * compteur, la taille du stock restant hors de vue.
 */
export interface VilleCouverte {
  ville: string;
  place_id: string;
}

/** La ville résolue, telle qu'on la stocke sur le profil. */
export interface CityDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
}

export interface Profile {
  id: string;
  city: string;
  city_place_id: string | null;
  city_lat: number | null;
  city_lng: number | null;
  country_code: string | null;
  timezone: string | null;
  notification_hour: string; // format HH:mm:ss
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnecdoteSource {
  url: string;
  titre: string;
  editeur: string;
}

export interface Anecdote {
  id: string;
  city: string;
  city_place_id: string | null;
  /** Étiquette courte : notification quotidienne et file de relecture. */
  title: string;
  /** Phrase d'accroche affichée en titre. Nul sur les anecdotes d'avant. */
  hook: string | null;
  body: string;
  period: string | null;
  source: string;
  source_url: string | null;
  sources: AnecdoteSource[] | null;
  confidence: 'haute' | 'moyenne' | 'faible' | null;
  verification_notes: string | null;
  generated_by: string | null;
  status: 'draft' | 'validated' | 'rejected';
  reuse_count: number;
  created_at: string;
  validated_at: string | null;
}

/**
 * Série et carnet, calculés à la volée depuis l'historique de lecture.
 * Rien n'est stocké : ces chiffres se déduisent tous de `user_anecdote_history`.
 */
export interface Statistiques {
  /**
   * Jours consécutifs où l'anecdote a été lue le jour même de son envoi.
   * Reste vivante si la dernière lecture date d'hier — la journée en cours
   * est une occasion de la poursuivre, pas une rupture déjà consommée.
   */
  serie: number;
  record: number;
  /** Anecdotes distinctes réellement ouvertes, toutes villes confondues. */
  total_lues: number;
  ville: string | null;
  lues_ville: number;
  total_ville: number;
  /** Reçues et jamais ouvertes, journée en cours exclue : le retard. */
  non_lues: number;
  /** Lues après leur jour d'envoi. Ne répare pas la série, complète le carnet. */
  rattrapees: number;
}

export interface HistoryEntry {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  /** Jour d'envoi dans le fuseau du lecteur, au format AAAA-MM-JJ. */
  sent_on: string | null;
  /** Null tant que l'anecdote n'a pas été ouverte. */
  read_at: string | null;
  anecdote?: Anecdote;
}
