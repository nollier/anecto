import { supabase } from './supabase';
import { Anecdote, Voisinage } from '../types';

/**
 * Le seuil à partir duquel on propose les villes voisines : celui du « stock
 * bas » du rapport. Assez tôt pour que la production des voisines ait le
 * temps de passer avant que la ville soit vide.
 */
export const SEUIL_VOISINES = 3;

export async function chargerVoisinage(): Promise<Voisinage | null> {
  const { data, error } = await supabase.rpc('mon_voisinage');
  if (error) {
    console.error(error);
    return null;
  }
  return (data as Voisinage | null) ?? null;
}

/** L'accord, donné une fois pour toutes, et révocable dans les Réglages. */
export async function repondreVoisines(accepte: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase
    .from('profiles')
    .update({ villes_voisines: accepte, updated_at: new Date().toISOString() })
    .eq('id', userData.user.id);
  if (error) throw new Error(error.message);
}

/** Faut-il demander l'accord maintenant ? */
export function proposerVoisines(v: Voisinage | null): boolean {
  return !!v && v.accepte === null && v.restantes <= SEUIL_VOISINES;
}

/**
 * « À 1 km, à Ciboure » pour une anecdote d'une voisine, null pour une
 * anecdote de la ville du lecteur.
 */
export function libelleVoisine(anecdote: Anecdote, v: Voisinage | null): string | null {
  if (!v?.place_id || !anecdote.city_place_id || anecdote.city_place_id === v.place_id) return null;
  const voisine = v.voisines.find((x) => x.place_id === anecdote.city_place_id);
  if (!voisine) return `À côté de chez toi, à ${anecdote.city}`;
  const km = Math.max(1, Math.round(Number(voisine.distance_km)));
  return `À ${km} km, à ${anecdote.city}`;
}
