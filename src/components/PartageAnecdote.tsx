import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { partagerAnecdote, partagerImage } from '../lib/partage';
import { monCodeParrainage } from '../lib/parrainage';
import { Anecdote } from '../types';

/** Format d'une story : 9:16, capturé en 1080 × 1920. */
const LARGEUR = 360;
const HAUTEUR = 640;

/** Une image se lit en quelques secondes : l'accroche, puis le début du récit. */
const EXTRAIT_MAX = 420;

/**
 * Le début du récit, coupé à la fin d'une phrase.
 *
 * L'anecdote entière ne tient pas dans une story à une taille lisible. Couper
 * au milieu d'un mot donne une image bâclée ; couper à la dernière phrase
 * complète donne un texte qui se tient et appelle la suite.
 */
export function extrait(corps: string): { texte: string; coupe: boolean } {
  const premier = corps.split(/\n\s*\n/)[0].trim();
  if (premier.length <= EXTRAIT_MAX) return { texte: premier, coupe: premier !== corps.trim() };

  const debut = premier.slice(0, EXTRAIT_MAX);
  const fin = Math.max(debut.lastIndexOf('. '), debut.lastIndexOf('! '), debut.lastIndexOf('? '));
  // Pas de fin de phrase avant la limite : on coupe au dernier mot entier.
  const texte = fin > 120 ? debut.slice(0, fin + 1) : debut.slice(0, debut.lastIndexOf(' '));
  return { texte, coupe: true };
}

const serif = Platform.select({ ios: 'Georgia', default: 'serif' });

/**
 * La carte telle qu'elle part en image.
 *
 * Même palette que la page de téléchargement : qui reçoit l'image puis ouvre
 * le lien doit reconnaître la même maison. `collapsable={false}` est exigé
 * par la capture sur Android, qui sinon aplatit la vue et ne trouve rien.
 */
const Carte = React.forwardRef<View, { anecdote: Anecdote }>(({ anecdote }, ref) => {
  const { texte, coupe } = extrait(anecdote.body);
  const entete = [anecdote.city, anecdote.period].filter(Boolean).join(' · ');

  return (
    <View ref={ref} collapsable={false} style={carte.fond}>
      <View style={carte.filet} />
      <Text style={carte.entete}>{entete.toUpperCase()}</Text>
      <Text style={carte.titre} numberOfLines={5}>{anecdote.hook || anecdote.title}</Text>
      <Text style={carte.corps} numberOfLines={13}>
        {texte}
        {coupe ? ' […]' : ''}
      </Text>
      <View style={carte.pied}>
        <Text style={carte.marque}>Anecto</Text>
        <Text style={carte.promesse}>
          {coupe ? 'La suite, et une anecdote vraie sur ta ville chaque jour.' : 'Une anecdote vraie sur ta ville, chaque jour.'}
        </Text>
        <Text style={carte.magasins}>Gratuit · App Store et Google Play</Text>
      </View>
    </View>
  );
});

/**
 * Les deux façons de partager une anecdote : le texte entier avec sa source,
 * ou une image au format story.
 *
 * Le texte convient à une messagerie, entre proches ; l'image, aux stories et
 * aux fils où un lien seul ne se lit pas. L'image passe par un aperçu : on
 * ne publie pas sur Instagram quelque chose qu'on n'a pas vu.
 */
export default function PartageAnecdote({ anecdote }: { anecdote: Anecdote }) {
  const [apercu, setApercu] = useState(false);
  const [capture, setCapture] = useState(false);
  const refCarte = useRef<View>(null);
  const { width, height } = useWindowDimensions();

  // Le code d'invitation est chargé dès l'affichage de l'anecdote : au moment
  // du partage, il est déjà en cache et la feuille s'ouvre sans attendre.
  useEffect(() => {
    monCodeParrainage();
  }, []);

  // L'aperçu tient à l'écran quelle que soit sa taille ; la carte garde ses
  // dimensions propres, la mise à l'échelle n'est qu'un affichage et ne
  // touche pas la capture.
  const echelle = Math.min(1, (width - 48) / LARGEUR, (height - 220) / HAUTEUR);

  async function partager() {
    if (capture) return;
    setCapture(true);
    try {
      const uri = await captureRef(refCarte, {
        format: 'png',
        width: 1080,
        height: 1920,
        result: 'tmpfile',
      });
      await partagerImage(uri);
      setApercu(false);
    } catch (erreur) {
      console.error(erreur);
    } finally {
      setCapture(false);
    }
  }

  return (
    <>
      {/* Discrets : partager est une envie qui vient après la lecture, pas
          l'action que l'écran réclame. Des boutons pleins les mettraient
          au-dessus de l'anecdote. */}
      <View style={styles.rangee}>
        <TouchableOpacity
          style={styles.bouton}
          accessibilityRole="button"
          onPress={() => partagerAnecdote(anecdote)}
        >
          <Text style={styles.boutonTexte}>↗ Envoyer le texte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bouton}
          accessibilityRole="button"
          onPress={() => setApercu(true)}
        >
          <Text style={styles.boutonTexte}>▣ Partager en image</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={apercu}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setApercu(false)}
      >
        <View style={styles.modale}>
          <View style={{ width: LARGEUR * echelle, height: HAUTEUR * echelle }}>
            <View
              style={{
                position: 'absolute',
                left: (LARGEUR * echelle - LARGEUR) / 2,
                top: (HAUTEUR * echelle - HAUTEUR) / 2,
                transform: [{ scale: echelle }],
              }}
            >
              <Carte ref={refCarte} anecdote={anecdote} />
            </View>
          </View>

          <TouchableOpacity style={styles.principal} onPress={partager} disabled={capture}>
            {capture ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.principalTexte}>Partager l'image</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setApercu(false)}>
            <Text style={styles.annuler}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const carte = StyleSheet.create({
  fond: {
    width: LARGEUR,
    height: HAUTEUR,
    backgroundColor: '#faf6f1',
    paddingHorizontal: 28,
    paddingTop: 56,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  filet: { width: 36, height: 3, backgroundColor: '#a8402f', marginBottom: 18 },
  entete: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: '#a8402f', marginBottom: 14 },
  titre: { fontFamily: serif, fontSize: 25, lineHeight: 31, color: '#161514', marginBottom: 20 },
  corps: { fontSize: 14.5, lineHeight: 22, color: '#3a3532' },
  // Le pied est poussé en bas : quelle que soit la longueur du texte, la
  // marque est toujours au même endroit, là où l'œil finit la story.
  pied: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#e6e1db', paddingTop: 16 },
  marque: { fontFamily: serif, fontSize: 26, color: '#a8402f' },
  promesse: { fontSize: 13, lineHeight: 18, color: '#161514', marginTop: 4 },
  magasins: { fontSize: 11, color: '#6d635e', marginTop: 6 },
});

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  bouton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: '#fbeeeb',
  },
  boutonTexte: { fontSize: 13, fontWeight: '600', color: '#b3402f' },
  modale: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  principal: {
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 24,
  },
  principalTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  annuler: { textAlign: 'center', color: '#888', marginTop: 16, fontSize: 14 },
});
