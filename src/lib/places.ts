import { supabase } from './supabase';
import { CityDetails, CitySuggestion } from '../types';

/**
 * Jeton de session Google Places : regroupe les frappes d'une même recherche
 * et le `details` final en une seule session facturée. À renouveler après
 * chaque ville sélectionnée.
 *
 * Math.random suffit ici — ce jeton n'a aucune valeur de sécurité, il ne sert
 * qu'à corréler les requêtes d'une même saisie.
 */
export function newSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function searchCities(
  input: string,
  sessionToken: string
): Promise<CitySuggestion[]> {
  const { data, error } = await supabase.functions.invoke('city-search', {
    body: { action: 'suggest', input, sessionToken, languageCode: 'fr' },
  });

  if (error) throw error;
  return data?.suggestions ?? [];
}

export async function getCityDetails(
  placeId: string,
  sessionToken: string
): Promise<CityDetails> {
  const { data, error } = await supabase.functions.invoke('city-search', {
    body: { action: 'details', placeId, sessionToken, languageCode: 'fr' },
  });

  if (error) throw error;
  if (!data?.city) throw new Error('Ville introuvable.');
  return data.city;
}

/** Fuseau de l'appareil, utilisé pour envoyer la notification à la bonne heure locale. */
export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
