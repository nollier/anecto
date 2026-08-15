import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

// Connexion par code à 6 chiffres plutôt que par lien magique.
//
// Un lien magique suppose une URL de redirection qui ramène vers l'app — donc
// un lien profond, une liste blanche à tenir à jour dans Supabase, et une
// adresse qui change à chaque tunnel Expo. Il est de surcroît à usage unique :
// les scanners de sécurité des messageries l'ouvrent avant l'utilisateur et le
// consomment, d'où les « lien expiré » au premier clic.
//
// Le code n'a aucun de ces problèmes : il transite par l'écran, pas par le
// système d'exploitation.

const LONGUEUR_CODE = 6;

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);

  async function envoyerCode() {
    const adresse = email.trim().toLowerCase();
    if (!adresse.includes('@')) {
      Alert.alert('Email invalide', 'Vérifie ton adresse.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: true },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Envoi impossible', error.message);
      return;
    }

    setEmail(adresse);
    setCode('');
    setEtape('code');
  }

  async function verifierCode() {
    const saisie = code.trim();
    if (saisie.length !== LONGUEUR_CODE) return;

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: saisie,
      type: 'email',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Code refusé', 'Il est peut-être expiré. Demandes-en un nouveau.');
      setCode('');
      return;
    }
    // La session est captée par App.tsx, qui bascule sur les onglets.
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.appName}>📖 Anecto</Text>
      <Text style={styles.tagline}>Une anecdote vraie de ta ville, chaque jour.</Text>

      {etape === 'email' ? (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!loading}
            onSubmitEditing={envoyerCode}
          />
          <TouchableOpacity style={styles.btn} onPress={envoyerCode} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Recevoir mon code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.consigne}>
            Code envoyé à {email}. Saisis les {LONGUEUR_CODE} chiffres reçus.
          </Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, LONGUEUR_CODE))}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={LONGUEUR_CODE}
            autoFocus
            editable={!loading}
            onSubmitEditing={verifierCode}
          />
          <TouchableOpacity
            style={[styles.btn, code.length !== LONGUEUR_CODE && styles.btnDisabled]}
            onPress={verifierCode}
            disabled={loading || code.length !== LONGUEUR_CODE}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Se connecter</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={envoyerCode} disabled={loading}>
            <Text style={styles.lien}>Renvoyer un code</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEtape('email')} disabled={loading}>
            <Text style={styles.lien}>Changer d'adresse</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  appName: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  tagline: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 40 },
  consigne: { fontSize: 15, color: '#333', textAlign: 'center', marginBottom: 20, lineHeight: 21 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 32,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
  btn: { backgroundColor: '#222', padding: 16, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#bbb' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  lien: { textAlign: 'center', color: '#007AFF', fontSize: 14, marginTop: 20 },
});
