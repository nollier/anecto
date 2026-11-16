import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import { etatPermission, syncPushToken } from './notifications';

/** Deux propositions au plus, à sept jours d'écart au moins après un refus. */
const MAX_AFFICHAGES = 2;
const DELAI_APRES_REFUS_MS = 7 * 24 * 60 * 60 * 1000;

interface Suivi {
  affichages: number;
  dernierRefus: number | null;
}

const cle = (userId: string) => `anecto.demande-notif.${userId}`;

async function lireSuivi(userId: string): Promise<Suivi> {
  try {
    const brut = await AsyncStorage.getItem(cle(userId));
    if (brut) return { affichages: 0, dernierRefus: null, ...JSON.parse(brut) };
  } catch {
    // Illisible : on repart de zéro plutôt que de bloquer.
  }
  return { affichages: 0, dernierRefus: null };
}

async function ecrireSuivi(userId: string, suivi: Suivi): Promise<void> {
  try {
    await AsyncStorage.setItem(cle(userId), JSON.stringify(suivi));
  } catch {
    // Sans stockage, on reproposera peut-être : sans gravité.
  }
}

/**
 * Faut-il proposer les notifications, maintenant qu'une lecture complète
 * vient de se terminer ?
 *
 * Non si un jeton est déjà en base, si la permission est déjà accordée (on
 * enregistre alors le jeton sans rien demander), après deux propositions, ou
 * moins de sept jours après un refus.
 */
export async function doitProposerNotifications(userId: string): Promise<boolean> {
  if (!Device.isDevice) return false;

  if ((await etatPermission()) === 'accordee') {
    await syncPushToken();
    return false;
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .maybeSingle();
  if (profil?.expo_push_token) return false;

  const suivi = await lireSuivi(userId);
  if (suivi.affichages >= MAX_AFFICHAGES) return false;
  if (suivi.dernierRefus && Date.now() - suivi.dernierRefus < DELAI_APRES_REFUS_MS) return false;
  return true;
}

export async function noterAffichage(userId: string): Promise<void> {
  const suivi = await lireSuivi(userId);
  await ecrireSuivi(userId, { ...suivi, affichages: suivi.affichages + 1 });
}

export async function noterRefus(userId: string): Promise<void> {
  const suivi = await lireSuivi(userId);
  await ecrireSuivi(userId, { ...suivi, dernierRefus: Date.now() });
}
