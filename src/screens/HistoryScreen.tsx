import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Anecdote, HistoryEntry, Statistiques } from '../types';

/** Forme renvoyée par la jointure : Supabase imbrique l'anecdote sous une clé. */
interface HistoryRow {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  anecdote: Anecdote | null;
}

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Statistiques | null>(null);
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

    const { data: mesures } = await supabase.rpc('mes_statistiques');
    setStats((mesures as Statistiques[] | null)?.[0] ?? null);

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
      ListHeaderComponent={
        stats && stats.ville && stats.total_ville > 0 ? (
          <View style={styles.carnet}>
            <Text style={styles.carnetTitre}>
              {stats.lues_ville} des {stats.total_ville} anecdotes de {stats.ville}
            </Text>
            {/* La barre est le vrai message : un texte dit un chiffre, une
                barre montre ce qui reste — c'est ce qui donne envie d'y
                revenir. */}
            <View style={styles.jauge}>
              <View
                style={[
                  styles.jaugeRemplie,
                  { width: `${Math.min(100, (stats.lues_ville / stats.total_ville) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.carnetDetail}>
              {stats.serie > 0
                ? `🔥 ${stats.serie} jour${stats.serie > 1 ? 's' : ''} d'affilée · record ${stats.record}`
                : `Série interrompue · record ${stats.record}`}
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>Pas encore d'anecdote lue. Reviens demain !</Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          accessibilityRole="button"
          // Une anecdote dont le texte a disparu de la base ne s'ouvre pas :
          // la carte reste alors inerte plutôt que d'afficher un écran vide.
          disabled={!item.anecdote}
          onPress={() =>
            navigation.navigate('Anecdote', {
              anecdote: item.anecdote,
              luLe: item.sent_at,
            })
          }
        >
          <Text style={styles.date}>
            {new Date(item.sent_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
          <View style={styles.ligne}>
            <Text style={styles.title}>{item.anecdote?.title}</Text>
            {!!item.anecdote && <Text style={styles.chevron}>›</Text>}
          </View>
          <Text style={styles.city}>
            {item.anecdote?.city}
            {item.anecdote?.period ? ` · ${item.anecdote.period}` : ''}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },
  carnet: { marginBottom: 24 },
  carnetTitre: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  jauge: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  jaugeRemplie: { height: 8, borderRadius: 4, backgroundColor: '#b3402f' },
  carnetDetail: { fontSize: 13, color: '#888', marginTop: 10 },
  card: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  date: { fontSize: 12, color: '#999', marginBottom: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  chevron: { fontSize: 22, color: '#c4c4c4', lineHeight: 22 },
  city: { fontSize: 13, color: '#888', marginTop: 2 },
});
