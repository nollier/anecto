import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Anecdote, ScoresQuiz } from '../types';
import { t } from '../lib/textes';
import { texteResultat } from '../lib/quiz';
import { partagerMessage } from '../lib/partage';
import { monCodeParrainage } from '../lib/parrainage';
import {
  AUTORISER_POLICE_SYSTEME,
  ECART_BOUTONS_QUIZ,
  PADDING_HORIZONTAL_BOUTON_QUIZ,
  PADDING_LECTURE,
  TEXTES_QUIZ,
  empilerBoutonsQuiz,
} from '../lib/tailleLecture';

/**
 * La question, avant le texte de l'anecdote. Deux gros boutons, un lien
 * discret pour passer : tout se fait d'un appui.
 */
export function QuestionQuiz({
  anecdote,
  onRepondre,
  onPasser,
}: {
  anecdote: Anecdote;
  onRepondre: (reponse: boolean) => Promise<void>;
  onPasser: () => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  // « Vrai » et « Faux » passent l'un sous l'autre dès que la police système
  // les ferait déborder de la moitié d'écran.
  const empiler = empilerBoutonsQuiz(width - PADDING_LECTURE * 2, fontScale, [
    t('quiz.vrai'),
    t('quiz.faux'),
  ]);

  async function repondre(reponse: boolean) {
    if (enCours) return;
    setEnCours(true);
    await onRepondre(reponse);
    setEnCours(false);
  }

  return (
    <View style={styles.question}>
      <Text style={styles.etiquette} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {t('quiz.etiquette')}
      </Text>
      <Text style={styles.consigne} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {t('quiz.consigne', { ville: anecdote.city })}
      </Text>
      <Text style={styles.affirmation} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {anecdote.quiz_affirmation}
      </Text>

      {enCours ? (
        <ActivityIndicator size="large" style={styles.attente} />
      ) : (
        <View style={[styles.boutons, empiler && styles.boutonsEmpiles]}>
          <TouchableOpacity
            style={[styles.bouton, styles.vrai, empiler ? styles.boutonEmpile : styles.boutonRange]}
            accessibilityRole="button"
            onPress={() => repondre(true)}
          >
            <Text style={styles.boutonTexte} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
              {t('quiz.vrai')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bouton, styles.faux, empiler ? styles.boutonEmpile : styles.boutonRange]}
            accessibilityRole="button"
            onPress={() => repondre(false)}
          >
            <Text style={styles.boutonTexte} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
              {t('quiz.faux')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.passer} accessibilityRole="button" onPress={onPasser} disabled={enCours}>
        <Text style={styles.passerTexte} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
          {t('quiz.passer')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Le retour immédiat, au-dessus de l'anecdote qui donne l'explication. */
export function ResultatQuiz({
  anecdote,
  juste,
  scores,
}: {
  anecdote: Anecdote;
  juste: boolean;
  scores: ScoresQuiz | null;
}) {
  return (
    <View style={[styles.resultat, juste ? styles.resultatJuste : styles.resultatRate]}>
      <Text style={styles.resultatTitre} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {juste ? `✅ ${t('quiz.bienVu')}` : `❌ ${t('quiz.rate')}`}
      </Text>
      <Text style={styles.resultatAffirmation} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        « {anecdote.quiz_affirmation} »
      </Text>
      <Text style={styles.resultatTexte} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {t('quiz.laReponse', { reponse: anecdote.quiz_reponse ? 'vrai' : 'faux' })}
      </Text>
      {!!scores && scores.serie >= 2 && (
        <Text style={styles.resultatScore} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
          🔥 {t('quiz.serie', { serie: scores.serie })}
        </Text>
      )}
    </View>
  );
}

/** Après l'anecdote : partager son résultat, sans dévoiler la réponse. */
export function PartageResultatQuiz({ anecdote, juste }: { anecdote: Anecdote; juste: boolean }) {
  async function partager() {
    const code = await monCodeParrainage();
    await partagerMessage(texteResultat(anecdote.city, juste, code), 'quiz', {
      anecdote_id: anecdote.id,
      juste,
    });
  }

  return (
    <View style={styles.partage}>
      <Text style={styles.partageTitre} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
        {t('quiz.partagerTitre')}
      </Text>
      <TouchableOpacity style={styles.partageBouton} accessibilityRole="button" onPress={partager}>
        <Text style={styles.partageBoutonTexte} allowFontScaling={AUTORISER_POLICE_SYSTEME}>
          {t('quiz.partagerBouton')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  question: { paddingTop: 8 },
  etiquette: { ...TEXTES_QUIZ.etiquette, fontWeight: '700', color: '#b3402f', textTransform: 'uppercase', letterSpacing: 1 },
  consigne: { ...TEXTES_QUIZ.consigne, color: '#666', marginTop: 6 },
  affirmation: { ...TEXTES_QUIZ.affirmation, fontWeight: '700', color: '#1a1a1a', marginTop: 20 },
  attente: { marginVertical: 40 },
  boutons: { flexDirection: 'row', gap: ECART_BOUTONS_QUIZ, marginTop: 32 },
  boutonsEmpiles: { flexDirection: 'column' },
  bouton: {
    minHeight: 44,
    paddingVertical: 22,
    paddingHorizontal: PADDING_HORIZONTAL_BOUTON_QUIZ,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonRange: { flex: 1 },
  // En colonne, pas de flex: 1 : dans un défilement, il étirerait les boutons
  // sur toute la hauteur restante au lieu de les laisser à leur texte.
  boutonEmpile: { alignSelf: 'stretch' },
  vrai: { backgroundColor: '#2f7d4f' },
  faux: { backgroundColor: '#b3402f' },
  boutonTexte: { ...TEXTES_QUIZ.bouton, color: '#fff', fontWeight: '800', textAlign: 'center' },
  passer: { alignSelf: 'stretch', paddingVertical: 18, paddingHorizontal: 16, marginTop: 8, alignItems: 'center' },
  passerTexte: { ...TEXTES_QUIZ.passer, color: '#888', textDecorationLine: 'underline', textAlign: 'center' },
  resultat: { borderRadius: 14, padding: 18, marginBottom: 22 },
  resultatJuste: { backgroundColor: '#e8f4ec' },
  resultatRate: { backgroundColor: '#fbeeeb' },
  resultatTitre: { ...TEXTES_QUIZ.resultatTitre, fontWeight: '800', color: '#1a1a1a' },
  resultatAffirmation: { ...TEXTES_QUIZ.resultatAffirmation, color: '#333', fontStyle: 'italic', marginTop: 8 },
  resultatTexte: { ...TEXTES_QUIZ.resultatTexte, color: '#333', marginTop: 8 },
  resultatScore: { ...TEXTES_QUIZ.resultatScore, fontWeight: '700', color: '#b3402f', marginTop: 10 },
  partage: { marginTop: 28, padding: 18, borderRadius: 14, backgroundColor: '#faf6f2', alignItems: 'stretch' },
  partageTitre: { ...TEXTES_QUIZ.partageTitre, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  partageBouton: { backgroundColor: '#222', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  partageBoutonTexte: { ...TEXTES_QUIZ.partageBouton, color: '#fff', fontWeight: '700', textAlign: 'center' },
});
