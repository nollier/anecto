import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { newSessionToken, searchCities } from '../lib/places';
import { demanderVille } from '../lib/villes';
import { CitySuggestion } from '../types';

interface Props {
  visible: boolean;
  /** Ce que la personne a tapé et qu'on n'a pas trouvé au catalogue. */
  saisie: string;
  onClose: () => void;
  onDemandee: () => void;
}

/**
 * Demande d'ouverture d'une ville absente du catalogue.
 *
 * C'est le seul endroit de l'app qui interroge encore Google Places. Il le
 * faut : une demande doit porter un identifiant de lieu, sans quoi « Saint-Malo »
 * saisi par trois personnes donnerait trois demandes qu'on ne saurait pas
 * rapprocher, ni relier aux anecdotes produites ensuite.
 */
export default function DemandeVille({ visible, saisie, onClose, onDemandee }: Props) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmee, setConfirmee] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Chaque ouverture repart à zéro : rouvrir après une demande ne doit pas
    // rejouer l'écran de confirmation de la précédente.
    setSuggestions([]);
    setErreur(null);
    setConfirmee(null);

    let annule = false;

    (async () => {
      setChargement(true);
      try {
        const { data } = await supabase.auth.getUser();
        if (!annule) setEmail(data.user?.email ?? null);

        const trouvees = await searchCities(saisie, newSessionToken());
        if (!annule) setSuggestions(trouvees);
      } catch (err) {
        if (!annule) setErreur(err instanceof Error ? err.message : 'Recherche indisponible.');
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => {
      annule = true;
    };
  }, [visible, saisie]);

  async function envoyer(suggestion: CitySuggestion) {
    setEnvoi(true);
    setErreur(null);
    try {
      await demanderVille(suggestion);
      setConfirmee(suggestion.name);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "La demande n'a pas abouti.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.page}>
        <View style={styles.barre}>
          <TouchableOpacity onPress={confirmee ? onDemandee : onClose} accessibilityRole="button">
            <Text style={styles.fermer}>{confirmee ? 'Terminé' : 'Annuler'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.contenu}>
          {confirmee ? (
            <View style={styles.bloc}>
              <Text style={styles.confirmeTitre}>C'est noté</Text>
              <Text style={styles.texte}>
                {confirmee} rejoindra Anecto prochainement.
                {email ? ` On te préviendra à ${email} dès que ses anecdotes seront prêtes.` : ''}
              </Text>
              <Text style={styles.aide}>
                En attendant, choisis une ville du catalogue : l'anecdote quotidienne
                fonctionne dès aujourd'hui, et tu changeras de ville en deux touches.
              </Text>
              <TouchableOpacity style={styles.principal} onPress={onDemandee} accessibilityRole="button">
                <Text style={styles.principalTexte}>Voir les villes disponibles</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.bloc}>
              <Text style={styles.titre}>Quelle ville exactement ?</Text>
              <Text style={styles.aide}>
                Choisis la bonne commune pour qu'on ne se trompe pas de « {saisie} ».
              </Text>

              {chargement && <ActivityIndicator style={styles.attente} />}

              {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}

              {!chargement && !erreur && suggestions.length === 0 && (
                <Text style={styles.texte}>
                  Aucune commune ne correspond à « {saisie} ». Vérifie l'orthographe,
                  puis réessaie.
                </Text>
              )}

              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.placeId}
                  style={styles.suggestion}
                  disabled={envoi}
                  accessibilityRole="button"
                  onPress={() => envoyer(s)}
                >
                  <Text style={styles.suggestionNom}>{s.name}</Text>
                  {!!s.secondary && (
                    <Text style={styles.suggestionSecondaire} numberOfLines={1}>
                      {s.secondary}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}

              {envoi && <ActivityIndicator style={styles.attente} />}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  barre: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  fermer: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  contenu: { padding: 20, paddingBottom: 48 },
  bloc: { gap: 14 },
  titre: { fontSize: 24, fontWeight: '700', color: '#1a1a1a' },
  confirmeTitre: { fontSize: 26, fontWeight: '700', color: '#b3402f' },
  texte: { fontSize: 16, lineHeight: 24, color: '#333' },
  aide: { fontSize: 14, lineHeight: 21, color: '#888' },
  attente: { marginTop: 12 },
  erreur: { fontSize: 14, color: '#b3402f' },
  suggestion: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  suggestionNom: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  suggestionSecondaire: { fontSize: 13, color: '#888', marginTop: 2 },
  principal: {
    backgroundColor: '#222',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  principalTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
