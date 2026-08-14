import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { Anecdote, FeedbackType } from '../types';

export default function HomeScreen() {
  const [anecdote, setAnecdote] = useState<Anecdote | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState<FeedbackType | null>(null);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionText, setCorrectionText] = useState('');

  useEffect(() => {
    loadTodayAnecdote();
  }, []);

  async function loadTodayAnecdote() {
    setLoading(true);

    const { data: profile } = await supabase.auth.getUser();
    if (!profile.user) {
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('city, city_place_id')
      .eq('id', profile.user.id)
      .single();

    if (!profileData) {
      setLoading(false);
      return;
    }

    // Anecdote validée, la moins souvent servie en priorité, pour cette ville.
    // Le rattachement se fait par place_id Google ; `city` ne sert de repli que
    // pour les profils créés avant l'autocomplétion.
    const query = supabase
      .from('anecdotes')
      .select('*')
      .eq('status', 'validated')
      .order('reuse_count', { ascending: true })
      .limit(1);

    const { data, error } = await (profileData.city_place_id
      ? query.eq('city_place_id', profileData.city_place_id)
      : query.eq('city', profileData.city)
    ).maybeSingle();

    if (error) {
      console.error(error);
    } else if (data) {
      setAnecdote(data);
      await supabase.from('user_anecdote_history').insert({
        user_id: profile.user.id,
        anecdote_id: data.id,
      });
    }

    setLoading(false);
  }

  async function submitFeedback(type: FeedbackType, comment?: string) {
    if (!anecdote) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase.from('feedback').insert({
      user_id: userData.user.id,
      anecdote_id: anecdote.id,
      type,
      comment: comment ?? null,
    });

    if (type === 'adore') {
      await supabase
        .from('anecdotes')
        .update({ reuse_count: anecdote.reuse_count + 1 })
        .eq('id', anecdote.id);
    }

    setFeedbackGiven(type);
    Alert.alert('Merci !', 'Ton retour a bien été enregistré.');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!anecdote) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          Aucune anecdote disponible pour ta ville aujourd'hui. Reviens un peu plus tard !
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>📖 Anecdote du jour · {anecdote.city}</Text>
      <Text style={styles.title}>{anecdote.title}</Text>
      <Text style={styles.body}>{anecdote.body}</Text>
      <Text style={styles.source}>Source : {anecdote.source}</Text>

      {!feedbackGiven && !correctionMode && (
        <View style={styles.feedbackBlock}>
          <Text style={styles.feedbackQuestion}>Comment trouvez-vous cette anecdote ?</Text>
          <View style={styles.feedbackRow}>
            <TouchableOpacity style={styles.feedbackBtn} onPress={() => submitFeedback('adore')}>
              <Text style={styles.feedbackBtnText}>😍 J'adore</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.feedbackBtn} onPress={() => setCorrectionMode(true)}>
              <Text style={styles.feedbackBtnText}>✏️ Incomplète</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedbackBtn}
              onPress={() => submitFeedback('propose')}
            >
              <Text style={styles.feedbackBtnText}>💡 Proposer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {correctionMode && (
        <View style={styles.feedbackBlock}>
          <Text style={styles.feedbackQuestion}>Qu'est-ce qui manque ou est incorrect ?</Text>
          <TextInput
            style={styles.input}
            multiline
            value={correctionText}
            onChangeText={setCorrectionText}
            placeholder="Décris la correction..."
          />
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => submitFeedback('incomplete', correctionText)}
          >
            <Text style={styles.feedbackBtnText}>Envoyer</Text>
          </TouchableOpacity>
        </View>
      )}

      {feedbackGiven && (
        <Text style={styles.thanksText}>Merci pour ton retour 🙌</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  eyebrow: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16, color: '#1a1a1a' },
  body: { fontSize: 16, lineHeight: 24, color: '#333' },
  source: { fontSize: 12, color: '#999', marginTop: 16, fontStyle: 'italic' },
  emptyText: { fontSize: 16, textAlign: 'center', color: '#666' },
  feedbackBlock: { marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  feedbackQuestion: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  feedbackBtn: { flex: 1, backgroundColor: '#f2f2f2', padding: 12, borderRadius: 10, alignItems: 'center' },
  feedbackBtnText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#222', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  thanksText: { marginTop: 24, textAlign: 'center', color: '#666' },
});
