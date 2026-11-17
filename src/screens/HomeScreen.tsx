import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Platform,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import AvisAnecdote from '../components/AvisAnecdote';
import PartageAnecdote from '../components/PartageAnecdote';
import { Anecdote, Statistiques, Voisinage } from '../types';
import { chargerVoisinage, libelleVoisine, proposerVoisines, repondreVoisines } from '../lib/voisinage';
import DemandeNotifications from '../components/DemandeNotifications';
import { doitProposerNotifications } from '../lib/demandeNotifications';
import { attendreQuestionConnuPar } from '../lib/connuPar';
import { QuestionQuiz, ResultatQuiz, PartageResultatQuiz } from '../components/Quiz';
import { EtatQuiz, chargerEtatQuiz, passerQuiz, repondreQuiz } from '../lib/quiz';
import { noter } from '../lib/mesure';
import { t } from '../lib/textes';
import {
  AUTORISER_POLICE_SYSTEME,
  PADDING_LECTURE,
  mesureCorps,
  mesureTitre,
  texteDuTitre,
} from '../lib/tailleLecture';
import ReglageTaille, { useTailleLecture } from '../components/ReglageTaille';

/** Les trois voisines les plus proches, en toutes lettres : « Ciboure, Urrugne et Guéthary ». */
function nommerVoisines(v: Voisinage): string {
  const noms = v.voisines.slice(0, 3).map((x) => x.ville);
  if (noms.length === 0) return 'les villes à moins de 30 km';
  if (noms.length === 1) return noms[0];
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

/**
 * L'accord pour les villes voisines, demandé une fois pour toutes quand le
 * lecteur arrive au bout de sa ville. Sa ville reste prioritaire : une
 * voisine n'est servie que les jours où il n'y a rien de neuf chez lui.
 */
function CarteVoisines({
  voisinage,
  onRepondre,
}: {
  voisinage: Voisinage;
  onRepondre: (accepte: boolean) => void;
}) {
  const reste = voisinage.restantes;
  return (
    <View style={styles.voisinesCarte}>
      <Text style={styles.voisinesTitre}>
        {reste === 0
          ? `Tu as tout lu sur ${voisinage.ville}`
          : `Bientôt au bout de ${voisinage.ville}`}
      </Text>
      <Text style={styles.voisinesTexte}>
        {reste > 0
          ? `Il te reste ${reste} anecdote${reste > 1 ? 's' : ''} à découvrir. `
          : ''}
        Ensuite, veux-tu des anecdotes de {nommerVoisines(voisinage)}, à moins de 30 km ?
        {' '}{voisinage.ville} restera toujours prioritaire.
      </Text>
      <View style={styles.voisinesBoutons}>
        <TouchableOpacity
          style={styles.voisinesOui}
          accessibilityRole="button"
          onPress={() => onRepondre(true)}
        >
          <Text style={styles.voisinesOuiTexte}>Oui, élargir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.voisinesNon}
          accessibilityRole="button"
          onPress={() => onRepondre(false)}
        >
          <Text style={styles.voisinesNonTexte}>Non merci</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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

/** Temps passé sur une anecdote affichée en entier, sans défilement, pour la tenir pour lue. */
const DUREE_LECTURE_SANS_DEFILEMENT_MS = 20_000;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { indice } = useTailleLecture();
  const [anecdote, setAnecdote] = useState<Anecdote | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profilConfigure, setProfilConfigure] = useState(true);
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [voisinage, setVoisinage] = useState<Voisinage | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [demandeNotif, setDemandeNotif] = useState(false);
  const [quiz, setQuiz] = useState<EtatQuiz>({ phase: 'aucun' });
  // Bas de la source dans le contenu défilant : l'atteindre, c'est avoir lu
  // l'anecdote en entier.
  const finDuTexte = useRef<number | null>(null);
  const luEnEntier = useRef<string | null>(null);
  // Hauteur visible de l'écran défilant : si la source y tient déjà, il n'y
  // aura pas de défilement pour constater la lecture.
  const hauteurVisible = useRef<number | null>(null);
  const minuterieLecture = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function lectureComplete() {
    if (!anecdote || !userId || quiz.phase === 'question' || luEnEntier.current === anecdote.id) return;
    luEnEntier.current = anecdote.id;
    // Jamais par-dessus « Comment as-tu connu Anecto ? ».
    await attendreQuestionConnuPar();
    if (await doitProposerNotifications(userId)) setDemandeNotif(true);
  }

  function annulerMinuterieLecture() {
    if (minuterieLecture.current) clearTimeout(minuterieLecture.current);
    minuterieLecture.current = null;
  }

  /**
   * Anecdote entièrement visible sans défilement (grand écran, texte court) :
   * aucun `onScroll` ne viendra. On considère alors l'anecdote lue après un
   * temps de lecture raisonnable passé sur l'écran, et non dès l'affichage,
   * pour ne pas solliciter quelqu'un qui n'a encore rien lu.
   */
  function verifierSourceVisible() {
    if (minuterieLecture.current || !anecdote || luEnEntier.current === anecdote.id) return;
    if (quiz.phase === 'question') return;
    if (finDuTexte.current === null || hauteurVisible.current === null) return;
    if (finDuTexte.current > hauteurVisible.current) return;
    minuterieLecture.current = setTimeout(() => {
      minuterieLecture.current = null;
      lectureComplete();
    }, DUREE_LECTURE_SANS_DEFILEMENT_MS);
  }

  // Changer d'anecdote, passer au quiz ou quitter l'onglet arrête l'attente.
  useEffect(() => annulerMinuterieLecture, [anecdote?.id, quiz.phase]);
  useFocusEffect(useCallback(() => annulerMinuterieLecture, []));

  function surDefilement(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    if (finDuTexte.current !== null && contentOffset.y + layoutMeasurement.height >= finDuTexte.current) {
      lectureComplete();
    }
  }

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
    setUserId(userData.user.id);

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

    // Le quiz se décide avant d'afficher quoi que ce soit : sans ça, le texte
    // apparaîtrait une fraction de seconde avant la question qui le précède.
    const etatQuiz = dujour ? await chargerEtatQuiz(dujour, userData.user.id) : { phase: 'aucun' as const };
    if (etatQuiz.phase === 'question') {
      finDuTexte.current = null;
      noter('quiz_affiche', { anecdote_id: dujour!.id });
    }
    setQuiz(etatQuiz);
    setAnecdote(dujour);

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

    // Après l'anecdote du jour : celle qu'on vient de servir ne compte plus
    // dans ce qu'il reste à lire.
    setVoisinage(await chargerVoisinage());

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

  async function repondre(accepte: boolean) {
    try {
      await repondreVoisines(accepte);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "La réponse n'a pas été enregistrée.");
      return;
    }
    // Une voisine a peut-être déjà de quoi lire : on recharge tout de suite.
    setLoading(true);
    await loadTodayAnecdote();
  }

  async function repondreAuQuiz(reponse: boolean) {
    if (!anecdote) return;
    const resultat = await repondreQuiz(anecdote, reponse);
    if (!resultat) {
      Alert.alert(t('quiz.erreur'));
      setQuiz({ phase: 'aucun' });
      return;
    }
    setQuiz({ phase: 'resultat', juste: resultat.juste, scores: resultat.scores });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function passerLeQuiz() {
    if (!anecdote) return;
    passerQuiz(anecdote);
    setQuiz({ phase: 'aucun' });
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
        {proposerVoisines(voisinage) ? (
          <CarteVoisines voisinage={voisinage!} onRepondre={repondre} />
        ) : (
          <>
            <Text style={styles.emptyTitle}>Rien à lire aujourd'hui</Text>
            <Text style={styles.emptyText}>
              {voisinage?.accepte
                ? `Tu as lu toutes les anecdotes de ${voisinage.ville} et de ses voisines. D'autres sont en préparation : reviens demain.`
                : "Tu as lu toutes les anecdotes disponibles pour ta ville. D'autres arrivent — et tu peux dès maintenant suivre une autre ville."}
            </Text>
            <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Réglages')}>
              <Text style={styles.ctaText}>Changer de ville</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

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
      onScroll={surDefilement}
      scrollEventThrottle={250}
      onLayout={(e: LayoutChangeEvent) => {
        hauteurVisible.current = e.nativeEvent.layout.height;
        verifierSourceVisible();
      }}
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

      {/* L'accord se demande en haut, mais sous la série : il ne doit pas
          passer avant ce qu'on vient chercher en ouvrant l'app. */}
      {proposerVoisines(voisinage) && <CarteVoisines voisinage={voisinage!} onRepondre={repondre} />}

      {/* Une anecdote d'une voisine le dit avant tout le reste : le lecteur
          sait toujours où il est. */}
      {!!libelleVoisine(anecdote, voisinage) && (
        <Text style={styles.voisineLibelle}>📍 {libelleVoisine(anecdote, voisinage)}</Text>
      )}

      {/* A- / A+ restent au-dessus du quiz comme du texte : le lecteur les
          voit tout de suite, et ils ne sautent pas quand la question se termine. */}
      <ReglageTaille />

      {/* Le quiz, quand il y en a un, passe avant le texte : l'anecdote donne
          ensuite l'explication. */}
      {quiz.phase === 'question' ? (
        <QuestionQuiz anecdote={anecdote} onRepondre={repondreAuQuiz} onPasser={passerLeQuiz} />
      ) : (
      <>
      {quiz.phase === 'resultat' && (
        <ResultatQuiz anecdote={anecdote} juste={quiz.juste} scores={quiz.scores} />
      )}

      <Text style={styles.eyebrow}>
        📖 Anecdote du jour · {anecdote.city}
        {anecdote.period ? ` · ${anecdote.period}` : ''}
      </Text>
      {/* L'accroche porte le titre à l'écran. `title` reste l'étiquette courte
          de la notification — les anecdotes générées avant l'accroche n'en ont
          pas, d'où le repli. Les deux suivent le même palier. */}
      <Text
        style={[styles.title, mesureTitre(indice)]}
        allowFontScaling={AUTORISER_POLICE_SYSTEME}
      >
        {texteDuTitre(anecdote)}
      </Text>
      <Text
        style={[styles.body, mesureCorps(indice)]}
        allowFontScaling={AUTORISER_POLICE_SYSTEME}
        textBreakStrategy="highQuality"
      >
        {anecdote.body}
      </Text>

      {/* La source cliquable est ce qui rend « vérifiée » contrôlable par le
          lecteur, au lieu d'être une promesse à croire sur parole. */}
      <View onLayout={(e: LayoutChangeEvent) => {
        finDuTexte.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
        verifierSourceVisible();
      }}>
        {anecdote.source_url ? (
          <TouchableOpacity onPress={ouvrirSource} accessibilityRole="link">
            <Text style={styles.sourceLink}>Source : {anecdote.source} ↗</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.source}>Source : {anecdote.source}</Text>
        )}
      </View>

      {/* Le partage vient après la source, jamais avant : ce qu'on transmet à
          un proche, c'est l'anecdote et sa preuve, dans cet ordre. */}
      {quiz.phase === 'resultat' && <PartageResultatQuiz anecdote={anecdote} juste={quiz.juste} />}

      <PartageAnecdote anecdote={anecdote} />

      {/* Le vote n'est pas réservé au jour de l'envoi : le même bloc sert à
          la relecture depuis l'historique, et n'apparaît que si rien n'a
          encore été dit sur cette anecdote. */}
      <AvisAnecdote anecdote={anecdote} scrollRef={scrollRef} />
      </>
      )}

      {demandeNotif && userId && (
        <DemandeNotifications
          userId={userId}
          ville={anecdote.city}
          onFerme={() => setDemandeNotif(false)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: PADDING_LECTURE, paddingTop: 60, paddingBottom: 40 },
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
  voisineLibelle: { fontSize: 13, color: '#b3402f', fontWeight: '700', marginBottom: 4 },
  voisinesCarte: {
    alignSelf: 'stretch',
    backgroundColor: '#faf6f2',
    borderLeftWidth: 3,
    borderLeftColor: '#b3402f',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  voisinesTitre: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  voisinesTexte: { fontSize: 14, color: '#444', lineHeight: 20 },
  voisinesBoutons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  voisinesOui: { backgroundColor: '#222', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  voisinesOuiTexte: { color: '#fff', fontSize: 14, fontWeight: '600' },
  voisinesNon: { paddingVertical: 10, paddingHorizontal: 12 },
  voisinesNonTexte: { color: '#666', fontSize: 14, fontWeight: '600' },
  // Taille et interligne viennent du palier de lecture (`mesureTitre`).
  title: { fontWeight: '700', marginBottom: 18, color: '#1a1a1a' },
  // Justifié, comme un texte imprimé. Sur une colonne étroite, la justification
  // creuse des rivières de blanc si le moteur coupe les lignes au plus court :
  // `textBreakStrategy` en « highQuality » lui fait au contraire optimiser le
  // paragraphe entier. Sans ce réglage, Android justifie moins bien qu'il
  // n'aligne à gauche. L'interligne suit le palier (`mesureCorps`).
  body: {
    color: '#333',
    textAlign: 'justify',
  },
  source: { fontSize: 12, color: '#999', marginTop: 16, fontStyle: 'italic' },
  sourceLink: { fontSize: 12, color: '#007AFF', marginTop: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#1a1a1a' },
  emptyText: { fontSize: 16, textAlign: 'center', color: '#666', lineHeight: 22 },
  cta: { backgroundColor: '#222', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10, marginTop: 24 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
