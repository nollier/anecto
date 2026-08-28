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
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';

// Connexion par code reçu par email, plutôt que par lien magique.
//
// Un lien magique suppose une URL de redirection qui ramène vers l'app — donc
// un lien profond, une liste blanche à tenir à jour dans Supabase, et une
// adresse qui change à chaque tunnel Expo. Il est de surcroît à usage unique :
// les scanners de sécurité des messageries l'ouvrent avant l'utilisateur et le
// consomment, d'où les « lien expiré » au premier clic.
//
// Le code n'a aucun de ces problèmes : il transite par l'écran, pas par le
// système d'exploitation.

// La longueur du code est un réglage de projet Supabase (Authentication →
// Sign In / Providers → Email OTP Length), pas une constante du protocole.
// L'écran accepte donc toute la plage plutôt que de figer une valeur qui
// tronquerait silencieusement la saisie.
const CODE_MIN = 6;
const CODE_MAX = 10;
// Sert uniquement d'indice visuel : à aligner sur le réglage du projet.
const CODE_ATTENDU = 8;

/**
 * Compte de revue des magasins.
 *
 * Les examinateurs d'Apple et de Google doivent ouvrir l'application, mais
 * n'ont pas accès à la boîte qui reçoit les codes. Cette adresse emprunte donc
 * la fonction `review-login`, qui vérifie un code fixe côté serveur et rend un
 * jeton de session — sans qu'aucun e-mail parte.
 *
 * Le code ne figure nulle part ici : il vit dans les secrets de la fonction.
 * Connaître cette adresse n'ouvre donc rien.
 */
const EMAIL_REVUE = 'anecto@mail.fr';

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

    // Le compte de revue passe directement à la saisie : son code est fixe,
    // et lui envoyer un message encombrerait la boîte de contact à chaque
    // ouverture de l'app par un examinateur.
    if (adresse === EMAIL_REVUE) {
      setEmail(adresse);
      setCode('');
      setEtape('code');
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

  /**
   * Échange le code de revue contre une session.
   *
   * La fonction ne rend un jeton que si l'adresse et le code correspondent à
   * ses secrets ; l'échange final passe ensuite par `verifyOtp`, c'est-à-dire
   * par la même vérification que pour n'importe quel lecteur.
   */
  async function connexionRevue(saisie: string): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('review-login', {
      body: { email: EMAIL_REVUE, code: saisie },
    });

    if (error || !data?.token_hash) return false;

    const { error: erreurSession } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    });

    return !erreurSession;
  }

  async function verifierCode() {
    const saisie = code.trim();
    if (saisie.length < CODE_MIN) return;

    setLoading(true);

    if (email === EMAIL_REVUE) {
      const ouvert = await connexionRevue(saisie);
      setLoading(false);
      if (!ouvert) {
        Alert.alert('Code refusé', 'Vérifie le code saisi.');
        setCode('');
      }
      return;
    }

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
    // `behavior` valait `undefined` sur Android : le composant n'y faisait donc
    // rien du tout. Le champ, centré verticalement, se retrouvait pile sous le
    // clavier — impossible de voir ce qu'on tapait.
    //
    // `padding` sur les deux plateformes : depuis que l'affichage Android va de
    // bord à bord, la fenêtre n'est plus redimensionnée à l'ouverture du
    // clavier, et c'est à la vue de se décaler elle-même.
    //
    // Le ScrollView est le filet de sécurité : même si le décalage se trompe
    // de quelques pixels, ou sur un écran très court, le champ reste
    // atteignable à la main plutôt que hors de portée.
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
              Code envoyé à {email}. Saisis les chiffres reçus.
            </Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_MAX))}
              placeholder={'0'.repeat(CODE_ATTENDU)}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={CODE_MAX}
              autoFocus
              editable={!loading}
              onSubmitEditing={verifierCode}
            />
            <TouchableOpacity
              style={[styles.btn, code.length < CODE_MIN && styles.btnDisabled]}
              onPress={verifierCode}
              disabled={loading || code.length < CODE_MIN}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  // `flexGrow` et non `flex` : dans un contentContainerStyle, `flex: 1` fige la
  // hauteur du contenu à celle du cadre et empêche tout défilement — le filet
  // de sécurité ne servirait alors à rien.
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
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
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 16,
  },
  btn: { backgroundColor: '#222', padding: 16, borderRadius: 10, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#bbb' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  lien: { textAlign: 'center', color: '#007AFF', fontSize: 14, marginTop: 20 },
});
