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

/**
 * Appelle `city-search` en remontant le message d'erreur de la fonction.
 *
 * supabase-js n'expose pas le corps de la réponse dans l'objet `error` : sans
 * cette relecture, toute panne serveur devient un « FunctionsHttpError »
 * indifférencié, et l'écran finit par accuser le réseau alors que le problème
 * est ailleurs — une clé mal restreinte, par exemple.
 */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('city-search', { body });
  if (!error) return data as T;

  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
  if (context?.json) {
    try {
      const payload = await context.json();
      if (payload?.error) throw new Error(payload.error);
    } catch (relecture) {
      if (relecture instanceof Error && relecture.message) throw relecture;
    }
  }
  throw new Error(error.message);
}

export async function searchCities(
  input: string,
  sessionToken: string
): Promise<CitySuggestion[]> {
  const data = await invoke<{ suggestions?: CitySuggestion[] }>({
    action: 'suggest',
    input,
    sessionToken,
    languageCode: 'fr',
  });
  return data?.suggestions ?? [];
}

export async function getCityDetails(
  placeId: string,
  sessionToken: string
): Promise<CityDetails> {
  const data = await invoke<{ city?: CityDetails }>({
    action: 'details',
    placeId,
    sessionToken,
    languageCode: 'fr',
  });
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
