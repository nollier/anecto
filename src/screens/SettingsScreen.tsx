import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { deviceTimezone } from '../lib/places';
import CityPicker from '../components/CityPicker';
import { CityDetails } from '../types';

export default function SettingsScreen() {
  const [city, setCity] = useState<CityDetails | null>(null);
  const [legacyCity, setLegacyCity] = useState<string | null>(null);
  const [notifTime, setNotifTime] = useState(new Date(new Date().setHours(21, 0, 0, 0)));
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('city, city_place_id, city_lat, city_lng, country_code, notification_hour')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!data) return;

    if (data.city_place_id && data.city_lat !== null && data.city_lng !== null) {
      setCity({
        placeId: data.city_place_id,
        name: data.city,
        formattedAddress: data.city,
        latitude: data.city_lat,
        longitude: data.city_lng,
        countryCode: data.country_code ?? null,
      });
    } else if (data.city) {
      // Profil créé avant l'autocomplétion : la ville était du texte libre et
      // n'est rattachée à rien. On demande de la resélectionner.
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
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      return;
    }

    const pushToken = await registerForPushNotificationsAsync();
    const hh = String(notifTime.getHours()).padStart(2, '0');
    const mm = String(notifTime.getMinutes()).padStart(2, '0');

    const { error } = await supabase.from('profiles').upsert({
      id: userData.user.id,
      city: city.name,
      city_place_id: city.placeId,
      city_lat: city.latitude,
      city_lng: city.longitude,
      country_code: city.countryCode,
      timezone: deviceTimezone(),
      notification_hour: `${hh}:${mm}:00`,
      expo_push_token: pushToken,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      setLegacyCity(null);
      Alert.alert('Enregistré', `Anecdotes de ${city.name} tous les jours à ${hh}:${mm}.`);
    }
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
});
