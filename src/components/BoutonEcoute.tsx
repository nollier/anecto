import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { PAUSE_POSSIBLE, useLectureVocale } from '../lib/voix';
import { Anecdote } from '../types';

/**
 * La pastille d'écoute, posée sur le bandeau de ville.
 *
 * Ronde et sans libellé : elle se glisse au bout d'une ligne qui existe déjà,
 * et l'anecdote commence exactement à la même hauteur qu'avant. Anecto reste
 * une app de lecture — l'écoute s'offre, elle ne s'impose pas.
 */
export default function BoutonEcoute({ anecdote }: { anecdote: Anecdote }) {
  const { etat, disponible, basculer } = useLectureVocale(anecdote);

  // Un bouton absent laisserait croire à un bug, et un bouton muet est pire :
  // il reste, grisé, et dit ce qui manque quand on appuie dessus.
  function expliquerAbsence() {
    Alert.alert(
      'Aucune voix française',
      "Ce téléphone n'a pas de voix française installée. Ajoute-la depuis les réglages de synthèse vocale, puis reviens."
    );
  }

  const enLecture = etat === 'lecture';

  const signe = enLecture ? (PAUSE_POSSIBLE ? '❚❚' : '■') : '▶';
  const description = enLecture
    ? PAUSE_POSSIBLE
      ? 'Mettre la lecture en pause'
      : 'Arrêter la lecture'
    : etat === 'pause'
      ? 'Reprendre la lecture'
      : "Écouter l'anecdote";

  return (
    <TouchableOpacity
      style={[styles.pastille, enLecture && styles.pastilleActive, !disponible && styles.pastilleEteinte]}
      accessibilityRole="button"
      accessibilityLabel={description}
      onPress={disponible ? basculer : expliquerAbsence}
    >
      <Text style={[styles.signe, enLecture && styles.signeActif, !disponible && styles.signeEteint]}>
        {signe}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pastille: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fbeeeb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // En lecture, la pastille se remplit : c'est le seul repère qui dit que le
  // son vient de là, sur un écran par ailleurs identique.
  pastilleActive: { backgroundColor: '#b3402f' },
  pastilleEteinte: { backgroundColor: '#f2f2f2' },
  // Le triangle de lecture penche à droite : un décalage optique le recentre.
  signe: { fontSize: 12, color: '#b3402f', marginLeft: 2 },
  signeActif: { color: '#fff', marginLeft: 0 },
  signeEteint: { color: '#9a9a9a' },
});
