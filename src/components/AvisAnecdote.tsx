import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Anecdote, FeedbackType } from '../types';

/** Le champ libre sert aux corrections comme aux propositions. */
type SaisieLibre = 'incomplete' | 'propose' | null;

type Props = {
  anecdote: Anecdote;
  /**
   * Le ScrollView qui contient ce bloc. Fourni, le champ de saisie remonte
   * au-dessus du clavier ; absent, le bloc fonctionne quand même.
   */
  scrollRef?: React.RefObject<ScrollView | null>;
};

/**
 * Donner son avis sur une anecdote : j'adore, signaler un manque, proposer.
 *
 * Le même bloc sert à l'accueil et à la relecture depuis l'historique. Une
 * anecdote passée sur laquelle on n'a rien dit reste ouverte au vote : c'est
 * souvent en la relisant qu'on se décide, et rien ne justifie que l'avis ne
 * soit possible que le jour de l'envoi.
 */
export default function AvisAnecdote({ anecdote, scrollRef }: Props) {
  const [avisDonne, setAvisDonne] = useState<FeedbackType | null>(null);
  // Tant que la base n'a pas répondu, on n'affiche rien : montrer les boutons
  // puis les retirer donnerait l'impression d'un vote perdu.
  const [charge, setCharge] = useState(false);
  const [saisie, setSaisie] = useState<SaisieLibre>(null);
  const [texteLibre, setTexteLibre] = useState('');
  const envoiEnCours = useRef(false);

  // L'avis vit en base, pas dans l'état du composant : relancer l'app ne doit
  // pas permettre de voter une seconde fois sur la même anecdote.
  useEffect(() => {
    let vivant = true;
    setCharge(false);
    setSaisie(null);
    setTexteLibre('');

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (vivant) setCharge(true);
        return;
      }

      const { data: avis } = await supabase
        .from('feedback')
        .select('type')
        .eq('user_id', userData.user.id)
        .eq('anecdote_id', anecdote.id)
        .limit(1)
        .maybeSingle();

      if (!vivant) return;
      setAvisDonne((avis?.type as FeedbackType) ?? null);
      setCharge(true);
    })();

    return () => {
      vivant = false;
    };
  }, [anecdote.id]);

  // Le champ de saisie est en bas d'une anecdote de 300 à 450 mots : à
  // l'ouverture du clavier il se retrouve dessous, et on écrit à l'aveugle.
  // On attend `keyboardDidShow` plutôt que `onFocus` — à cet instant seulement
  // la hauteur disponible est connue, donc `scrollToEnd` vise juste.
  useEffect(() => {
    if (!saisie || !scrollRef) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [saisie, scrollRef]);

  async function envoyer(type: FeedbackType, commentaire?: string) {
    // Un double appui sur « J'adore » insérerait deux lignes : la contrainte
    // d'unicité n'existe pas en base, c'est ici que le garde-fou se pose.
    if (envoiEnCours.current) return;
    envoiEnCours.current = true;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // `reuse_count` n'est pas touché ici : RLS interdit toute écriture du
      // client sur `anecdotes`, et le compteur appartient à
      // get_daily_anecdote(), qui l'incrémente à l'envoi.
      const { error } = await supabase.from('feedback').insert({
        user_id: userData.user.id,
        anecdote_id: anecdote.id,
        type,
        comment: commentaire?.trim() || null,
      });

      if (error) {
        Alert.alert('Retour non enregistré', 'Réessaie dans un instant.');
        return;
      }

      setAvisDonne(type);
      setSaisie(null);
      setTexteLibre('');
      Alert.alert(
        'Merci !',
        type === 'propose'
          ? 'Ta proposition part en relecture.'
          : 'Ton retour a bien été enregistré.'
      );
    } finally {
      envoiEnCours.current = false;
    }
  }

  if (!charge) return null;

  if (avisDonne) return <Text style={styles.thanksText}>Merci pour ton retour 🙌</Text>;

  const question =
    saisie === 'propose'
      ? 'Quelle anecdote connais-tu sur ta ville ?'
      : "Qu'est-ce qui manque ou est incorrect ?";

  if (saisie) {
    return (
      <View style={styles.feedbackBlock}>
        <Text style={styles.feedbackQuestion}>{question}</Text>
        <TextInput
          style={styles.input}
          multiline
          // Ouvre le clavier dès le choix du bouton : une frappe de moins,
          // et c'est ce qui déclenche la remontée du champ.
          autoFocus
          value={texteLibre}
          onChangeText={setTexteLibre}
          placeholder={
            saisie === 'propose'
              ? 'Raconte-la, avec sa source si tu la connais…'
              : 'Décris la correction…'
          }
        />
        <TouchableOpacity
          style={[styles.submitBtn, !texteLibre.trim() && styles.submitBtnDisabled]}
          disabled={!texteLibre.trim()}
          onPress={() => envoyer(saisie, texteLibre)}
        >
          <Text style={styles.submitBtnText}>Envoyer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSaisie(null)}>
          <Text style={styles.cancel}>Annuler</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.feedbackBlock}>
      <Text style={styles.feedbackQuestion}>Comment trouvez-vous cette anecdote ?</Text>
      <View style={styles.feedbackRow}>
        <TouchableOpacity style={styles.feedbackBtn} onPress={() => envoyer('adore')}>
          <Text style={styles.feedbackBtnEmoji}>😍</Text>
          <Text style={styles.feedbackBtnText} numberOfLines={1}>J'adore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.feedbackBtn} onPress={() => setSaisie('incomplete')}>
          <Text style={styles.feedbackBtnEmoji}>✏️</Text>
          <Text style={styles.feedbackBtnText} numberOfLines={1}>Incomplète</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.feedbackBtn} onPress={() => setSaisie('propose')}>
          <Text style={styles.feedbackBtnEmoji}>💡</Text>
          <Text style={styles.feedbackBtnText} numberOfLines={1}>Proposer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedbackBlock: { marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' },
  feedbackQuestion: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  feedbackRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  feedbackBtn: { flex: 1, backgroundColor: '#f2f2f2', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  feedbackBtnEmoji: { fontSize: 18, marginBottom: 4 },
  // Emoji et libellé sur deux lignes : « Incomplète » seul, à 13pt, tient
  // toujours dans le tiers de largeur qui lui reste sur un écran Android
  // étroit — c'est le partage avec l'emoji sur la même ligne qui le faisait
  // déborder sur deux lignes.
  feedbackBtnText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#222', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  submitBtnDisabled: { backgroundColor: '#bbb' },
  submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#888', marginTop: 12, fontSize: 14 },
  thanksText: { marginTop: 24, textAlign: 'center', color: '#666' },
});
