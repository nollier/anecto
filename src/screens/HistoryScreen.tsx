import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Anecdote, HistoryEntry, Statistiques } from '../types';

/** Forme renvoyée par la jointure : Supabase imbrique l'anecdote sous une clé. */
interface HistoryRow {
  id: string;
  user_id: string;
  anecdote_id: string;
  sent_at: string;
  sent_on: string | null;
  read_at: string | null;
  anecdote: Anecdote | null;
}

type Filtre = 'tout' | 'non_lues';

/**
 * L'accueil peut demander l'ouverture directe sur le rattrapage. `demandeLe`
 * n'est pas décoratif : sans lui, un second appui sur la relance ne changerait
 * rien puisque `filtre` porterait déjà la même valeur, et l'écran resterait sur
 * l'onglet que le lecteur avait choisi entre-temps.
 */
type ParamsListe = { Liste: { filtre?: Filtre; demandeLe?: number } | undefined };

/** Date du jour au format AAAA-MM-JJ, dans le fuseau de l'appareil. */
function aujourdhui(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * En retard, et pas seulement pas encore lue : la journée en cours est exclue,
 * exactement comme dans `mes_statistiques`. Sinon le compteur de l'onglet et
 * les pastilles de la liste se contrediraient d'une unité toute la journée.
 */
function estEnRetard(entry: HistoryEntry, jour: string): boolean {
  return !entry.read_at && !!entry.sent_on && entry.sent_on < jour;
}

/** Ce que dit la flamme. `affilée` est invariable, elle ne s'accorde pas. */
function libelleSerie(stats: Statistiques): string {
  if (stats.serie === 0) return "Série interrompue · reprends aujourd'hui";
  if (stats.serie === 1) return '🔥 Premier jour';
  return `🔥 ${stats.serie} jours d'affilée`;
}

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<ParamsListe, 'Liste'>>();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Le plus grand retard observé depuis le dernier carnet à jour. C'est lui
  // qu'on annonce au moment du rattrapage : « tu as rattrapé 3 anecdotes »,
  // pas « tu en as rattrapé 1 », qui serait vrai mais mesquin.
  const retardMax = useRef(0);
  const [rattrapage, setRattrapage] = useState<number | null>(null);

  useEffect(() => {
    if (params?.filtre) setFiltre(params.filtre);
  }, [params?.filtre, params?.demandeLe]);

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
      .select('id, user_id, anecdote_id, sent_at, sent_on, read_at, anecdote:anecdotes(*)')
      .eq('user_id', userData.user.id)
      .order('sent_at', { ascending: false })
      .returns<HistoryRow[]>();

    if (error) {
      console.error(error);
    } else if (data) {
      setEntries(data.map((row) => ({ ...row, anecdote: row.anecdote ?? undefined })));
    }

    const { data: mesures } = await supabase.rpc('mes_statistiques');
    const mesuresLues = (mesures as Statistiques[] | null)?.[0] ?? null;
    setStats(mesuresLues);

    // Le moment du rattrapage : le retard vient de tomber à zéro. On le
    // célèbre une fois, à ce passage précis, puis on n'en reparle plus.
    const retard = mesuresLues?.non_lues ?? 0;
    if (retard > 0) {
      retardMax.current = Math.max(retardMax.current, retard);
      setRattrapage(null);
    } else if (retardMax.current > 0) {
      setRattrapage(retardMax.current);
      retardMax.current = 0;
      // Plus rien à filtrer : l'onglet disparaît, mieux vaut ne pas laisser
      // le lecteur seul devant une liste vide.
      setFiltre('tout');
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

  const jour = aujourdhui();
  const retard = stats?.non_lues ?? 0;
  const visibles = filtre === 'non_lues' ? entries.filter((e) => estEnRetard(e, jour)) : entries;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={visibles}
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
        // Le carnet ne dit toujours pas combien d'anecdotes existent dans la
        // ville : annoncer « 12 des 30 » révélait la taille du stock et
        // transformait une découverte quotidienne en compte à rebours.
        stats && entries.length > 0 ? (
          <View style={styles.carnet}>
            <Text style={[styles.carnetTitre, stats.serie === 0 && styles.carnetTitreCasse]}>
              {libelleSerie(stats)}
            </Text>
            <Text style={styles.carnetDetail}>
              {stats.total_lues} lues ·{' '}
              <Text style={retard > 0 ? styles.carnetRetard : undefined}>
                {retard} non lue{retard > 1 ? 's' : ''}
              </Text>{' '}
              · record {stats.record} jour{stats.record > 1 ? 's' : ''}
            </Text>

            {/* Carnet à jour, état permanent : une ligne, pas un encadré. */}
            {retard === 0 && stats.total_lues > 0 && (
              <Text style={styles.carnetAJour}>
                <Text style={styles.carnetAJourCoche}>✓</Text> {stats.total_lues} anecdote
                {stats.total_lues > 1 ? 's' : ''} lue{stats.total_lues > 1 ? 's' : ''}, aucune
                oubliée.
              </Text>
            )}

            {/* Le rattrapage, lui, est un événement : il a droit à son cadre,
                une seule fois, à l'instant où le retard vient d'être soldé. */}
            {rattrapage !== null && (
              <View style={styles.cachet}>
                <Text style={styles.cachetTitre}>Carnet à jour</Text>
                <Text style={styles.cachetTexte}>
                  Tu as rattrapé{' '}
                  <Text style={styles.cachetFort}>
                    {rattrapage} anecdote{rattrapage > 1 ? 's' : ''}
                  </Text>
                  . Plus rien ne t'attend.
                </Text>
              </View>
            )}

            {retard > 0 && (
              <View style={styles.onglets}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.onglet, filtre === 'tout' && styles.ongletActif]}
                  onPress={() => setFiltre('tout')}
                >
                  <Text style={[styles.ongletTexte, filtre === 'tout' && styles.ongletTexteActif]}>
                    Tout
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.onglet, filtre === 'non_lues' && styles.ongletActif]}
                  onPress={() => setFiltre('non_lues')}
                >
                  <Text
                    style={[styles.ongletTexte, filtre === 'non_lues' && styles.ongletTexteActif]}
                  >
                    Non lues · {retard}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          {filtre === 'non_lues'
            ? 'Plus rien à rattraper.'
            : "Pas encore d'anecdote lue. Reviens demain !"}
        </Text>
      }
      renderItem={({ item }) => {
        const enRetard = estEnRetard(item, jour);
        return (
          <TouchableOpacity
            style={styles.card}
            accessibilityRole="button"
            // Une anecdote dont le texte a disparu de la base ne s'ouvre pas :
            // la carte reste alors inerte plutôt que d'afficher un écran vide.
            disabled={!item.anecdote}
            onPress={() =>
              navigation.navigate('Anecdote', {
                anecdote: item.anecdote,
                luLe: item.read_at ?? undefined,
              })
            }
          >
            {/* Le code de la messagerie non lue : une pastille, rien à lire. */}
            {enRetard && <View style={styles.pastille} />}
            <Text style={styles.date}>
              {new Date(item.sent_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <View style={styles.ligne}>
              <Text style={[styles.title, enRetard && styles.titleNonLue]}>
                {item.anecdote?.title}
              </Text>
              {!!item.anecdote && <Text style={styles.chevron}>›</Text>}
            </View>
            <Text style={styles.city}>
              {item.anecdote?.city}
              {item.anecdote?.period ? ` · ${item.anecdote.period}` : ''}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40 },

  carnet: { marginBottom: 8 },
  carnetTitre: { fontSize: 17, fontWeight: '700', color: '#b3402f' },
  // Une série cassée perd la couleur, pas la place : c'est un constat, pas
  // une alerte, et la phrase donne déjà l'action à faire.
  carnetTitreCasse: { color: '#888' },
  carnetDetail: { fontSize: 13, color: '#888', marginTop: 4 },
  carnetRetard: { color: '#b3402f', fontWeight: '600' },
  carnetAJour: { fontSize: 13, color: '#888', marginTop: 6 },
  carnetAJourCoche: { color: '#b3402f', fontWeight: '700' },

  cachet: {
    marginTop: 14,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b3402f',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cachetTitre: { fontSize: 16, fontWeight: '700', color: '#b3402f' },
  cachetTexte: { fontSize: 13.5, color: '#333', marginTop: 5, textAlign: 'center' },
  cachetFort: { fontWeight: '700', color: '#1a1a1a' },

  onglets: { flexDirection: 'row', gap: 8, marginTop: 16 },
  onglet: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#eee',
  },
  ongletActif: { backgroundColor: '#b3402f', borderColor: '#b3402f' },
  ongletTexte: { fontSize: 13, fontWeight: '600', color: '#888' },
  ongletTexteActif: { color: '#fff' },

  card: {
    paddingVertical: 16,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pastille: {
    position: 'absolute',
    left: 0,
    top: 21,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#b3402f',
  },
  date: { fontSize: 12, color: '#999', marginBottom: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  titleNonLue: { fontWeight: '700' },
  chevron: { fontSize: 22, color: '#c4c4c4', lineHeight: 22 },
  city: { fontSize: 13, color: '#888', marginTop: 2 },
});
