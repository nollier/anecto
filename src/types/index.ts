export type FeedbackType = 'adore' | 'incomplete' | 'propose';

/** Une ligne de suggestion renvoyée par l'autocomplétion Google Places. */
export interface CitySuggestion {
  placeId: string;
  name: string;
  secondary: string;
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

export interface HistoryEntry {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  anecdote?: Anecdote;
}
