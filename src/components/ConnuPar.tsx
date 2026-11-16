import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { REPONSES_CONNU_PAR, ReponseConnuPar, repondreConnuPar } from '../lib/connuPar';
import { t } from '../lib/textes';

type Props = { userId: string; onFerme: () => void };

/**
 * « Comment as-tu connu Anecto ? » : une question, une fois, facultative.
 * Un appui suffit : chaque réponse est un gros bouton, sans validation.
 */
export default function ConnuPar({ userId, onFerme }: Props) {
  function choisir(reponse: ReponseConnuPar | null) {
    repondreConnuPar(userId, reponse);
    onFerme();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => choisir(null)}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <ScrollView contentContainerStyle={styles.contenu}>
            <Text style={styles.titre}>{t('connuPar.titre')}</Text>
            <Text style={styles.sousTitre}>{t('connuPar.sousTitre')}</Text>
            {REPONSES_CONNU_PAR.map((r) => (
              <TouchableOpacity
                key={r}
                style={styles.choix}
                accessibilityRole="button"
                onPress={() => choisir(r)}
              >
                <Text style={styles.choixTexte}>{t(`connuPar.${r}`)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.passer} accessibilityRole="button" onPress={() => choisir(null)}>
              <Text style={styles.passerTexte}>{t('connuPar.passer')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  carte: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  contenu: { padding: 24, paddingBottom: 40 },
  titre: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  sousTitre: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 16, lineHeight: 22 },
  choix: {
    backgroundColor: '#f2f2f2',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginTop: 10,
  },
  choixTexte: { fontSize: 18, fontWeight: '600', color: '#1a1a1a', textAlign: 'center' },
  passer: { paddingVertical: 16, marginTop: 6, alignItems: 'center' },
  passerTexte: { fontSize: 17, color: '#666', fontWeight: '600' },
});
