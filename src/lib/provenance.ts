import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { supabase } from './supabase';

/**
 * Déclare une fois par compte d'où vient le lecteur.
 *
 * Sur Android, Google Play conserve la chaîne `referrer` du lien qui a mené à
 * l'installation : la page de téléchargement y glisse le canal (`utm_source`)
 * et le code du parrain (`anecto_code`), qu'on retrouve ici sans rien
 * demander au lecteur. Sur iPhone, l'App Store ne transmet rien à l'app : la
 * ligne est écrite sans source, et seul le code saisi dans les Réglages
 * rattache un filleul à son parrain.
 *
 * La base ignore une seconde déclaration ; le drapeau local évite seulement
 * de la refaire à chaque ouverture.
 */
export async function declarerProvenance(userId: string): Promise<void> {
  const cle = `anecto.provenance.${userId}`;

  try {
    if (await AsyncStorage.getItem(cle)) return;

    let source: string | null = null;
    let code: string | null = null;

    if (Platform.OS === 'android') {
      try {
        // Ex. « utm_source=partage&anecto_code=K7MQ2P », ou pour une
        // installation depuis la recherche du magasin :
        // « utm_source=google-play&utm_medium=organic ».
        const referent = new URLSearchParams(await Application.getInstallReferrerAsync());
        source = referent.get('utm_source');
        code = referent.get('anecto_code');
      } catch {
        // Service Play absent (émulateur, appareil sans Google) : on déclare
        // la plateforme sans source plutôt que rien.
      }
    }

    const { error } = await supabase.rpc('enregistrer_provenance', {
      p_source: source,
      p_code: code,
      p_plateforme: Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'autre',
    });

    if (error) {
      console.warn('Provenance non enregistrée', error.message);
      return;
    }
    await AsyncStorage.setItem(cle, '1');
  } catch (erreur) {
    // La mesure ne doit jamais gêner l'ouverture de l'app.
    console.warn('Provenance non enregistrée', erreur);
  }
}
