import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { noter } from './mesure';
import { t } from './textes';
import { LIEN_APP_STORE, lienGooglePlay } from './partage';
import { Anecdote, ScoresQuiz } from '../types';

export type EtatQuiz =
  | { phase: 'aucun' }
  | { phase: 'question' }
  | { phase: 'resultat'; juste: boolean; scores: ScoresQuiz | null };

const clePasse = (anecdoteId: string) => `anecto.quiz.passe.${anecdoteId}`;
const CLE_SCORES = 'anecto.quiz.scores';

export function aUnQuiz(a: Anecdote): boolean {
  return !!a.quiz_affirmation && typeof a.quiz_reponse === 'boolean';
}

/**
 * Où en est le lecteur avec le quiz de cette anecdote : à poser, déjà
 * répondu (on remontre le résultat), passé ou absent (anecdote seule).
 */
export async function chargerEtatQuiz(a: Anecdote, userId: string): Promise<EtatQuiz> {
  if (!aUnQuiz(a)) return { phase: 'aucun' };

  const { data } = await supabase
    .from('quiz_reponses')
    .select('juste')
    .eq('user_id', userId)
    .eq('anecdote_id', a.id)
    .maybeSingle();
  if (data) return { phase: 'resultat', juste: data.juste, scores: await scoresEnCache() };

  try {
    if (await AsyncStorage.getItem(clePasse(a.id))) return { phase: 'aucun' };
  } catch {
    // Sans stockage, on repose la question : sans gravité.
  }
  return { phase: 'question' };
}

/** Juge la réponse côté serveur. `null` si l'enregistrement a échoué. */
export async function repondreQuiz(
  a: Anecdote,
  reponse: boolean
): Promise<{ juste: boolean; scores: ScoresQuiz } | null> {
  const { data, error } = await supabase.rpc('repondre_quiz', {
    p_anecdote_id: a.id,
    p_reponse: reponse,
  });
  const ligne = (data as (ScoresQuiz & { juste: boolean })[] | null)?.[0];
  if (error || !ligne) {
    if (error) console.warn('Réponse au quiz non enregistrée', error.message);
    return null;
  }
  const scores: ScoresQuiz = {
    repondus: ligne.repondus,
    bonnes: ligne.bonnes,
    serie: ligne.serie,
    record: ligne.record,
  };
  try {
    await AsyncStorage.setItem(CLE_SCORES, JSON.stringify(scores));
  } catch {
    // Le cache local n'est qu'un confort : la base fait foi.
  }
  noter('quiz_repondu', { anecdote_id: a.id, juste: ligne.juste });
  return { juste: ligne.juste, scores };
}

export async function passerQuiz(a: Anecdote): Promise<void> {
  noter('quiz_passe', { anecdote_id: a.id });
  try {
    await AsyncStorage.setItem(clePasse(a.id), '1');
  } catch {
    // Sans stockage, la question reviendra à la prochaine ouverture.
  }
}

/** Les derniers scores connus, gardés sur le téléphone. */
export async function scoresEnCache(): Promise<ScoresQuiz | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_SCORES);
    return brut ? (JSON.parse(brut) as ScoresQuiz) : null;
  } catch {
    return null;
  }
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** « 16 novembre » : sans dépendre de l'Intl du moteur JS. */
export function dateCourte(d = new Date()): string {
  return `${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/**
 * Le résultat à partager, sans dévoiler la réponse : le destinataire doit
 * pouvoir tenter sa chance à son tour.
 */
export function texteResultat(ville: string, juste: boolean, code: string | null, date = new Date()): string {
  const accroche = t(juste ? 'quiz.partageTrouve' : 'quiz.partageRate', { ville, date: dateCourte(date) });
  return [
    accroche,
    `📱 App Store : ${LIEN_APP_STORE}`,
    `🤖 Google Play : ${lienGooglePlay('quiz', code)}`,
  ].join('\n');
}
