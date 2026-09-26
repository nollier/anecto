import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const CLE = 'anecto.avis-magasin.demande-le';

/**
 * Quatre mois entre deux demandes. Apple plafonne de toute façon à trois
 * affichages par an et Google à un quota qu'il ne publie pas : au-delà, la
 * demande est avalée sans rien afficher, et on aurait gâché le bon moment.
 */
const INTERVALLE_MS = 120 * 24 * 60 * 60 * 1000;

/**
 * Propose de noter l'app sur le magasin, à un moment où le lecteur vient de
 * dire qu'il aime : un « J'adore », un partage abouti. Jamais à l'ouverture,
 * jamais au milieu d'une lecture.
 *
 * La fenêtre est celle du système, dans l'app : pas de détour par une page
 * du magasin, et aucune question préalable du type « Tu aimes Anecto ? » —
 * les deux magasins interdisent de filtrer ainsi qui on envoie noter.
 */
export async function proposerAvisMagasin(): Promise<void> {
  try {
    const derniere = Number(await AsyncStorage.getItem(CLE));
    if (derniere && Date.now() - derniere < INTERVALLE_MS) return;

    // Faux sur TestFlight et sur un appareil sans Google Play.
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;

    // Noté avant l'appel : si la fenêtre échoue, on n'insiste pas pour autant.
    await AsyncStorage.setItem(CLE, String(Date.now()));
    await StoreReview.requestReview();
  } catch (erreur) {
    console.warn('Demande de note impossible', erreur);
  }
}
