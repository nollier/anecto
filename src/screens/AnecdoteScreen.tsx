import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, Linking } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
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

  function ouvrirSource() {
    if (anecdote.source_url) Linking.openURL(anecdote.source_url);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>
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

      {/* Comme sur l'écran du jour : l'accroche porte le titre, avec repli sur
          l'étiquette courte pour les anecdotes d'avant l'accroche. */}
      <Text style={styles.title}>{anecdote.hook || anecdote.title}</Text>
      <Text style={styles.body}>{anecdote.body}</Text>

      {anecdote.source_url ? (
        <TouchableOpacity onPress={ouvrirSource} accessibilityRole="link">
          <Text style={styles.sourceLink}>Source : {anecdote.source} ↗</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.source}>Source : {anecdote.source}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '600' },
  title: { fontSize: 21, fontWeight: '700', lineHeight: 28, marginBottom: 18, color: '#1a1a1a' },
  body: { fontSize: 16, lineHeight: 26, color: '#333' },
  source: { fontSize: 12, color: '#999', marginTop: 20, fontStyle: 'italic' },
  sourceLink: { fontSize: 12, color: '#007AFF', marginTop: 20 },
});
