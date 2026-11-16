import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { activerNotifications, etatPermission } from '../lib/notifications';
import { noterAffichage, noterRefus } from '../lib/demandeNotifications';
import { noter } from '../lib/mesure';
import { t } from '../lib/textes';

type Props = {
  userId: string;
  ville: string | null;
  onFerme: () => void;
};

/**
 * L'écran qui précède la demande système de notifications.
 *
 * La fenêtre du système ne s'affiche qu'une fois sur iOS : un refus réflexe à
 * l'ouverture, avant même d'avoir lu une anecdote, coupe les notifications
 * pour de bon. On l'explique donc d'abord, après une première lecture, quand
 * le lecteur sait ce qu'il recevrait.
 *
 * Si le système ne permet plus de demander (refus antérieur), le bouton mène
 * aux réglages du téléphone : c'est le seul chemin qui reste.
 */
export default function DemandeNotifications({ userId, ville, onFerme }: Props) {
  const [etat, setEtat] = useState<'demandable' | 'reglages' | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await etatPermission();
      setEtat(e === 'reglages' ? 'reglages' : 'demandable');
      noterAffichage(userId);
      noter('demande_notif_affichee', { reglages: e === 'reglages' });
    })();
  }, [userId]);

  async function accepter() {
    if (etat === 'reglages') {
      Linking.openSettings();
      onFerme();
      return;
    }
    setEnCours(true);
    const ok = await activerNotifications();
    setEnCours(false);
    if (ok) {
      noter('demande_notif_acceptee');
    } else {
      noter('demande_notif_refusee', { via: 'systeme' });
      noterRefus(userId);
    }
    onFerme();
  }

  function refuser() {
    noter('demande_notif_refusee', { via: 'ecran' });
    noterRefus(userId);
    onFerme();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={refuser}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <Text style={styles.icone}>🔔</Text>
          <Text style={styles.titre}>{t('demandeNotif.titre')}</Text>
          <Text style={styles.texte}>
            {ville ? t('demandeNotif.texte', { ville }) : t('demandeNotif.texteSansVille')}
          </Text>
          {etat === 'reglages' && <Text style={styles.aide}>{t('demandeNotif.aideReglages')}</Text>}

          {etat === null || enCours ? (
            <ActivityIndicator size="large" style={styles.attente} />
          ) : (
            <TouchableOpacity style={styles.oui} accessibilityRole="button" onPress={accepter}>
              <Text style={styles.ouiTexte}>
                {etat === 'reglages' ? t('demandeNotif.reglages') : t('demandeNotif.oui')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.non} accessibilityRole="button" onPress={refuser} disabled={enCours}>
            <Text style={styles.nonTexte}>{t('demandeNotif.non')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  carte: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  icone: { fontSize: 40, marginBottom: 8 },
  titre: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 12 },
  texte: { fontSize: 17, lineHeight: 25, color: '#333', textAlign: 'center' },
  aide: { fontSize: 15, lineHeight: 22, color: '#666', textAlign: 'center', marginTop: 12 },
  attente: { marginVertical: 24 },
  oui: {
    alignSelf: 'stretch',
    backgroundColor: '#b3402f',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  ouiTexte: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  non: { paddingVertical: 16, paddingHorizontal: 20, marginTop: 4 },
  nonTexte: { color: '#666', fontSize: 17, fontWeight: '600' },
});
