import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { deviceTimezone } from '../lib/places';
import CityPicker from '../components/CityPicker';
import { POLITIQUE_CONFIDENTIALITE } from '../lib/legal';
import { VilleCouverte } from '../types';

export default function SettingsScreen() {
  const [city, setCity] = useState<VilleCouverte | null>(null);
  const [legacyCity, setLegacyCity] = useState<string | null>(null);
  const [notifTime, setNotifTime] = useState(new Date(new Date().setHours(21, 0, 0, 0)));
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('city, city_place_id, notification_hour')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!data) return;

    if (data.city_place_id) {
      setCity({ ville: data.city, place_id: data.city_place_id });
    } else if (data.city) {
      // Profil d'avant le rattachement à un identifiant de lieu : la ville
      // était du texte libre. On demande de la resélectionner au catalogue.
      setLegacyCity(data.city);
    }

    if (data.notification_hour) {
      const [h, m] = data.notification_hour.split(':').map(Number);
      setNotifTime(new Date(new Date().setHours(h, m, 0, 0)));
    }
  }

  async function saveProfile() {
    if (!city) {
      Alert.alert('Ville manquante', 'Choisis une ville dans la liste pour recevoir tes anecdotes.');
      return;
    }

    setSaving(true);

    // try/finally : sans lui, la moindre exception laisse le bouton bloqué sur
    // « Enregistrement… » sans le moindre message.
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        Alert.alert('Session expirée', 'Reconnecte-toi pour enregistrer.');
        return;
      }

      const pushToken = await registerForPushNotificationsAsync();
      const hh = String(notifTime.getHours()).padStart(2, '0');
      const mm = String(notifTime.getMinutes()).padStart(2, '0');

      const { error } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        city: city.ville,
        city_place_id: city.place_id,
        timezone: deviceTimezone(),
        notification_hour: `${hh}:${mm}:00`,
        // Absent du payload quand il n'y a pas de jeton : l'omettre préserve
        // celui déjà en base, alors qu'un null l'effacerait — un test depuis
        // Expo Go couperait sinon les notifications d'un vrai build.
        ...(pushToken ? { expo_push_token: pushToken } : {}),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        Alert.alert('Erreur', error.message);
        return;
      }

      setLegacyCity(null);
      Alert.alert(
        'Enregistré',
        pushToken
          ? `Anecdotes de ${city.ville} tous les jours à ${hh}:${mm}.`
          : `Anecdotes de ${city.ville} tous les jours à ${hh}:${mm}.\n\nLes notifications ne sont pas disponibles ici (Expo Go, ou projectId EAS manquant) : l'anecdote reste consultable dans l'onglet Aujourd'hui.`
      );
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  async function seDeconnecter() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Erreur', error.message);
    // Le changement de session est capté par App.tsx, qui rebascule sur
    // l'écran de connexion.
  }

  function supprimerCompte() {
    Alert.alert(
      'Supprimer ton compte ?',
      'Ton profil, ton historique et tes retours seront effacés définitivement. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setSuppression(true);
            const { error } = await supabase.functions.invoke('delete-account', { body: {} });
            setSuppression(false);

            if (error) {
              Alert.alert('Erreur', "La suppression n'a pas abouti. Réessaie plus tard.");
              return;
            }
            await supabase.auth.signOut();
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Ta ville</Text>
      {legacyCity && !city && (
        <Text style={styles.hint}>
          Ta ville était enregistrée en texte libre ({legacyCity}). Resélectionne-la ci-dessous pour
          la rattacher précisément.
        </Text>
      )}
      <CityPicker value={city} onChange={setCity} />

      <Text style={styles.label}>Heure de notification quotidienne</Text>
      <TouchableOpacity style={styles.timeBtn} onPress={() => setShowPicker(true)}>
        <Text style={styles.timeBtnText}>
          {String(notifTime.getHours()).padStart(2, '0')}:{String(notifTime.getMinutes()).padStart(2, '0')}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={notifTime}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) setNotifTime(selected);
          }}
        />
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Compte</Text>
      <TouchableOpacity style={styles.secondaryBtn} onPress={seDeconnecter}>
        <Text style={styles.secondaryBtnText}>Se déconnecter</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={supprimerCompte} disabled={suppression}>
        <Text style={styles.dangerText}>
          {suppression ? 'Suppression…' : 'Supprimer mon compte'}
        </Text>
      </TouchableOpacity>

      {/* Google Play exige ce lien dans l'application, et pas seulement dans
          la fiche du magasin, dès lors qu'on collecte une adresse e-mail. */}
      <TouchableOpacity
        onPress={() => Linking.openURL(POLITIQUE_CONFIDENTIALITE)}
        accessibilityRole="link"
      >
        <Text style={styles.lienLegal}>Politique de confidentialité ↗</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 8, color: '#333' },
  hint: { fontSize: 13, color: '#8a6417', marginBottom: 8, lineHeight: 18 },
  timeBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center' },
  timeBtnText: { fontSize: 22, fontWeight: '700' },
  saveBtn: { backgroundColor: '#222', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 40 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  dangerText: { textAlign: 'center', color: '#b3402f', fontSize: 14, marginTop: 20 },
  lienLegal: { textAlign: 'center', color: '#888', fontSize: 13, marginTop: 28 },
});
