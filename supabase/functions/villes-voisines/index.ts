// Les voisines des villes dont un lecteur a accepté d'élargir l'horizon.
//
// Appelée par `calculer_villes_voisines` (cron), seulement quand une ville
// en attend. Pour chacune :
//
//   1. Google donne le centre de la ville, à partir de son identifiant ;
//   2. le référentiel des communes (`communes`, geo.api.gouv.fr) donne les
//      communes de plus de 1 500 habitants à moins de 30 km ;
//   3. Google donne l'identifiant de chacune, celui que l'app et la
//      production utilisent pour rattacher une anecdote à une ville. Un lieu
//      rendu à plus de 6 km du centre de la commune est écarté : c'est un
//      homonyme.
//
// Une douzaine d'appels Google par ville, une fois pour toutes.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';
import {
  type Commune,
  ECART_MAX_KM,
  MAX_VOISINES,
  POPULATION_MIN,
  RAYON_KM,
  sansLaVille,
} from './voisines.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const client = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
type Db = ReturnType<typeof client>;

interface Point {
  latitude: number;
  longitude: number;
}

function distanceKm(a: Point, b: Point): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function centre(placeId: string): Promise<Point | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_KEY!, 'X-Goog-FieldMask': 'location' },
  });
  if (!res.ok) {
    console.error('Google détails', res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const place = await res.json();
  const p = place.location;
  return p && typeof p.latitude === 'number' ? { latitude: p.latitude, longitude: p.longitude } : null;
}

/** L'identifiant Google de la commune, ou null si Google rend autre chose. */
async function identifiant(nom: string, autour: Point): Promise<{ id: string; nom: string } | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: `${nom}, France`,
      languageCode: 'fr',
      includedType: 'locality',
      strictTypeFiltering: true,
      pageSize: 1,
      locationBias: { circle: { center: autour, radius: 5000 } },
    }),
  });
  if (!res.ok) {
    console.error('Google recherche', nom, res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const lieu = (await res.json())?.places?.[0];
  if (!lieu?.id || !lieu.location) return null;
  if (distanceKm(autour, lieu.location) > ECART_MAX_KM) return null;
  return { id: lieu.id, nom: lieu.displayName?.text ?? nom };
}

async function calculer(supabase: Db, placeId: string, ville: string) {
  const point = await centre(placeId);
  await supabase
    .from('villes_geo')
    .upsert({
      place_id: placeId,
      ville,
      lat: point?.latitude ?? null,
      lng: point?.longitude ?? null,
      voisines_calculees_at: new Date().toISOString(),
    });
  if (!point) return { ville, voisines: 0, motif: 'Centre introuvable.' };

  // Quelques communes de plus que gardées : certaines n'ont pas d'identifiant.
  const { data, error } = await supabase.rpc('communes_proches', {
    p_lat: point.latitude,
    p_lng: point.longitude,
    p_rayon_km: RAYON_KM,
    p_limite: MAX_VOISINES + 4,
    p_population_min: POPULATION_MIN,
  });
  if (error) throw new Error(`Communes proches : ${error.message}`);

  const communes = sansLaVille((data ?? []) as Commune[], ville);
  const { data: lignesCommunes } = await supabase
    .from('communes')
    .select('insee, lat, lng')
    .in('insee', communes.map((c) => c.insee));
  const centres = new Map((lignesCommunes ?? []).map((c) => [c.insee, { latitude: c.lat, longitude: c.lng }]));

  const voisines: Array<Record<string, unknown>> = [];
  for (const c of communes) {
    if (voisines.length >= MAX_VOISINES) break;
    const autour = centres.get(c.insee);
    if (!autour) continue;
    const lieu = await identifiant(c.nom, autour);
    if (!lieu || lieu.id === placeId) continue;
    voisines.push({
      place_id: placeId,
      voisin_place_id: lieu.id,
      voisin_ville: c.nom,
      voisin_insee: c.insee,
      distance_km: Math.round(c.distance_km * 10) / 10,
      rang: voisines.length + 1,
    });
  }

  if (voisines.length > 0) {
    const { error: e } = await supabase.from('villes_voisines').upsert(voisines);
    if (e) throw new Error(`Voisines non enregistrées : ${e.message}`);
  }
  return { ville, voisines: voisines.length, noms: voisines.map((v) => v.voisin_ville) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }
  if (!GOOGLE_KEY) {
    return fail("GOOGLE_MAPS_API_KEY n'est pas configurée.", 500);
  }

  const supabase = client();
  const { data: villes, error } = await supabase.rpc('voisines_a_calculer', { p_limit: 5 });
  if (error) return fail(error.message, 500);

  const bilans = [];
  for (const v of (villes ?? []) as Array<{ place_id: string; ville: string }>) {
    try {
      bilans.push(await calculer(supabase, v.place_id, v.ville));
    } catch (err) {
      console.error('Voisines', v.ville, err);
      bilans.push({ ville: v.ville, voisines: 0, motif: err instanceof Error ? err.message : String(err) });
    }
  }
  return json({ bilans });
});
