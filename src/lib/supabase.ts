import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuration Supabase manquante. Renseigne EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env'
  );
}

/**
 * Une clé présente mais tronquée ne se voit pas ici : elle se voit à
 * « Invalid api key » au premier écran, sans que rien ne désigne la cause.
 * C'est arrivé, et ça a coûté deux cycles de build complets.
 *
 * Les deux formes valides : le jeton JWT historique (trois segments séparés
 * par des points) et la clé publiable récente (préfixe `sb_publishable_`).
 * Un collage coupé par le retour à la ligne d'un terminal échoue aux deux.
 *
 * On ne journalise jamais la clé — seulement sa longueur, de quoi comparer
 * sans la diffuser.
 */
const cleValide =
  supabaseAnonKey.startsWith('sb_publishable_') || supabaseAnonKey.split('.').length === 3;

if (!cleValide) {
  throw new Error(
    `Clé Supabase malformée (${supabaseAnonKey.length} caractères). ` +
      "Elle a probablement été tronquée à la saisie. Attendu : un JWT en trois segments, " +
      'ou une clé commençant par sb_publishable_. Corrige EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
      'dans eas.json, puis reconstruis — une mise à jour à chaud ne suffira pas.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * React Native suspend les timers JS dès que l'app passe en arrière-plan —
 * y compris celui que `autoRefreshToken` programme pour renouveler le jeton
 * avant son expiration. Sans relais, une app restée en veille (le cas
 * typique : une notification arrive, l'utilisateur ouvre l'app des heures
 * plus tard) retrouve un jeton expiré qu'aucun minuteur n'a renouvelé entre
 * temps, d'où une session parfois traitée comme invalide alors qu'elle
 * aurait dû être rafraîchie.
 *
 * On relance le rafraîchissement au retour au premier plan, et on l'arrête
 * en arrière-plan pour ne pas consommer de réseau pour rien pendant que
 * l'app est invisible.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
