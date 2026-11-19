import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import {
  CATEGORIES,
  CategorieIdee,
  Idee,
  STATUTS,
  TEXTE_IDEE_MAX,
  TEXTE_IDEE_MIN,
  messageErreur,
} from '../lib/communaute';

/**
 * Boîte à idées : lue par l'équipe seulement. Une idée par semaine, la base
 * fait respecter la limite. Le lecteur suit le statut de ses idées.
 */
export default function IdeeScreen() {
  const [categorie, setCategorie] = useState<CategorieIdee>('anecdotes');
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [idees, setIdees] = useState<Idee[]>([]);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('idees')
      .select('id, categorie, texte, statut, cree_at')
      .order('cree_at', { ascending: false })
      .limit(20);
    setIdees((data ?? []) as Idee[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const longueur = texte.trim().length;
  const valide = longueur >= TEXTE_IDEE_MIN && longueur <= TEXTE_IDEE_MAX;

  async function envoyer() {
    if (!valide || envoi) return;
    setEnvoi(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('proposer_idee', {
      p_categorie: categorie,
      p_texte: texte.trim(),
    });
    setEnvoi(false);
    if (error) {
      setMessage({ texte: messageErreur(error, "Ton idée n'est pas partie. Réessaie."), ok: false });
      return;
    }
    const prochaine = data ? new Date(data as string) : null;
    setTexte('');
    setMessage({
      texte: prochaine
        ? `Merci ! Prochaine idée possible le ${prochaine.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
        : 'Merci !',
      ok: true,
    });
    charger();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.entete}>
          <Text style={styles.titre}>Ton idée pour Anecto</Text>
          <Text style={styles.intro}>
            Les idées sont lues par l'équipe. Les meilleures passent au vote suivant.
          </Text>
        </View>

        <View style={styles.bloc}>
          <Text style={styles.libelle}>Catégorie</Text>
          <View style={styles.puces}>
            {CATEGORIES.map((c) => {
              const active = c.cle === categorie;
              return (
                <TouchableOpacity
                  key={c.cle}
                  onPress={() => setCategorie(c.cle)}
                  style={[styles.puce, active && styles.puceActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                >
                  <Text style={[styles.puceTexte, active && styles.puceTexteActive]}>{c.libelle}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.bloc}>
          <Text style={styles.libelle} nativeID="libelle-idee">Ton idée</Text>
          <TextInput
            accessibilityLabelledBy="libelle-idee"
            value={texte}
            onChangeText={setTexte}
            multiline
            maxLength={TEXTE_IDEE_MAX}
            placeholder="Ex. : un mode audio pour écouter l'anecdote en voiture"
            placeholderTextColor="#999"
            style={styles.champ}
            textAlignVertical="top"
          />
          <Text style={styles.compteur}>
            {longueur} / {TEXTE_IDEE_MAX}
          </Text>
        </View>

        {!!message && (
          <Text style={[styles.message, message.ok ? styles.messageOk : styles.messageErreur]}>
            {message.texte}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.bouton, (!valide || envoi) && styles.boutonInactif]}
          onPress={envoyer}
          disabled={!valide || envoi}
          accessibilityRole="button"
        >
          {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Envoyer mon idée</Text>}
        </TouchableOpacity>
        <Text style={styles.sousBouton}>Une idée par semaine</Text>

        {idees.length > 0 && (
          <View style={styles.mesIdees}>
            <Text style={styles.mesIdeesTitre}>Mes idées</Text>
            {idees.map((i) => {
              const s = STATUTS[i.statut];
              return (
                <View key={i.id} style={styles.idee}>
                  <Text style={styles.ideeTexte} numberOfLines={2}>
                    {i.texte}
                  </Text>
                  <Text style={[styles.statut, { color: s.couleur, backgroundColor: s.fond }]}>{s.libelle}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 8, paddingBottom: 40, gap: 16 },
  entete: { gap: 6 },
  titre: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#1a1a1a' },
  intro: { fontSize: 15, lineHeight: 21, color: '#444' },
  bloc: { gap: 8 },
  libelle: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d6d0ca',
    justifyContent: 'center',
  },
  puceActive: { backgroundColor: '#222', borderColor: '#222' },
  puceTexte: { fontSize: 14, color: '#333' },
  puceTexteActive: { color: '#fff', fontWeight: '600' },
  champ: {
    minHeight: 120,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d6d0ca',
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 21,
    color: '#1a1a1a',
  },
  compteur: { fontSize: 12, color: '#6b6b6b', alignSelf: 'flex-end' },
  message: { fontSize: 14, lineHeight: 20 },
  messageOk: { color: '#1d6b4f' },
  messageErreur: { color: '#b3402f' },
  bouton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonInactif: { opacity: 0.4 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sousBouton: { fontSize: 12, color: '#6b6b6b', textAlign: 'center', marginTop: -8 },
  mesIdees: { gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  mesIdeesTitre: { fontSize: 13, fontWeight: '700', color: '#6b6b6b' },
  idee: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ideeTexte: { flex: 1, fontSize: 14, lineHeight: 19, color: '#333' },
  statut: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 10,
    overflow: 'hidden',
  },
});
