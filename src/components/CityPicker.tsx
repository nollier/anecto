import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { filtrerVilles, villesCouvertes } from '../lib/villes';
import { VilleCouverte } from '../types';
import DemandeVille from './DemandeVille';

interface Props {
  value: VilleCouverte | null;
  onChange: (ville: VilleCouverte | null) => void;
}

/**
 * Choix de la ville dans le catalogue de ce qu'Anecto sait servir.
 *
 * Avant, la recherche interrogeait Google Places : on pouvait donc choisir
 * n'importe quelle commune du monde, et se retrouver devant un écran vide.
 * Le catalogue vient maintenant de la base, et une ville absente ouvre une
 * demande plutôt qu'une impasse.
 */
export default function CityPicker({ value, onChange }: Props) {
  const [catalogue, setCatalogue] = useState<VilleCouverte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [demandeOuverte, setDemandeOuverte] = useState(false);

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      setCatalogue(await villesCouvertes());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }

  const resultats = useMemo(() => filtrerVilles(catalogue, saisie), [catalogue, saisie]);
  const recherche = saisie.trim();
  const aucunResultat = !chargement && recherche.length > 0 && resultats.length === 0;

  if (value) {
    return (
      <View style={styles.selected}>
        <Text style={styles.selectedName}>{value.ville}</Text>
        <TouchableOpacity onPress={() => onChange(null)} accessibilityRole="button">
          <Text style={styles.change}>Changer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (chargement) {
    return (
      <View style={styles.chargement}>
        <ActivityIndicator />
      </View>
    );
  }

  if (erreur) {
    return (
      <View>
        <Text style={styles.erreur}>{erreur}</Text>
        <TouchableOpacity style={styles.secondaire} onPress={charger}>
          <Text style={styles.secondaireTexte}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        value={saisie}
        onChangeText={setSaisie}
        placeholder="Cherche ta ville"
        autoCorrect={false}
        autoCapitalize="words"
        clearButtonMode="while-editing"
      />

      {/* Le catalogue s'affiche d'emblée, saisie vide : on voit ce qui existe
          avant même de chercher, plutôt qu'un champ muet. */}
      {resultats.length > 0 && (
        <View style={styles.liste}>
          {resultats.map((v) => (
            <TouchableOpacity
              key={v.place_id}
              style={styles.ligne}
              accessibilityRole="button"
              onPress={() => {
                setSaisie('');
                onChange(v);
              }}
            >
              <Text style={styles.ligneNom}>{v.ville}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* L'échec de la recherche est le seul endroit où l'utilisateur a besoin
          d'aide. Le bouton y est plein, nomme sa ville, et annonce ce qui va
          se passer — un lien discret laisserait croire à une impasse. */}
      {aucunResultat && (
        <View style={styles.absente}>
          <Text style={styles.absenteTitre}>
            Anecto ne couvre pas encore « {recherche} ».
          </Text>
          <TouchableOpacity
            style={styles.demanderBtn}
            accessibilityRole="button"
            onPress={() => setDemandeOuverte(true)}
          >
            <Text style={styles.demanderBtnTexte}>Demander l'ajout de {recherche}</Text>
          </TouchableOpacity>
          <Text style={styles.absenteAide}>
            On te préviendra par e-mail dès que ses anecdotes seront prêtes.
          </Text>
        </View>
      )}

      <DemandeVille
        visible={demandeOuverte}
        saisie={recherche}
        onClose={() => setDemandeOuverte(false)}
        onDemandee={() => {
          setDemandeOuverte(false);
          setSaisie('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chargement: { paddingVertical: 24, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 },
  liste: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  ligne: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  ligneNom: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  selected: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  change: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  absente: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#faf5f4',
    borderWidth: 1,
    borderColor: '#f0dfdb',
    gap: 12,
  },
  absenteTitre: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  absenteAide: { fontSize: 13, color: '#8a7a76', lineHeight: 18 },
  demanderBtn: {
    backgroundColor: '#b3402f',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  demanderBtnTexte: { color: '#fff', fontSize: 15, fontWeight: '700' },
  erreur: { fontSize: 14, color: '#b3402f', marginBottom: 12 },
  secondaire: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  secondaireTexte: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
});
