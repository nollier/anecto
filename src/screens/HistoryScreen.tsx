import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Anecdote, HistoryEntry } from '../types';

/** Forme renvoyée par la jointure : Supabase imbrique l'anecdote sous une clé. */
interface HistoryRow {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  anecdote: Anecdote | null;
}

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  async function loadHistory() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_anecdote_history')
      .select('id, user_id, anecdote_id, sent_at, anecdote:anecdotes(*)')
      .eq('user_id', userData.user.id)
      .order('sent_at', { ascending: false })
      .returns<HistoryRow[]>();

    if (error) {
      console.error(error);
    } else if (data) {
      setEntries(data.map((row) => ({ ...row, anecdote: row.anecdote ?? undefined })));
    }

    setLoading(false);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadHistory();
          }}
        />
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>Pas encore d'anecdote lue. Reviens demain !</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.date}>
            {new Date(item.sent_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
          <Text style={styles.title}>{item.anecdote?.title}</Text>
          <Text style={styles.city}>
            {item.anecdote?.city}
            {item.anecdote?.period ? ` · ${item.anecdote.period}` : ''}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  card: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  date: { fontSize: 12, color: '#999', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  city: { fontSize: 13, color: '#888', marginTop: 2 },
});
