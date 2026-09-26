import { supabase } from './supabase';

/**
 * Le code de parrainage du lecteur connecté, créé au premier appel.
 *
 * Mis en cache pour la session : il ne change jamais, et le partage d'une
 * anecdote ne doit pas attendre un aller-retour réseau à chaque fois. Le
 * cache retient aussi à quel compte le code appartient — deux comptes sur un
 * même téléphone ne doivent pas s'échanger leurs filleuls.
 */
let enCache: { userId: string; code: string } | null = null;

export async function monCodeParrainage(): Promise<string | null> {
  // `getSession` lit le stockage local, sans réseau : suffisant pour savoir
  // à qui appartient le cache.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  if (enCache?.userId === userId) return enCache.code;

  const { data: code, error } = await supabase.rpc('mon_code_parrainage');
  // Sans code, le partage part quand même, simplement sans parrain : on ne
  // bloque jamais un lecteur qui veut envoyer une anecdote.
  if (error || typeof code !== 'string') {
    if (error) console.warn('Code de parrainage indisponible', error.message);
    return null;
  }

  enCache = { userId, code };
  return code;
}

export interface MesParrainages {
  code: string;
  /** Visites de la page de téléchargement par le lien du lecteur. */
  ouvertures: number;
  /** Comptes rattachés au lecteur : Android d'office, iPhone par code saisi. */
  inscrits: number;
  /** Le lecteur a lui-même un parrain : plus rien à saisir. */
  parraine: boolean;
}

export async function mesParrainages(): Promise<MesParrainages | null> {
  // Le code d'abord : `mes_parrainages` ne renvoie rien tant qu'il n'existe pas.
  if (!(await monCodeParrainage())) return null;

  const { data, error } = await supabase.rpc('mes_parrainages');
  if (error) {
    console.warn('Parrainage illisible', error.message);
    return null;
  }
  return (data as MesParrainages[] | null)?.[0] ?? null;
}

/** Vrai si le code a été reconnu et rattaché au compte. */
export async function saisirCodeParrainage(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('saisir_code_parrainage', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) {
    console.warn('Code de parrainage refusé', error.message);
    return false;
  }
  return data === true;
}
