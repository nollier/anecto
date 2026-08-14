// Proxy Google Places (New) — uniquement pour le choix de la ville.
//
// Pourquoi un proxy plutôt qu'un appel direct depuis l'app : une variable
// EXPO_PUBLIC_* est embarquée en clair dans le bundle JS et donc extractible.
// Ici la clé reste côté serveur et n'est jamais livrée au client.
//
// Deux actions :
//   { action: 'suggest', input, sessionToken }   -> liste de villes
//   { action: 'details', placeId, sessionToken } -> coordonnées + pays
//
// Le sessionToken (UUID généré par l'app) regroupe les frappes d'une même
// recherche et le details final en une seule session facturée par Google.

import { corsHeaders, fail, json } from '../_shared/cors.ts';

const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

// Types de lieux acceptés : uniquement des villes/communes, jamais une rue,
// un commerce ou un pays.
const CITY_TYPES = ['locality', 'administrative_area_level_3', 'postal_town'];

// Optionnel : "FR,BE,CH" pour restreindre géographiquement les suggestions.
const REGIONS = (Deno.env.get('ANECTO_PLACES_REGIONS') ?? '')
  .split(',')
  .map((r) => r.trim().toLowerCase())
  .filter(Boolean);

const DETAILS_FIELDS = 'id,displayName,formattedAddress,location,addressComponents';

interface CitySuggestion {
  placeId: string;
  name: string;
  secondary: string;
}

interface CityDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
}

async function suggest(input: string, sessionToken: string, languageCode: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY!,
    },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode,
      includedPrimaryTypes: CITY_TYPES,
      ...(REGIONS.length > 0 ? { includedRegionCodes: REGIONS } : {}),
    }),
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status, detail: await res.text() };
  }

  const data = await res.json();
  const suggestions: CitySuggestion[] = (data.suggestions ?? [])
    .filter((s: Record<string, unknown>) => s.placePrediction)
    .map((s: Record<string, any>) => ({
      placeId: s.placePrediction.placeId,
      name: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
      secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
    }))
    .filter((s: CitySuggestion) => s.placeId && s.name);

  return { ok: true as const, suggestions };
}

async function details(placeId: string, sessionToken: string, languageCode: string) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set('languageCode', languageCode);
  url.searchParams.set('sessionToken', sessionToken);

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_KEY!,
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status, detail: await res.text() };
  }

  const place = await res.json();
  const country = (place.addressComponents ?? []).find((c: Record<string, any>) =>
    (c.types ?? []).includes('country')
  );

  const city: CityDetails = {
    placeId: place.id,
    name: place.displayName?.text ?? '',
    formattedAddress: place.formattedAddress ?? '',
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    countryCode: country?.shortText ?? null,
  };

  if (!city.placeId || !city.name || city.latitude === null) {
    return { ok: false as const, status: 502, detail: 'Réponse Google incomplète.' };
  }

  return { ok: true as const, city };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }
  if (!GOOGLE_KEY) {
    return fail("GOOGLE_MAPS_API_KEY n'est pas configurée sur la fonction.", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Corps de requête JSON invalide.');
  }

  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : '';
  const languageCode = typeof body.languageCode === 'string' ? body.languageCode : 'fr';
  if (!sessionToken) {
    return fail('sessionToken manquant.');
  }

  if (body.action === 'suggest') {
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    if (input.length < 2) {
      return json({ suggestions: [] });
    }
    const result = await suggest(input, sessionToken, languageCode);
    if (!result.ok) {
      console.error('Places autocomplete', result.status, result.detail);
      return fail('La recherche de ville a échoué.', 502);
    }
    return json({ suggestions: result.suggestions });
  }

  if (body.action === 'details') {
    const placeId = typeof body.placeId === 'string' ? body.placeId : '';
    if (!placeId) {
      return fail('placeId manquant.');
    }
    const result = await details(placeId, sessionToken, languageCode);
    if (!result.ok) {
      console.error('Places details', result.status, result.detail);
      return fail('Impossible de récupérer les détails de la ville.', 502);
    }
    return json({ city: result.city });
  }

  return fail("Action inconnue : utilise 'suggest' ou 'details'.");
});
