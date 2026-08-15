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
 * notifications s'arrêteraient en silence. On met à jour plutôt qu'on upsert :
 * `profiles.city` est NOT NULL, un upsert créerait une ligne invalide pour un
 * compte qui n'a pas encore choisi sa ville.
 */
export async function syncPushToken(userId: string): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return;

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) console.warn('Jeton push non enregistré', error.message);
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
export async function registerForPushNotificationsAsync(): Promise<string | null> {
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

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notifications push : permission refusée.');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
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
