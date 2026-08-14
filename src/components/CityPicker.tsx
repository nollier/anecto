import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getCityDetails, newSessionToken, searchCities } from '../lib/places';
import { CityDetails, CitySuggestion } from '../types';

const DEBOUNCE_MS = 300;

interface Props {
  value: CityDetails | null;
  onChange: (city: CityDetails | null) => void;
}

export default function CityPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Renouvelé après chaque sélection : une session Places = une saisie + un details.
  const sessionToken = useRef(newSessionToken());
  // Numéro de la dernière requête lancée, pour ignorer les réponses en retard.
  const requestId = useRef(0);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const current = ++requestId.current;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const results = await searchCities(query.trim(), sessionToken.current);
        if (current !== requestId.current) return;
        setSuggestions(results);
        setError(null);
      } catch {
        if (current !== requestId.current) return;
        setError('Recherche indisponible. Vérifie ta connexion.');
      } finally {
        if (current === requestId.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, value]);

  async function select(suggestion: CitySuggestion) {
    setResolving(true);
    setError(null);
    try {
      const city = await getCityDetails(suggestion.placeId, sessionToken.current);
      sessionToken.current = newSessionToken();
      requestId.current++;
      setSuggestions([]);
      setQuery('');
      onChange(city);
    } catch {
      setError("Impossible de sélectionner cette ville. Réessaie.");
    } finally {
      setResolving(false);
    }
  }

  function clear() {
    sessionToken.current = newSessionToken();
    requestId.current++;
    setSuggestions([]);
    setQuery('');
    setError(null);
    onChange(null);
  }

  if (value) {
    return (
      <View style={styles.selected}>
        <View style={styles.selectedText}>
          <Text style={styles.selectedName}>{value.name}</Text>
          <Text style={styles.selectedAddress} numberOfLines={1}>
            {value.formattedAddress}
          </Text>
        </View>
        <TouchableOpacity onPress={clear} accessibilityRole="button">
          <Text style={styles.change}>Changer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Ex : Saint-Malo"
          autoCorrect={false}
          autoCapitalize="words"
          editable={!resolving}
        />
        {(searching || resolving) && <ActivityIndicator style={styles.spinner} />}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.placeId}
              style={styles.row}
              onPress={() => select(suggestion)}
              disabled={resolving}
              accessibilityRole="button"
            >
              <Text style={styles.rowName}>{suggestion.name}</Text>
              {!!suggestion.secondary && (
                <Text style={styles.rowSecondary} numberOfLines={1}>
                  {suggestion.secondary}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!searching && !error && query.trim().length >= 2 && suggestions.length === 0 && (
        <Text style={styles.empty}>Aucune ville trouvée.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 },
  spinner: { position: 'absolute', right: 14 },
  list: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, marginTop: 8, overflow: 'hidden' },
  row: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  rowName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  rowSecondary: { fontSize: 13, color: '#888', marginTop: 2 },
  selected: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedText: { flex: 1 },
  selectedName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  selectedAddress: { fontSize: 13, color: '#888', marginTop: 2 },
  change: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  error: { fontSize: 13, color: '#b3402f', marginTop: 8 },
  empty: { fontSize: 13, color: '#888', marginTop: 8 },
});
