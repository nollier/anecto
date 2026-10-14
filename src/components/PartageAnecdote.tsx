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
import { NOM_MAGASIN, partagerAnecdote, partagerImage } from '../lib/partage';
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
      <Text style={carte.corps} numberOfLines={11}>
        {texte}
        {coupe ? ' […]' : ''}
      </Text>
      {/* Aucun lien ne voyage avec une image, et une story ne se clique pas :
          le pied dit donc où trouver l'app et sous quel nom la chercher. */}
      <View style={carte.pied}>
        <Text style={carte.marque}>Anecto</Text>
        <Text style={carte.promesse}>
          {coupe ? 'La suite, et une anecdote vraie sur ta ville chaque jour.' : 'Une anecdote vraie sur ta ville, chaque jour.'}
        </Text>
        <Text style={carte.magasins}>Gratuit sur l'App Store et Google Play. Cherche :</Text>
        <Text style={carte.recherche}>« {NOM_MAGASIN} »</Text>
      </View>
    </View>
  );
});

/** Taille de la miniature dans le bloc : la carte réelle, réduite. */
const ECHELLE_MINIATURE = 0.24;

/**
 * Le bloc « Soutiens Anecto » qui clôt chaque anecdote.
 *
 * Anecto n'a ni publicité ni abonnement : ce sont les lecteurs qui le font
 * connaître, d'où un appel franc plutôt que deux boutons discrets. La
 * miniature est la carte elle-même, réduite : le lecteur voit ce qu'il va
 * envoyer, le bouton peut donc partager sans passer par un aperçu. Toucher la
 * miniature l'ouvre en grand pour qui veut la lire avant.
 *
 * Le texte reste proposé en second : il convient à une messagerie, entre
 * proches, et c'est lui qui porte les liens vers les magasins.
 */
export default function PartageAnecdote({ anecdote }: { anecdote: Anecdote }) {
  const [apercu, setApercu] = useState(false);
  const [capture, setCapture] = useState(false);
  const refMiniature = useRef<View>(null);
  const refApercu = useRef<View>(null);
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

  async function partager(ref: React.RefObject<View | null>) {
    if (capture) return;
    setCapture(true);
    try {
      const uri = await captureRef(ref, {
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
      <View style={styles.bloc}>
        <View style={styles.haut}>
          <TouchableOpacity
            accessibilityRole="imagebutton"
            accessibilityLabel="Voir l'image en grand"
            onPress={() => setApercu(true)}
            style={styles.miniature}
          >
            <Reduite echelle={ECHELLE_MINIATURE}>
              <Carte ref={refMiniature} anecdote={anecdote} />
            </Reduite>
          </TouchableOpacity>
          <View style={styles.appel}>
            <Text style={styles.titre}>Soutiens Anecto en partageant cette anecdote</Text>
            <Text style={styles.sousTitre}>
              Chaque partage fait découvrir Anecto à quelqu'un de plus. Merci !
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.principal}
          accessibilityRole="button"
          onPress={() => partager(refMiniature)}
          disabled={capture}
        >
          {capture && !apercu ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.principalTexte}>Partager l'image</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => partagerAnecdote(anecdote)}>
          <Text style={styles.secondaire}>↗ ou envoyer le texte</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={apercu}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setApercu(false)}
      >
        <View style={styles.modale}>
          <Reduite echelle={echelle}>
            <Carte ref={refApercu} anecdote={anecdote} />
          </Reduite>

          <TouchableOpacity
            style={[styles.principal, styles.principalApercu]}
            onPress={() => partager(refApercu)}
            disabled={capture}
          >
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

/**
 * La carte affichée à une autre échelle, sans changer ses dimensions.
 *
 * La capture lit la mise en page de la carte, pas sa transformation : réduite
 * ou non, elle sort toujours en 1080 × 1920. Le cadre extérieur prend la
 * taille réduite pour que la mise en page autour reste juste.
 */
function Reduite({ echelle, children }: { echelle: number; children: React.ReactNode }) {
  return (
    <View style={{ width: LARGEUR * echelle, height: HAUTEUR * echelle }}>
      <View
        style={{
          position: 'absolute',
          left: (LARGEUR * echelle - LARGEUR) / 2,
          top: (HAUTEUR * echelle - HAUTEUR) / 2,
          transform: [{ scale: echelle }],
        }}
      >
        {children}
      </View>
    </View>
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
  magasins: { fontSize: 11, color: '#6d635e', marginTop: 8 },
  recherche: { fontSize: 12, fontWeight: '700', color: '#161514', marginTop: 2 },
});

const styles = StyleSheet.create({
  // Mêmes crème et rouge brique que la carte : le bloc annonce l'image qu'il
  // envoie.
  bloc: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#faf6f1',
    borderWidth: 1,
    borderColor: '#ece4da',
  },
  haut: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  miniature: {
    borderRadius: 6,
    overflow: 'hidden',
    transform: [{ rotate: '-4deg' }],
    shadowColor: '#3c1e14',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    backgroundColor: '#faf6f1',
  },
  appel: { flex: 1, minWidth: 0 },
  titre: { fontFamily: serif, fontSize: 18, lineHeight: 23, color: '#161514' },
  sousTitre: { fontSize: 13, lineHeight: 18, color: '#6d635e', marginTop: 6 },
  principal: {
    backgroundColor: '#a8402f',
    paddingVertical: 13,
    borderRadius: 11,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  principalApercu: { marginTop: 24 },
  principalTexte: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaire: { textAlign: 'center', color: '#a8402f', fontSize: 13.5, fontWeight: '600', marginTop: 12 },
  modale: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  annuler: { textAlign: 'center', color: '#888', marginTop: 16, fontSize: 14 },
});
