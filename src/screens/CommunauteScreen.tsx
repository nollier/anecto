import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  Campagne,
  LigneCampagne,
  Resultat,
  cloture,
  construireCampagne,
  dernierJour,
  gagnants,
  messageErreur,
  periode,
} from '../lib/communaute';

/**
 * Onglet Communauté : le vote en cours sur la prochaine fonctionnalité.
 *
 * Les résultats ne s'affichent qu'en pourcentages, et seulement après avoir
 * voté (ou une fois le vote clos) : c'est la base qui en décide, l'écran
 * n'affiche que ce qu'elle renvoie.
 */
export default function CommunauteScreen() {
  const navigation = useNavigation<any>();
  const [chargement, setChargement] = useState(true);
  const [rafraichit, setRafraichit] = useState(false);
  const [campagne, setCampagne] = useState<Campagne | null>(null);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [livrees, setLivrees] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [modification, setModification] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    const [{ data, error }, { data: dejaLivrees }] = await Promise.all([
      supabase.rpc('campagne_communaute'),
      supabase.rpc('fonctionnalites_livrees'),
    ]);
    if (error) {
      setErreur('Impossible de charger le vote. Tire vers le bas pour réessayer.');
    } else {
      const c = construireCampagne((data ?? []) as LigneCampagne[]);
      setCampagne(c);
      setSelection(c?.monChoix ?? null);
      if (c && (c.monChoix || !c.ouverte)) {
        const { data: r } = await supabase.rpc('resultats_campagne', { p_campagne_id: c.id });
        setResultats((r ?? []) as Resultat[]);
      } else {
        setResultats([]);
      }
    }
    setLivrees(((dejaLivrees ?? []) as { libelle: string }[]).map((l) => l.libelle));
    setChargement(false);
    setRafraichit(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  async function voter() {
    if (!selection || envoi) return;
    setEnvoi(true);
    setErreur(null);
    const { error } = await supabase.rpc('voter', { p_option_id: selection });
    setEnvoi(false);
    if (error) {
      setErreur(messageErreur(error, "Ton vote n'est pas passé. Réessaie."));
      return;
    }
    setModification(false);
    charger();
  }

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const aVote = !!campagne?.monChoix;
  const afficherVote = !!campagne && campagne.ouverte && (!aVote || modification);
  const afficherResultats = !!campagne && !afficherVote && resultats.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={rafraichit} onRefresh={() => { setRafraichit(true); charger(); }} />
      }
    >
      {!campagne && (
        <View style={styles.entete}>
          <Text style={styles.titre}>Faites le prochain Anecto</Text>
          <Text style={styles.intro}>
            Tous les 14 jours, un vote pour choisir la prochaine fonctionnalité. Le prochain arrive
            bientôt : tu seras prévenu.
          </Text>
        </View>
      )}

      {campagne && (
        <View style={styles.entete}>
          <Text style={styles.surtitre}>{periode(campagne)}</Text>
          <Text style={styles.titre}>
            {!campagne.ouverte
              ? 'Le vote est terminé'
              : afficherVote
                ? 'Faites le prochain Anecto'
                : 'Merci pour ton vote !'}
          </Text>
          <Text style={styles.intro}>
            {!campagne.ouverte
              ? 'Merci à tous les votants. Rendez-vous au prochain vote.'
              : afficherVote
                ? 'La fonctionnalité la plus votée sera développée en priorité.'
                : `Voici les tendances. Tu peux changer d'avis jusqu'au ${dernierJour(campagne.fin)}.`}
          </Text>
        </View>
      )}

      {campagne?.ouverte && afficherVote && (
        <View style={styles.pastille}>
          <Ionicons name="time-outline" size={16} color="#b3402f" />
          <Text style={styles.pastilleTexte}>{cloture(campagne.fin)}</Text>
        </View>
      )}

      {afficherVote && campagne && (
        <View accessibilityRole="radiogroup" style={styles.options}>
          <Text style={styles.question}>{campagne.titre}</Text>
          {campagne.options.map((o) => {
            const choisie = selection === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: choisie }}
                onPress={() => setSelection(o.id)}
                style={[styles.option, choisie && styles.optionChoisie]}
                activeOpacity={0.8}
              >
                <View style={[styles.radio, choisie && styles.radioChoisi]}>
                  {choisie && <View style={styles.radioPoint} />}
                </View>
                <View style={styles.optionTextes}>
                  <Text style={styles.optionLibelle}>{o.libelle}</Text>
                  {!!o.description && <Text style={styles.optionDescription}>{o.description}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {afficherResultats && campagne && (
        <>
          {!campagne.ouverte && (
            <View style={styles.gagnant}>
              <Text style={styles.gagnantSurtitre}>
                {gagnants(campagne, resultats).length > 1 ? 'Égalité en tête' : 'La communauté a choisi'}
              </Text>
              <Text style={styles.gagnantTexte}>
                {gagnants(campagne, resultats).map((o) => o.libelle).join(' et ')}
              </Text>
            </View>
          )}
          <View style={styles.resultats}>
            {campagne.options.map((o) => {
              const r = resultats.find((x) => x.option_id === o.id);
              const pct = r?.pourcentage ?? 0;
              const mien = campagne.monChoix === o.id;
              return (
                <View key={o.id} style={styles.resultat}>
                  <View style={styles.resultatLigne}>
                    <Text style={styles.resultatLibelle}>{o.libelle}</Text>
                    <Text style={[styles.resultatPct, mien && styles.accent]}>{pct} %</Text>
                  </View>
                  <View style={styles.barre}>
                    <View style={[styles.barrePleine, { width: `${pct}%` }, mien && styles.barreMienne]} />
                  </View>
                  {mien && (
                    <View style={styles.monChoix}>
                      <Ionicons name="checkmark" size={14} color="#b3402f" />
                      <Text style={styles.monChoixTexte}>Ton choix</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.note}>
            {campagne.ouverte
              ? `Pourcentages des votants. L'option en tête le ${dernierJour(campagne.fin)} sera développée.`
              : 'Pourcentages des votants.'}
          </Text>
        </>
      )}

      {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {afficherVote && (
        <>
          <TouchableOpacity
            style={[styles.bouton, (!selection || envoi) && styles.boutonInactif]}
            onPress={voter}
            disabled={!selection || envoi}
            accessibilityRole="button"
          >
            {envoi ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.boutonTexte}>{modification ? 'Confirmer mon vote' : 'Voter'}</Text>
            )}
          </TouchableOpacity>
          {!modification && <Text style={styles.sousBouton}>Les résultats s'affichent après ton vote</Text>}
          {modification && (
            <TouchableOpacity
              onPress={() => { setModification(false); setSelection(campagne?.monChoix ?? null); }}
              style={styles.lienCentre}
              accessibilityRole="button"
            >
              <Text style={styles.lienCentreTexte}>Annuler</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {afficherResultats && campagne?.ouverte && (
        <TouchableOpacity
          style={styles.boutonSecondaire}
          onPress={() => setModification(true)}
          accessibilityRole="button"
        >
          <Text style={styles.boutonSecondaireTexte}>Changer mon vote</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.autre}
        onPress={() => navigation.navigate('Idee')}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={22} color="#b3402f" />
        <View style={styles.optionTextes}>
          <Text style={styles.autreTitre}>Autre chose ? Propose ton idée</Text>
          <Text style={styles.autreTexte}>Les meilleures passent au vote suivant</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#999" />
      </TouchableOpacity>

      <View style={styles.livrees}>
        <Text style={styles.livreesTitre}>Vous l'avez demandé</Text>
        {livrees.length === 0 ? (
          <Text style={styles.livreesTexte}>Les fonctionnalités gagnantes apparaîtront ici une fois livrées.</Text>
        ) : (
          livrees.map((l) => (
            <View key={l} style={styles.livree}>
              <Ionicons name="checkmark-circle" size={18} color="#1d6b4f" />
              <Text style={styles.livreesTexte}>{l}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40, gap: 16 },
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  entete: { gap: 6 },
  surtitre: { fontSize: 13, fontWeight: '600', color: '#6b6b6b' },
  titre: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: '#1a1a1a' },
  intro: { fontSize: 15, lineHeight: 21, color: '#444' },
  pastille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fbeeeb',
  },
  pastilleTexte: { fontSize: 13, fontWeight: '600', color: '#b3402f' },
  options: { gap: 10 },
  question: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2ddd8',
    borderRadius: 12,
  },
  optionChoisie: { borderWidth: 2, borderColor: '#b3402f', backgroundColor: '#fdf7f5', padding: 15 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#b5aca4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChoisi: { borderColor: '#b3402f' },
  radioPoint: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#b3402f' },
  optionTextes: { flex: 1, gap: 3 },
  optionLibelle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  optionDescription: { fontSize: 13, lineHeight: 18, color: '#555' },
  gagnant: { padding: 16, borderRadius: 12, backgroundColor: '#fbeeeb', gap: 4 },
  gagnantSurtitre: { fontSize: 13, fontWeight: '600', color: '#b3402f' },
  gagnantTexte: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  resultats: { padding: 18, borderRadius: 12, backgroundColor: '#faf6f2', gap: 14 },
  resultat: { gap: 6 },
  resultatLigne: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  resultatLibelle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  resultatPct: { fontSize: 17, fontWeight: '700', color: '#444' },
  accent: { color: '#b3402f' },
  barre: { height: 10, borderRadius: 5, backgroundColor: '#ece5de', overflow: 'hidden' },
  barrePleine: { height: 10, borderRadius: 5, backgroundColor: '#7a706a' },
  barreMienne: { backgroundColor: '#b3402f' },
  monChoix: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monChoixTexte: { fontSize: 12, fontWeight: '600', color: '#b3402f' },
  note: { fontSize: 12, lineHeight: 17, color: '#6b6b6b' },
  erreur: { fontSize: 14, color: '#b3402f' },
  bouton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonInactif: { opacity: 0.4 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sousBouton: { fontSize: 12, color: '#6b6b6b', textAlign: 'center', marginTop: -8 },
  lienCentre: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  lienCentreTexte: { fontSize: 14, fontWeight: '600', color: '#666' },
  boutonSecondaire: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonSecondaireTexte: { color: '#222', fontSize: 15, fontWeight: '600' },
  autre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c9c2bb',
    borderRadius: 12,
  },
  autreTitre: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  autreTexte: { fontSize: 12, color: '#6b6b6b' },
  livrees: { gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  livreesTitre: { fontSize: 13, fontWeight: '700', color: '#6b6b6b' },
  livree: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livreesTexte: { fontSize: 14, lineHeight: 20, color: '#555' },
});
