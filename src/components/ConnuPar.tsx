import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { REPONSES_CONNU_PAR, ReponseConnuPar, repondreConnuPar } from '../lib/connuPar';
import { PRECISION_CONNU_PAR_MAX } from '../lib/precisionConnuPar';
import { t } from '../lib/textes';

type Props = { userId: string; onFerme: () => void };

/**
 * « Comment as-tu connu Anecto ? » : une question, une fois, facultative.
 * Un appui suffit pour les réponses fermées. « Autre » ouvre un champ libre,
 * lui aussi facultatif : on peut continuer sans rien écrire.
 */
export default function ConnuPar({ userId, onFerme }: Props) {
  const [autreOuvert, setAutreOuvert] = useState(false);
  const [precision, setPrecision] = useState('');
  const margeClavier = useMargeClavier();
  const { height } = useWindowDimensions();
  const defilement = useRef<ScrollView>(null);
  const champ = useRef<TextInput>(null);

  useEffect(() => {
    if (!autreOuvert) return;
    // Le modal glisse encore : un focus immédiat rate souvent sur Android.
    const id = setTimeout(() => {
      champ.current?.focus();
      defilement.current?.scrollToEnd({ animated: true });
    }, 300);
    return () => clearTimeout(id);
  }, [autreOuvert]);

  useEffect(() => {
    if (!autreOuvert || margeClavier === 0) return;
    const id = setTimeout(() => defilement.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [autreOuvert, margeClavier]);

  function fermer(reponse: ReponseConnuPar | null, texte = '') {
    repondreConnuPar(userId, reponse, texte);
    onFerme();
  }

  function choisir(reponse: ReponseConnuPar) {
    if (reponse === 'autre') {
      setAutreOuvert(true);
      return;
    }
    fermer(reponse);
  }

  // La feuille est collée en bas. Sur Android bord à bord la fenêtre ne
  // rétrécit pas quand le clavier s'ouvre (même constat que l'écran de
  // connexion) : on réserve nous-mêmes sa hauteur, iOS compris, pour que le
  // champ reste visible dans le modal.
  const maxHauteur = Math.max(280, Math.round(height * 0.92) - margeClavier);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => fermer(null)}>
      <View style={styles.fond}>
        <ScrollView
          ref={defilement}
          style={[styles.carte, { maxHeight: maxHauteur, marginBottom: margeClavier }]}
          contentContainerStyle={styles.contenu}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.titre}>{t('connuPar.titre')}</Text>
            <Text style={styles.sousTitre}>{t('connuPar.sousTitre')}</Text>
          {REPONSES_CONNU_PAR.map((r) => (
            <View key={r}>
              <TouchableOpacity
                style={[styles.choix, r === 'autre' && autreOuvert && styles.choixChoisi]}
                accessibilityRole="button"
                accessibilityState={r === 'autre' ? { selected: autreOuvert } : undefined}
                onPress={() => choisir(r)}
              >
                <Text style={styles.choixTexte}>{t(`connuPar.${r}`)}</Text>
              </TouchableOpacity>
              {r === 'autre' && autreOuvert && (
                <View>
                  <Text style={styles.precisionLabel}>{t('connuPar.precision')}</Text>
                  <Text style={styles.precisionAide}>{t('connuPar.precisionAide')}</Text>
                  <TextInput
                    ref={champ}
                    style={styles.champ}
                    value={precision}
                    onChangeText={setPrecision}
                    placeholder={t('connuPar.precisionPlaceholder')}
                    placeholderTextColor="#999"
                    maxLength={PRECISION_CONNU_PAR_MAX}
                    autoCapitalize="sentences"
                    autoCorrect
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => fermer('autre', precision)}
                  />
                  <TouchableOpacity
                    style={styles.continuer}
                    accessibilityRole="button"
                    onPress={() => fermer('autre', precision)}
                  >
                    <Text style={styles.continuerTexte}>{t('connuPar.continuer')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.passer} accessibilityRole="button" onPress={() => fermer(null)}>
            <Text style={styles.passerTexte}>{t('connuPar.passer')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Hauteur du clavier, pour remonter la feuille. `keyboardWill*` sur iOS suit
 * l'animation ; Android n'émet que `keyboardDid*`.
 */
function useMargeClavier(): number {
  const [marge, setMarge] = useState(0);

  useEffect(() => {
    const montrer = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const cacher = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const affiche = Keyboard.addListener(montrer, (e) => {
      setMarge(e.endCoordinates?.height > 0 ? e.endCoordinates.height : 0);
    });
    const cache = Keyboard.addListener(cacher, () => setMarge(0));
    return () => {
      affiche.remove();
      cache.remove();
    };
  }, []);

  return marge;
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  carte: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
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
  choixChoisi: { backgroundColor: '#e2e2e2' },
  choixTexte: { fontSize: 18, fontWeight: '600', color: '#1a1a1a', textAlign: 'center' },
  precisionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 16,
  },
  precisionAide: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4 },
  champ: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    color: '#1a1a1a',
    marginTop: 10,
    backgroundColor: '#fff',
  },
  continuer: {
    backgroundColor: '#222',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  continuerTexte: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center' },
  passer: { paddingVertical: 16, marginTop: 6, alignItems: 'center' },
  passerTexte: { fontSize: 17, color: '#666', fontWeight: '600' },
});
