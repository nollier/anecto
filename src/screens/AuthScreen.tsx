import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendMagicLink() {
    if (!email.trim()) {
      Alert.alert('Email manquant', 'Renseigne ton email pour recevoir le lien de connexion.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);

    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>📖 Anecto</Text>
      <Text style={styles.tagline}>Une anecdote vraie de ta ville, chaque jour.</Text>

      {sent ? (
        <Text style={styles.sentText}>
          Lien envoyé à {email}. Ouvre ton email pour te connecter.
        </Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.btn} onPress={sendMagicLink} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Recevoir le lien</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  appName: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  tagline: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 40 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#222', padding: 16, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sentText: { textAlign: 'center', color: '#333', fontSize: 15 },
});
