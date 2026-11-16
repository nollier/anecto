import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Anecdote, ScoresQuiz } from '../types';
import { t } from '../lib/textes';
import { texteResultat } from '../lib/quiz';
import { partagerMessage } from '../lib/partage';
import { monCodeParrainage } from '../lib/parrainage';

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

  async function repondre(reponse: boolean) {
    if (enCours) return;
    setEnCours(true);
    await onRepondre(reponse);
    setEnCours(false);
  }

  return (
    <View style={styles.question}>
      <Text style={styles.etiquette}>{t('quiz.etiquette')}</Text>
      <Text style={styles.consigne}>{t('quiz.consigne', { ville: anecdote.city })}</Text>
      <Text style={styles.affirmation}>{anecdote.quiz_affirmation}</Text>

      {enCours ? (
        <ActivityIndicator size="large" style={styles.attente} />
      ) : (
        <View style={styles.boutons}>
          <TouchableOpacity
            style={[styles.bouton, styles.vrai]}
            accessibilityRole="button"
            onPress={() => repondre(true)}
          >
            <Text style={styles.boutonTexte}>{t('quiz.vrai')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bouton, styles.faux]}
            accessibilityRole="button"
            onPress={() => repondre(false)}
          >
            <Text style={styles.boutonTexte}>{t('quiz.faux')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.passer} accessibilityRole="button" onPress={onPasser} disabled={enCours}>
        <Text style={styles.passerTexte}>{t('quiz.passer')}</Text>
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
      <Text style={styles.resultatTitre}>{juste ? `✅ ${t('quiz.bienVu')}` : `❌ ${t('quiz.rate')}`}</Text>
      <Text style={styles.resultatAffirmation}>« {anecdote.quiz_affirmation} »</Text>
      <Text style={styles.resultatTexte}>
        {t('quiz.laReponse', { reponse: anecdote.quiz_reponse ? 'vrai' : 'faux' })}
      </Text>
      {!!scores && scores.serie >= 2 && (
        <Text style={styles.resultatScore}>🔥 {t('quiz.serie', { serie: scores.serie })}</Text>
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
      <Text style={styles.partageTitre}>{t('quiz.partagerTitre')}</Text>
      <TouchableOpacity style={styles.partageBouton} accessibilityRole="button" onPress={partager}>
        <Text style={styles.partageBoutonTexte}>{t('quiz.partagerBouton')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  question: { paddingTop: 8 },
  etiquette: { fontSize: 15, fontWeight: '700', color: '#b3402f', textTransform: 'uppercase', letterSpacing: 1 },
  consigne: { fontSize: 16, color: '#666', marginTop: 6, lineHeight: 22 },
  affirmation: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', lineHeight: 33, marginTop: 20 },
  attente: { marginVertical: 40 },
  boutons: { flexDirection: 'row', gap: 12, marginTop: 32 },
  bouton: { flex: 1, paddingVertical: 22, borderRadius: 14, alignItems: 'center' },
  vrai: { backgroundColor: '#2f7d4f' },
  faux: { backgroundColor: '#b3402f' },
  boutonTexte: { color: '#fff', fontSize: 22, fontWeight: '800' },
  passer: { alignSelf: 'center', paddingVertical: 18, paddingHorizontal: 16, marginTop: 8 },
  passerTexte: { fontSize: 15, color: '#888', textDecorationLine: 'underline' },
  resultat: { borderRadius: 14, padding: 18, marginBottom: 22 },
  resultatJuste: { backgroundColor: '#e8f4ec' },
  resultatRate: { backgroundColor: '#fbeeeb' },
  resultatTitre: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  resultatAffirmation: { fontSize: 16, color: '#333', fontStyle: 'italic', marginTop: 8, lineHeight: 23 },
  resultatTexte: { fontSize: 16, color: '#333', marginTop: 8, lineHeight: 23 },
  resultatScore: { fontSize: 15, fontWeight: '700', color: '#b3402f', marginTop: 10 },
  partage: { marginTop: 28, padding: 18, borderRadius: 14, backgroundColor: '#faf6f2', alignItems: 'stretch' },
  partageTitre: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  partageBouton: { backgroundColor: '#222', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  partageBoutonTexte: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
