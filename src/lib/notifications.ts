import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Réenregistre le jeton push au démarrage, quand un profil existe déjà.
 *
 * Un jeton Expo change — réinstallation, restauration de sauvegarde, mise à
 * jour système. S'il n'était rafraîchi qu'en rouvrant les Réglages, les
 * notifications s'arrêteraient en silence.
 *
 * L'écriture passe par une fonction plutôt que par un `update` : le jeton
 * identifie un téléphone, pas une personne, et l'attribuer suppose de le
 * retirer aux comptes qui l'avaient avant — ce que RLS interdit au client,
 * puisque chacun ne peut écrire que sa propre ligne. Sans ce retrait, deux
 * comptes utilisés sur le même appareil y envoient chacun leur notification,
 * à leur heure et pour leur ville.
 */
export async function syncPushToken(): Promise<void> {
  // Sans demander : la demande système ne part plus à l'ouverture, mais après
  // une première lecture, précédée d'un écran qui l'explique (voir
  // `DemandeNotifications`). Ici, on ne récupère le jeton que si la
  // permission est déjà accordée.
  const token = await registerForPushNotificationsAsync({ demander: false });
  if (!token) return;

  const { error } = await supabase.rpc('enregistrer_jeton_push', { p_token: token });
  if (error) console.warn('Jeton push non enregistré', error.message);
}

/**
 * Rend le jeton au moment de se déconnecter.
 *
 * Sans ça, un compte dont personne n'est plus connecté continue de faire
 * sonner le téléphone — jusqu'à ce qu'un autre compte réclame le jeton, ce qui
 * peut ne jamais arriver.
 */
export async function oublierJetonPush(): Promise<void> {
  const { error } = await supabase.rpc('oublier_jeton_push');
  if (error) console.warn('Jeton push non retiré', error.message);
}

/** Valeur laissée par le gabarit du projet tant que `eas init` n'a pas tourné. */
const PROJECT_ID_ABSENT = 'A_RENSEIGNER_APRES_EAS_INIT';

/**
 * Renvoie le jeton push, ou `null` si l'appareil ne peut pas en avoir.
 *
 * Ne lève jamais : cette fonction est appelée pendant l'enregistrement du
 * profil, et le push est un bonus. Une exception ici empêcherait quelqu'un
 * d'enregistrer sa ville — ce qui est le cœur de l'app — pour une raison qui
 * ne le concerne pas. Les cas normaux sont nombreux : simulateur, permission
 * refusée, projectId EAS absent, et Expo Go qui ne supporte plus les
 * notifications distantes.
 */
export async function registerForPushNotificationsAsync(
  { demander = true }: { demander?: boolean } = {}
): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.warn('Notifications push : appareil réel requis, pas un simulateur.');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId === PROJECT_ID_ABSENT) {
      console.warn("Notifications push : projectId EAS absent, lance `npx eas init`.");
      return null;
    }

    // Avant toute demande : sur Android 13 et plus, la fenêtre de permission
    // n'apparaît qu'une fois un canal créé.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted' && demander) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (demander) console.warn('Notifications push : permission refusée.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    // Expo Go ne délivre plus de jeton push distant : c'est attendu en
    // développement, et ça ne doit rien bloquer.
    console.warn('Notifications push indisponibles', err);
    return null;
  }
}

/**
 * Ce que le système permet encore : demander (fenêtre système) ou seulement
 * renvoyer vers les réglages du téléphone (iOS après un refus, Android après
 * deux refus).
 */
export async function etatPermission(): Promise<'accordee' | 'demandable' | 'reglages'> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'accordee';
    return canAskAgain ? 'demandable' : 'reglages';
  } catch {
    return 'demandable';
  }
}

/** Demande la permission, puis enregistre le jeton. Vrai si un jeton est en base. */
export async function activerNotifications(): Promise<boolean> {
  const token = await registerForPushNotificationsAsync({ demander: true });
  if (!token) return false;
  const { error } = await supabase.rpc('enregistrer_jeton_push', { p_token: token });
  if (error) {
    console.warn('Jeton push non enregistré', error.message);
    return false;
  }
  return true;
}
