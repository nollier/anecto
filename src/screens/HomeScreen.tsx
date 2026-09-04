import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  RefreshControl,
  Keyboard,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Anecdote, FeedbackType, Statistiques } from '../types';

/** Le champ libre sert aux corrections comme aux propositions. */
type SaisieLibre = 'incomplete' | 'propose' | null;

/**
 * Ce que dit la flamme.
 *
 * « 1 jour d'affilée » sonne comme un échec alors que c'est un début, et
 * « Série interrompue » seul ne dit pas quoi faire : les deux cas méritent
 * leur phrase. `affilée` est une locution invariable, elle ne s'accorde pas.
 */
function libelleSerie(stats: Statistiques): string {
  if (stats.serie === 0) return 'Série interrompue · reprends aujourd\'hui';
  if (stats.serie === 1) return '🔥 Premier jour';

  const base = `🔥 ${stats.serie} jours d'affilée`;
  return stats.serie >= stats.record ? `${base} · ton record 🎉` : base;
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [anecdote, setAnecdote] = useState<Anecdote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profilConfigure, setProfilConfigure] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState<FeedbackType | null>(null);
  const [saisie, setSaisie] = useState<SaisieLibre>(null);
  const [texteLibre, setTexteLibre] = useState('');
  const [stats, setStats] = useState<Statistiques | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Le champ de saisie est en bas d'une anecdote de 300 à 450 mots : à
  // l'ouverture du clavier il se retrouve dessous, et on écrit à l'aveugle.
  // On attend `keyboardDidShow` plutôt que `onFocus` — à cet instant seulement
  // la hauteur disponible est connue, donc `scrollToEnd` vise juste.
  useEffect(() => {
    if (!saisie) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [saisie]);

  // Recharge à chaque retour sur l'onglet : changer de ville dans les Réglages
  // doit se voir immédiatement.
  useFocusEffect(
    useCallback(() => {
      loadTodayAnecdote();
    }, [])
  );

  async function loadTodayAnecdote() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }

    // Sans ville, l'écran vide doit dire quoi faire plutôt que « rien à lire ».
    const { data: profil } = await supabase
      .from('profiles')
      .select('city')
      .eq('id', userData.user.id)
      .maybeSingle();

    setProfilConfigure(!!profil?.city);

    // Toute la logique vit dans une fonction Postgres : rotation, exclusion de
    // ce que l'utilisateur a déjà lu, incrément du compteur et écriture de
    // l'historique, en une transaction. Rouvrir l'onglet dans la journée
    // renvoie la même anecdote plutôt que d'en consommer une de plus.
    const { data, error } = await supabase.rpc('get_daily_anecdote');
    if (error) {
      console.error(error);
    }

    const dujour = (data as Anecdote | null) ?? null;
    setAnecdote(dujour);
    setSaisie(null);
    setTexteLibre('');

    // L'anecdote est à l'écran : c'est ici, et nulle part ailleurs, qu'une
    // lecture est constatée. Le cron d'envoi ne marque plus rien — c'était
    // tout le problème de l'ancienne série, qui comptait des jours où
    // personne n'avait ouvert l'app.
    if (dujour) {
      const { error: erreurLecture } = await supabase.rpc('marquer_anecdote_lue', {
        p_anecdote_id: dujour.id,
      });
      // Un marquage qui échoue en silence, c'est la série qui se remet à
      // mentir sans que personne ne le voie — la panne qu'on vient de corriger.
      if (erreurLecture) console.error(erreurLecture);
    }

    // Après le marquage, jamais avant : c'est lui qui fait passer la série
    // de 2 à 3 le jour même, sans quoi l'écran afficherait le compte d'hier.
    const { data: mesures } = await supabase.rpc('mes_statistiques');
    setStats((mesures as Statistiques[] | null)?.[0] ?? null);

    // L'avis vit en base, pas dans l'état du composant : relancer l'app ne
    // doit pas permettre de voter une seconde fois.
    if (dujour) {
      const { data: avis } = await supabase
        .from('feedback')
        .select('type')
        .eq('user_id', userData.user.id)
        .eq('anecdote_id', dujour.id)
        .limit(1)
        .maybeSingle();
      setFeedbackGiven((avis?.type as FeedbackType) ?? null);
    } else {
      setFeedbackGiven(null);
    }

    setLoading(false);
    setRefreshing(false);
  }

  /**
   * Qui clique veut rattraper, pas parcourir : on ouvre l'historique
   * directement filtré. L'onglet « Tout » reste à un geste de là.
   */
  function ouvrirNonLues() {
    // `demandeLe` force la prise en compte : sans lui, un second appui sur la
    // relance passerait le même paramètre et l'écran resterait sur l'onglet
    // que le lecteur avait choisi entre-temps.
    navigation.navigate('Historique', {
      screen: 'Liste',
      params: { filtre: 'non_lues', demandeLe: Date.now() },
    });
  }

  async function submitFeedback(type: FeedbackType, comment?: string) {
    if (!anecdote) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    // `reuse_count` n'est plus touché ici : RLS interdit toute écriture du
    // client sur `anecdotes`, et le compteur appartient désormais à
    // get_daily_anecdote(), qui l'incrémente à l'envoi.
    const { error } = await supabase.from('feedback').insert({
      user_id: userData.user.id,
      anecdote_id: anecdote.id,
      type,
      comment: comment?.trim() || null,
    });

    if (error) {
      Alert.alert('Retour non enregistré', 'Réessaie dans un instant.');
      return;
    }

    setFeedbackGiven(type);
    setSaisie(null);
    Alert.alert(
      'Merci !',
      type === 'propose'
        ? 'Ta proposition part en relecture.'
        : 'Ton retour a bien été enregistré.'
    );
  }

  function ouvrirSource() {
    if (anecdote?.source_url) Linking.openURL(anecdote.source_url);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!profilConfigure) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Bienvenue sur Anecto</Text>
        <Text style={styles.emptyText}>
          Choisis ta ville et l'heure à laquelle tu veux recevoir ton anecdote quotidienne.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Réglages')}>
          <Text style={styles.ctaText}>Configurer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!anecdote) {
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTodayAnecdote(); }} />
        }
      >
        {/* Deux situations très différentes derrière un même écran vide : une
            ville épuisée revient demain, une ville non couverte ne reviendra
            jamais. L'ancien « reviens plus tard » promettait la première à
            tout le monde, y compris à ceux pour qui c'était faux. */}
        <Text style={styles.emptyTitle}>Rien à lire aujourd'hui</Text>
        <Text style={styles.emptyText}>
          Tu as lu toutes les anecdotes disponibles pour ta ville. D'autres
          arrivent — et tu peux dès maintenant suivre une autre ville.
        </Text>
        <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Réglages')}>
          <Text style={styles.ctaText}>Changer de ville</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const question =
    saisie === 'propose'
      ? 'Quelle anecdote connais-tu sur ta ville ?'
      : "Qu'est-ce qui manque ou est incorrect ?";

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // C'est UIKit qui réserve la place du clavier, pas nous.
      //
      // Un KeyboardAvoidingView calcule sa marge depuis le bas de sa propre
      // zone : dans un onglet, celle-ci s'arrête au-dessus de la barre de
      // navigation, et la marge obtenue est trop courte d'exactement la
      // hauteur de cette barre — le champ restait sous le clavier. Cette
      // propriété laisse le système ajuster l'encart de défilement, sans
      // rien mesurer côté React.
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      // Referme le clavier au glissement : sur un texte long, on veut souvent
      // relire l'anecdote pendant qu'on rédige sa correction.
      keyboardDismissMode="interactive"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTodayAnecdote(); }} />
      }
    >
      {/* La série se lit avant l'anecdote : c'est ce qu'on vient vérifier en
          ouvrant l'app, plus encore que le texte du jour. Discrète malgré
          tout — Anecto est un rituel de lecture, pas un tableau de bord. */}
      {!!stats && (stats.serie > 0 || stats.total_lues > 0) && (
        <View style={styles.serieBloc}>
          <View style={styles.serieRow}>
            <Text style={[styles.serie, stats.serie === 0 && styles.serieCassee]}>
              {libelleSerie(stats)}
            </Text>
            {stats.serie > 0 && stats.record > stats.serie && (
              <Text style={styles.record}>record {stats.record}</Text>
            )}
          </View>

          {/* La relance n'existe que s'il reste quelque chose à rattraper.
              Sans retard, l'écran est exactement celui d'avant. */}
          {stats.non_lues > 0 ? (
            <TouchableOpacity
              style={styles.relance}
              accessibilityRole="button"
              onPress={ouvrirNonLues}
            >
              <Text style={styles.relanceTexte}>
                {stats.non_lues} anecdote{stats.non_lues > 1 ? 's' : ''} t'attend
                {stats.non_lues > 1 ? 'ent' : ''}
              </Text>
              <Text style={styles.relanceChevron}>›</Text>
            </TouchableOpacity>
          ) : (
            stats.total_lues > 0 && (
              <Text style={styles.ajour}>
                <Text style={styles.ajourFort}>
                  {stats.total_lues} anecdote{stats.total_lues > 1 ? 's' : ''} lue
                  {stats.total_lues > 1 ? 's' : ''}
                </Text>
                , aucune oubliée.
              </Text>
            )
          )}
        </View>
      )}

      <Text style={styles.eyebrow}>
        📖 Anecdote du jour · {anecdote.city}
        {anecdote.period ? ` · ${anecdote.period}` : ''}
      </Text>
      {/* L'accroche porte le titre à l'écran. `title` reste l'étiquette courte
          de la notification — les anecdotes générées avant l'accroche n'en ont
          pas, d'où le repli. */}
      <Text style={styles.title}>{anecdote.hook || anecdote.title}</Text>
      <Text style={styles.body} textBreakStrategy="highQuality">
        {anecdote.body}
      </Text>

      {/* La source cliquable est ce qui rend « vérifiée » contrôlable par le
          lecteur, au lieu d'être une promesse à croire sur parole. */}
      {anecdote.source_url ? (
        <TouchableOpacity onPress={ouvrirSource} accessibilityRole="link">
          <Text style={styles.sourceLink}>Source : {anecdote.source} ↗</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.source}>Source : {anecdote.source}</Text>
      )}

      {!feedbackGiven && !saisie && (
        <View style={styles.feedbackBlock}>
          <Text style={styles.feedbackQuestion}>Comment trouvez-vous cette anecdote ?</Text>
          <View style={styles.feedbackRow}>
            <TouchableOpacity style={styles.feedbackBtn} onPress={() => submitFeedback('adore')}>
              <Text style={styles.feedbackBtnText}>😍 J'adore</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.feedbackBtn} onPress={() => setSaisie('incomplete')}>
              <Text style={styles.feedbackBtnText}>✏️ Incomplète</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.feedbackBtn} onPress={() => setSaisie('propose')}>
              <Text style={styles.feedbackBtnText}>💡 Proposer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {saisie && (
        <View style={styles.feedbackBlock}>
          <Text style={styles.feedbackQuestion}>{question}</Text>
          <TextInput
            style={styles.input}
            multiline
            // Ouvre le clavier dès le choix du bouton : une frappe de moins,
            // et c'est ce qui déclenche la remontée du champ.
            autoFocus
            value={texteLibre}
            onChangeText={setTexteLibre}
            placeholder={
              saisie === 'propose'
                ? 'Raconte-la, avec sa source si tu la connais…'
                : 'Décris la correction…'
            }
          />
          <TouchableOpacity
            style={[styles.submitBtn, !texteLibre.trim() && styles.submitBtnDisabled]}
            disabled={!texteLibre.trim()}
            onPress={() => submitFeedback(saisie, texteLibre)}
          >
            <Text style={styles.submitBtnText}>Envoyer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSaisie(null)}>
            <Text style={styles.cancel}>Annuler</Text>
          </TouchableOpacity>
        </View>
      )}

      {feedbackGiven && <Text style={styles.thanksText}>Merci pour ton retour 🙌</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  serieBloc: { marginBottom: 14, alignItems: 'flex-start' },
  serieRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, alignSelf: 'stretch' },
  serie: { flex: 1, fontSize: 14, fontWeight: '700', color: '#b3402f' },
  // Une série cassée n'est pas une alerte : elle perd la couleur, pas la place.
  serieCassee: { color: '#888' },
  record: { fontSize: 12, color: '#aaa' },
  relance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fbeeeb',
  },
  relanceTexte: { fontSize: 13, fontWeight: '600', color: '#b3402f' },
  relanceChevron: { fontSize: 15, lineHeight: 15, color: '#b3402f' },
  // Un état permanent doit être discret : une ligne grise, pas un encadré.
  ajour: { marginTop: 8, fontSize: 13, color: '#888' },
  ajourFort: { color: '#1a1a1a', fontWeight: '600' },
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '600' },
  // Une accroche fait une à deux lignes de plus qu'un titre de quatre mots :
  // 24 points la faisaient déborder sur quatre lignes.
  title: { fontSize: 21, fontWeight: '700', lineHeight: 28, marginBottom: 18, color: '#1a1a1a' },
  // Le corps se lit maintenant sur plusieurs paragraphes : l'interligne compte.
  //
  // Justifié, comme un texte imprimé. Sur une colonne étroite, la justification
  // creuse des rivières de blanc si le moteur coupe les lignes au plus court :
  // `textBreakStrategy` en « highQuality » lui fait au contraire optimiser le
  // paragraphe entier. Sans ce réglage, Android justifie moins bien qu'il
  // n'aligne à gauche.
  body: {
    fontSize: 16,
    lineHeight: 26,
    color: '#333',
    textAlign: 'justify',
  },
  source: { fontSize: 12, color: '#999', marginTop: 16, fontStyle: 'italic' },
  sourceLink: { fontSize: 12, color: '#007AFF', marginTop: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#1a1a1a' },
  emptyText: { fontSize: 16, textAlign: 'center', color: '#666', lineHeight: 22 },
  cta: { backgroundColor: '#222', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10, marginTop: 24 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  feedbackBlock: { marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  feedbackQuestion: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  feedbackBtn: { flex: 1, backgroundColor: '#f2f2f2', padding: 12, borderRadius: 10, alignItems: 'center' },
  feedbackBtnText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#222', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  submitBtnDisabled: { backgroundColor: '#bbb' },
  submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#888', marginTop: 12, fontSize: 14 },
  thanksText: { marginTop: 24, textAlign: 'center', color: '#666' },
});
