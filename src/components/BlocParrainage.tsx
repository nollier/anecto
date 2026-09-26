import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { MesParrainages, mesParrainages, saisirCodeParrainage } from '../lib/parrainage';
import { partagerInvitation } from '../lib/partage';

/** La base n'accepte un parrain que sur un compte de moins de trente jours. */
const DELAI_SAISIE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Inviter, et voir ce que ses invitations ont donné.
 *
 * Pas de récompense : le compteur suffit. Il dit au lecteur que son geste a
 * servi, sans transformer le partage en monnaie ni révéler qui s'est inscrit.
 *
 * La saisie d'un code n'existe que pour l'iPhone, où l'App Store ne transmet
 * rien à l'app ; elle reste proposée à tous tant que le compte est récent et
 * sans parrain, un Android installé hors du lien n'ayant rien reçu non plus.
 */
export default function BlocParrainage() {
  const [etat, setEtat] = useState<MesParrainages | null>(null);
  const [compteRecent, setCompteRecent] = useState(false);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // Au retour sur l'onglet : les compteurs bougent pendant qu'on est ailleurs.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      (async () => {
        const { data } = await supabase.auth.getSession();
        const creeLe = data.session?.user.created_at;
        const resultat = await mesParrainages();
        if (!vivant) return;
        setCompteRecent(!!creeLe && Date.now() - new Date(creeLe).getTime() < DELAI_SAISIE_MS);
        setEtat(resultat);
      })();
      return () => {
        vivant = false;
      };
    }, [])
  );

  async function valider() {
    if (envoi || !code.trim()) return;
    setEnvoi(true);
    const ok = await saisirCodeParrainage(code);
    setEnvoi(false);

    if (!ok) {
      Alert.alert('Code non reconnu', 'Vérifie les six caractères, sans espace.');
      return;
    }
    setCode('');
    setEtat((e) => (e ? { ...e, parraine: true } : e));
    Alert.alert('Merci !', 'Ton parrain saura que tu as rejoint Anecto.');
  }

  function bilan(e: MesParrainages): string {
    if (e.inscrits > 0) {
      return `${e.inscrits} personne${e.inscrits > 1 ? 's' : ''} inscrite${e.inscrits > 1 ? 's' : ''} grâce à toi · lien ouvert ${e.ouvertures} fois`;
    }
    if (e.ouvertures > 0) return `Ton lien a été ouvert ${e.ouvertures} fois.`;
    return "Personne n'a encore ouvert ton lien.";
  }

  return (
    <View>
      <Text style={styles.label}>Faire découvrir Anecto</Text>
      <TouchableOpacity style={styles.bouton} onPress={partagerInvitation}>
        <Text style={styles.boutonTexte}>Inviter un proche</Text>
      </TouchableOpacity>

      {etat && (
        <>
          <Text style={styles.bilan}>{bilan(etat)}</Text>
          <Text style={styles.code}>
            Ton code : <Text style={styles.codeFort}>{etat.code}</Text>
          </Text>
        </>
      )}

      {etat && !etat.parraine && compteRecent && (
        <View style={styles.saisie}>
          <Text style={styles.aide}>Un proche t'a invité ? Saisis son code.</Text>
          <View style={styles.rangee}>
            <TextInput
              style={styles.champ}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="K7MQ2P"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={valider}
            />
            <TouchableOpacity
              style={[styles.valider, code.trim().length !== 6 && styles.validerInactif]}
              disabled={code.trim().length !== 6 || envoi}
              onPress={valider}
            >
              <Text style={styles.validerTexte}>{envoi ? '…' : 'Valider'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 8, color: '#333' },
  bouton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#fbeeeb',
  },
  boutonTexte: { fontSize: 15, fontWeight: '600', color: '#b3402f' },
  bilan: { fontSize: 13, color: '#666', marginTop: 10, textAlign: 'center' },
  code: { fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' },
  codeFort: { color: '#1a1a1a', fontWeight: '700', letterSpacing: 1 },
  saisie: { marginTop: 16 },
  aide: { fontSize: 13, color: '#666', marginBottom: 8 },
  rangee: { flexDirection: 'row', gap: 8 },
  champ: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    letterSpacing: 2,
  },
  valider: { backgroundColor: '#222', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  validerInactif: { backgroundColor: '#bbb' },
  validerTexte: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
