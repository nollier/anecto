import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import BoutonEcoute from '../components/BoutonEcoute';
import { partagerAnecdote } from '../lib/partage';
import { Anecdote } from '../types';

/**
 * Relecture d'une anecdote déjà lue, ouverte depuis l'historique.
 *
 * L'anecdote est passée en paramètre de navigation plutôt que rechargée :
 * la liste la détient déjà entièrement, un aller-retour réseau n'apporterait
 * rien et ferait clignoter l'écran.
 */
type ParamsAnecdote = { Anecdote: { anecdote: Anecdote; luLe?: string } };

export default function AnecdoteScreen() {
  const { params } = useRoute<RouteProp<ParamsAnecdote, 'Anecdote'>>();
  const { anecdote, luLe } = params;

  // C'est ici que le rattrapage se constate : ouvrir une anecdote en retard
  // depuis l'historique la marque lue, au même titre que l'anecdote du jour
  // sur l'accueil. L'appel est idempotent côté base, une relecture ne déplace
  // donc pas la date et ne transforme pas une lecture du jour en rattrapage.
  useEffect(() => {
    supabase
      .rpc('marquer_anecdote_lue', { p_anecdote_id: anecdote.id })
      .then(({ error }) => {
        if (error) console.error(error);
      });
  }, [anecdote.id]);

  function ouvrirSource() {
    if (anecdote.source_url) Linking.openURL(anecdote.source_url);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.bandeau}>
        <Text style={[styles.eyebrow, styles.bandeauTexte]}>
          {anecdote.city}
          {anecdote.period ? ` · ${anecdote.period}` : ''}
          {luLe
            ? ` · lue le ${new Date(luLe).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`
            : ''}
        </Text>
        <BoutonEcoute anecdote={anecdote} />
      </View>

      {/* Comme sur l'écran du jour : l'accroche porte le titre, avec repli sur
          l'étiquette courte pour les anecdotes d'avant l'accroche. */}
      <Text style={styles.title}>{anecdote.hook || anecdote.title}</Text>
      <Text style={styles.body} textBreakStrategy="highQuality">
        {anecdote.body}
      </Text>

      {anecdote.source_url ? (
        <TouchableOpacity onPress={ouvrirSource} accessibilityRole="link">
          <Text style={styles.sourceLink}>Source : {anecdote.source} ↗</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.source}>Source : {anecdote.source}</Text>
      )}

      {/* Même geste qu'à l'accueil : une anecdote relue se partage aussi bien
          qu'une anecdote du jour, et c'est souvent en la relisant qu'on pense
          à quelqu'un à qui l'envoyer. */}
      <TouchableOpacity
        style={styles.partage}
        accessibilityRole="button"
        onPress={() => partagerAnecdote(anecdote)}
      >
        <Text style={styles.partageTexte}>↗ Partager cette anecdote</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '600' },
  bandeau: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bandeauTexte: { flex: 1, marginBottom: 0 },
  title: { fontSize: 21, fontWeight: '700', lineHeight: 28, marginBottom: 18, color: '#1a1a1a' },
  // Justifié comme sur l'écran du jour : une anecdote relue doit se présenter
  // exactement comme à sa première lecture.
  body: { fontSize: 16, lineHeight: 26, color: '#333', textAlign: 'justify' },
  source: { fontSize: 12, color: '#999', marginTop: 20, fontStyle: 'italic' },
  sourceLink: { fontSize: 12, color: '#007AFF', marginTop: 20 },
  partage: {
    alignSelf: 'flex-start',
    marginTop: 24,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: '#fbeeeb',
  },
  partageTexte: { fontSize: 13, fontWeight: '600', color: '#b3402f' },
});
