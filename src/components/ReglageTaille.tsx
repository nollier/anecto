import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTORISER_POLICE_SYSTEME,
  CLE_TAILLE_LECTURE,
  PALIERS,
  agrandir as palierSuivant,
  indiceDepuisStockage,
  peutAgrandir,
  peutReduire,
  reduire as palierPrecedent,
} from '../lib/tailleLecture';

type Valeur = {
  indice: number;
  reduire: () => void;
  agrandir: () => void;
};

const Contexte = createContext<Valeur | null>(null);

// Les écritures s'enchaînent : deux appuis rapides ne doivent pas laisser
// l'ancienne valeur écraser la nouvelle si la première requête finit après.
let ecriture: Promise<void> = Promise.resolve();

function memoriser(indice: number) {
  const valeur = String(indice);
  ecriture = ecriture
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(CLE_TAILLE_LECTURE, valeur))
    .catch(() => {
      // Sans stockage, le choix tient jusqu'à la fermeture de l'app.
    });
}

/**
 * Charge le palier avant d'afficher l'app : le texte s'ouvre directement
 * à la taille choisie, sans un saut de la taille par défaut vers la grande.
 */
export function TailleLectureProvider({ children }: { children: React.ReactNode }) {
  const [indice, setIndice] = useState<number | null>(null);
  const indiceRef = useRef(0);

  useEffect(() => {
    let actif = true;
    AsyncStorage.getItem(CLE_TAILLE_LECTURE)
      .then((brut) => {
        if (!actif) return;
        const lu = indiceDepuisStockage(brut);
        indiceRef.current = lu;
        setIndice(lu);
      })
      .catch(() => {
        if (!actif) return;
        indiceRef.current = 0;
        setIndice(0);
      });
    return () => {
      actif = false;
    };
  }, []);

  if (indice === null) {
    return (
      <View style={styles.attente}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  function appliquer(calcul: (actuel: number) => number) {
    const suivant = calcul(indiceRef.current);
    indiceRef.current = suivant;
    setIndice(suivant);
    memoriser(suivant);
  }

  const valeur: Valeur = {
    indice,
    reduire: () => appliquer(palierPrecedent),
    agrandir: () => appliquer(palierSuivant),
  };

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useTailleLecture(): Valeur {
  const ctx = useContext(Contexte);
  if (!ctx) {
    throw new Error('useTailleLecture doit être utilisé dans TailleLectureProvider');
  }
  return ctx;
}

/**
 * A- et A+, au-dessus du texte. Discrets, mais avec une zone de tap large :
 * on voit tout de suite que la lecture peut grossir, sans ouvrir les
 * réglages du téléphone. Désactivés aux deux bouts de l'échelle.
 */
export default function ReglageTaille() {
  const { indice, reduire, agrandir } = useTailleLecture();
  const moinsActif = peutReduire(indice);
  const plusActif = peutAgrandir(indice);

  return (
    <View style={styles.rang}>
      <TouchableOpacity
        style={[styles.bouton, !moinsActif && styles.inactif]}
        accessibilityRole="button"
        accessibilityLabel="Réduire la taille du texte"
        accessibilityState={{ disabled: !moinsActif }}
        accessibilityHint={moinsActif ? `Taille ${indice + 1} sur ${PALIERS.length}` : 'Taille minimale'}
        disabled={!moinsActif}
        onPress={reduire}
      >
        <Text
          style={[styles.lettre, !moinsActif && styles.lettreInactive]}
          allowFontScaling={AUTORISER_POLICE_SYSTEME}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          A-
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.bouton, !plusActif && styles.inactif]}
        accessibilityRole="button"
        accessibilityLabel="Agrandir la taille du texte"
        accessibilityState={{ disabled: !plusActif }}
        accessibilityHint={plusActif ? `Taille ${indice + 1} sur ${PALIERS.length}` : 'Taille maximale'}
        disabled={!plusActif}
        onPress={agrandir}
      >
        <Text
          style={[styles.lettre, !plusActif && styles.lettreInactive]}
          allowFontScaling={AUTORISER_POLICE_SYSTEME}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          A+
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  attente: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  rang: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  // 48 pt : au-dessus du minimum de 44, et le bouton grandit encore avec
  // la police système grâce au padding, sans hauteur figée.
  bouton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f3f1ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactif: { backgroundColor: '#f6f6f6' },
  lettre: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  lettreInactive: { color: '#c4c4c4' },
});
