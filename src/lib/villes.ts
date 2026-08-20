import { supabase } from './supabase';
import { CitySuggestion, VilleCouverte } from '../types';

/**
 * Les villes qu'Anecto sait servir aujourd'hui.
 *
 * Calculées côté base à partir des anecdotes validées : une ville ouverte
 * apparaît d'elle-même, sans rien redéployer. C'est ce qui garantit qu'on ne
 * propose jamais une ville vide.
 */
export async function villesCouvertes(): Promise<VilleCouverte[]> {
  const { data, error } = await supabase.rpc('villes_couvertes');
  if (error) throw new Error(error.message);
  return (data as VilleCouverte[] | null) ?? [];
}

/**
 * Retient une ville absente du catalogue, pour prévenir son demandeur quand
 * elle sera prête.
 *
 * Redemander la même ville ne produit ni doublon ni erreur : c'est la
 * meilleure réponse à quelqu'un qui touche deux fois le bouton.
 */
export async function demanderVille(suggestion: CitySuggestion): Promise<void> {
  const { error } = await supabase.rpc('demander_ville', {
    p_place_id: suggestion.placeId,
    p_ville: suggestion.name,
    p_pays: suggestion.secondary || null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Compare deux noms de ville sans se soucier de la casse, des accents ni des
 * traits d'union — « st malo » doit trouver « Saint-Malo » n'est pas un
 * objectif ici, mais « SAINT-MALO » et « saint malo » doivent y arriver.
 */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filtre le catalogue sur la saisie. Une recherche vide rend tout le catalogue. */
export function filtrerVilles(villes: VilleCouverte[], saisie: string): VilleCouverte[] {
  const q = normaliser(saisie);
  if (!q) return villes;
  return villes.filter((v) => normaliser(v.ville).includes(q));
}
