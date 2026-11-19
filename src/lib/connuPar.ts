import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { noter } from './mesure';
import { precisionConnuPar } from './precisionConnuPar';

export const REPONSES_CONNU_PAR = [
  'proche',
  'whatsapp_sms',
  'facebook',
  'instagram',
  'tiktok',
  'store',
  'autre',
] as const;
export type ReponseConnuPar = (typeof REPONSES_CONNU_PAR)[number];

/** Au-delà, le compte n'est plus « juste inscrit » : on ne pose pas la question. */
const AGE_MAX_COMPTE_MS = 7 * 24 * 60 * 60 * 1000;

const cleFaite = (userId: string) => `anecto.connu-par.fait.${userId}`;
const cleEnAttente = (userId: string) => `anecto.connu-par.en-attente.${userId}`;

interface EnAttente {
  connu_par: ReponseConnuPar | null;
  connu_par_le: string;
  /** Présent seulement quand « autre » est accompagné d'un texte non vide. */
  connu_par_precision?: string;
}

/**
 * Écrit la réponse sur le profil s'il existe déjà. Le profil n'existe qu'une
 * fois la ville choisie (`city` est obligatoire) : avant, la réponse attend
 * sur le téléphone et part avec le premier enregistrement des Réglages.
 */
async function ecrire(userId: string, valeurs: EnAttente): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .update(valeurs)
    .eq('id', userId)
    .select('id');
  if (error) {
    console.warn('Réponse « connu par » non enregistrée', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Faut-il poser la question à ce compte, maintenant ? Une seule fois, aux nouveaux inscrits. */
export async function doitDemanderConnuPar(user: User): Promise<boolean> {
  try {
    // Une réponse en attente : on retente de l'écrire, le profil existe peut-être.
    const brut = await AsyncStorage.getItem(cleEnAttente(user.id));
    if (brut && (await ecrire(user.id, JSON.parse(brut)))) {
      await AsyncStorage.removeItem(cleEnAttente(user.id));
    }

    if (await AsyncStorage.getItem(cleFaite(user.id))) return false;
    if (Date.now() - new Date(user.created_at).getTime() > AGE_MAX_COMPTE_MS) return false;

    const { data: profil } = await supabase
      .from('profiles')
      .select('connu_par_le')
      .eq('id', user.id)
      .maybeSingle();
    if (profil?.connu_par_le) {
      await AsyncStorage.setItem(cleFaite(user.id), '1');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * `reponse` null : le lecteur a passé la question.
 * `precision` n'est retenue que pour « autre », trimmée, au plus 200 caractères.
 * Vide : on enregistre `autre` sans texte, l'onboarding continue.
 */
export async function repondreConnuPar(
  userId: string,
  reponse: ReponseConnuPar | null,
  precision = '',
): Promise<void> {
  noter(reponse ? 'connu_par_repondu' : 'connu_par_passe', reponse ? { reponse } : undefined);
  const texte = precisionConnuPar(reponse, precision);
  const valeurs: EnAttente = {
    connu_par: reponse,
    connu_par_le: new Date().toISOString(),
    // Absent quand il n'y a rien à dire : les réponses fermées gardent
    // exactement le même payload qu'avant.
    ...(texte ? { connu_par_precision: texte } : {}),
  };
  try {
    await AsyncStorage.setItem(cleFaite(userId), '1');
    if (!(await ecrire(userId, valeurs))) {
      await AsyncStorage.setItem(cleEnAttente(userId), JSON.stringify(valeurs));
    }
  } catch (erreur) {
    console.warn('Réponse « connu par » non enregistrée', erreur);
  }
}

/**
 * La réponse restée en attente, à joindre au premier enregistrement du
 * profil. Rend un objet vide s'il n'y en a pas.
 */
export async function connuParEnAttente(userId: string): Promise<Partial<EnAttente>> {
  try {
    const brut = await AsyncStorage.getItem(cleEnAttente(userId));
    return brut ? (JSON.parse(brut) as EnAttente) : {};
  } catch {
    return {};
  }
}

export async function oublierConnuParEnAttente(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cleEnAttente(userId));
  } catch {
    // Sans gravité : la prochaine écriture du même contenu ne change rien.
  }
}

/**
 * Où en est la question à l'ouverture de l'app : pas encore décidé, affichée,
 * ou réglée (posée, passée ou sans objet). L'accueil attend « réglée » avant
 * de proposer les notifications : iOS n'affiche pas deux fenêtres modales à
 * la fois, et deux questions d'affilée feraient beaucoup.
 */
type EtatQuestion = 'inconnu' | 'ouverte' | 'reglee';
let etatQuestion: EtatQuestion = 'inconnu';
const enAttente = new Set<() => void>();

export function signalerQuestionConnuPar(etat: 'ouverte' | 'reglee'): void {
  etatQuestion = etat;
  if (etat === 'reglee') {
    enAttente.forEach((f) => f());
    enAttente.clear();
  }
}

/** Se résout quand la question « Comment as-tu connu Anecto ? » ne gêne plus. */
export function attendreQuestionConnuPar(): Promise<void> {
  if (etatQuestion === 'reglee') return Promise.resolve();
  return new Promise((resolve) => enAttente.add(resolve));
}
