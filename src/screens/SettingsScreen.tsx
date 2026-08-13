import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/notifications';

export default function SettingsScreen() {
  const [city, setCity] = useState('');
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
      .select('city, notification_hour')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (data) {
      setCity(data.city ?? '');
      if (data.notification_hour) {
        const [h, m] = data.notification_hour.split(':').map(Number);
        setNotifTime(new Date(new Date().setHours(h, m, 0, 0)));
      }
    }
  }

  async function saveProfile() {
    if (!city.trim()) {
      Alert.alert('Ville manquante', 'Choisis une ville pour recevoir tes anecdotes.');
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
      city: city.trim(),
      notification_hour: `${hh}:${mm}:00`,
      expo_push_token: pushToken,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert('Enregistré', `Anecdotes de ${city} tous les jours à ${hh}:${mm}.`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Ta ville</Text>
      <TextInput
        style={styles.input}
        value={city}
        onChangeText={setCity}
        placeholder="Ex : Saint-Malo"
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 },
  timeBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center' },
  timeBtnText: { fontSize: 22, fontWeight: '700' },
  saveBtn: { backgroundColor: '#222', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 40 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
