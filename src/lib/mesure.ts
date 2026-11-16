import { supabase } from './supabase';

export type TypeEvenement =
  | 'ouverture_push'
  | 'demande_notif_affichee'
  | 'demande_notif_acceptee'
  | 'demande_notif_refusee'
  | 'connu_par_repondu'
  | 'connu_par_passe'
  | 'partage_propose'
  | 'partage_lance'
  | 'partage_confirme'
  | 'quiz_affiche'
  | 'quiz_repondu'
  | 'quiz_passe'
  | 'quiz_partage';

/**
 * Note un événement de mesure dans `evenements`.
 *
 * Jamais bloquant, jamais d'erreur visible : une mesure perdue vaut mieux
 * qu'un lecteur gêné. L'identité vient de la session (valeur par défaut
 * `auth.uid()` en base), RLS refuse toute autre.
 */
export function noter(type: TypeEvenement, details?: Record<string, unknown>): void {
  supabase
    .from('evenements')
    .insert({ type, details: details ?? null })
    .then(({ error }) => {
      if (error) console.warn(`Mesure ${type} non enregistrée`, error.message);
    });
}
