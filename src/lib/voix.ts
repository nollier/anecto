import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { supabase } from './supabase';
import { Anecdote } from '../types';

export type EtatVoix = 'repos' | 'lecture' | 'pause';

/** Une seule veille à la fois, quel que soit l'écran qui lit. */
const TAG_VEILLE = 'anecto-ecoute';

/**
 * Seul iOS sait suspendre une synthèse en cours.
 *
 * `Speech.pause()` et `Speech.resume()` n'existent pas sur Android : le second
 * appui y arrête donc la lecture au lieu de la suspendre, et le bouton doit
 * l'annoncer plutôt que promettre une pause qui n'arrivera pas.
 */
export const PAUSE_POSSIBLE = Platform.OS === 'ios';

/**
 * Android refuse tout énoncé au-delà de `getMaxSpeechInputLength()`, soit
 * 4 000 caractères. Une anecdote de 450 mots en fait environ 3 000, mais la
 * marge est trop mince pour parier dessus : au-delà de la limite, rien n'est
 * lu, sans le moindre message.
 */
const LIMITE_ENONCE = Math.min(Speech.maxSpeechInputLength, 3800);

/** Ce qui se dit à voix haute : l'accroche, puis le corps. */
export function texteAEcouter(anecdote: Anecdote): string {
  const titre = anecdote.hook || anecdote.title;

  // Sans ponctuation finale, le synthétiseur enchaîne le titre et la première
  // phrase d'un seul souffle : la ponctuation est ce qui fait le silence.
  const amorce = /[.!?…]$/.test(titre.trim()) ? titre.trim() : `${titre.trim()}.`;
  return `${amorce}\n\n${anecdote.body}`;
}

/**
 * Découpe en énoncés que le moteur accepte, sans couper au milieu d'une phrase.
 *
 * Les morceaux sont mis en file par `Speech.speak` et s'enchaînent sans blanc
 * audible, à condition que la coupure tombe sur une fin de phrase.
 */
export function decouperPourVoix(texte: string, limite = LIMITE_ENONCE): string[] {
  const phrases = texte.split(/(?<=[.!?…])\s+/);
  const morceaux: string[] = [];
  let courant = '';

  for (const phrase of phrases) {
    // Une phrase plus longue que la limite ne peut pas être sauvée par un
    // regroupement : elle se coupe sur ses espaces, seul endroit où la coupure
    // ne casse pas un mot.
    if (phrase.length > limite) {
      if (courant) {
        morceaux.push(courant);
        courant = '';
      }
      let reste = phrase;
      while (reste.length > limite) {
        const coupure = reste.lastIndexOf(' ', limite);
        const point = coupure > 0 ? coupure : limite;
        morceaux.push(reste.slice(0, point).trim());
        reste = reste.slice(point).trim();
      }
      courant = reste;
      continue;
    }

    const candidat = courant ? `${courant} ${phrase}` : phrase;
    if (candidat.length > limite) {
      morceaux.push(courant);
      courant = phrase;
    } else {
      courant = candidat;
    }
  }

  if (courant) morceaux.push(courant);
  return morceaux.filter((m) => m.length > 0);
}

/**
 * La lecture à voix haute d'une anecdote.
 *
 * La voix vient du téléphone : `AVSpeechSynthesizer` sur iOS,
 * `android.speech.tts.TextToSpeech` sur Android. Rien ne part sur un serveur,
 * rien ne coûte à l'usage, et l'écoute fonctionne sans réseau.
 *
 * Elle s'arrête dès que l'écran perd le focus ou que l'application passe en
 * arrière-plan. Ce n'est pas une limite qu'on subit, c'est la seule promesse
 * tenable : la lecture en arrière-plan demanderait une session audio et un
 * service au premier plan qu'`expo-speech` n'expose pas.
 */
export function useLectureVocale(anecdote: Anecdote | null) {
  const [etat, setEtat] = useState<EtatVoix>('repos');
  const [disponible, setDisponible] = useState(true);

  // Chaque lecture porte un numéro : les rappels d'une lecture abandonnée
  // arrivent parfois après le démarrage de la suivante, et remettraient
  // l'écran au repos alors que la voix parle.
  const session = useRef(0);
  const dejaComptee = useRef<string | null>(null);

  const relacherVeille = useCallback(() => {
    deactivateKeepAwake(TAG_VEILLE).catch(() => {});
  }, []);

  const arreter = useCallback(() => {
    session.current += 1;
    Speech.stop();
    relacherVeille();
    setEtat('repos');
  }, [relacherVeille]);

  /**
   * L'écoute se constate comme la lecture : au moment où la voix démarre, une
   * fois par anecdote. C'est ce compteur, et lui seul, qui dira si l'écoute
   * mérite un jour un vrai lecteur audio.
   */
  const compterEcoute = useCallback((id: string) => {
    if (dejaComptee.current === id) return;
    dejaComptee.current = id;
    supabase.rpc('marquer_anecdote_ecoutee', { p_anecdote_id: id }).then(({ error }) => {
      // Une écoute non comptée ne doit jamais interrompre la voix : on la perd,
      // on le note, la lecture continue.
      if (error) console.error(error);
    });
  }, []);

  const basculer = useCallback(() => {
    if (!anecdote) return;

    if (etat === 'lecture') {
      if (!PAUSE_POSSIBLE) return arreter();
      Speech.pause();
      setEtat('pause');
      return;
    }

    if (etat === 'pause') {
      Speech.resume();
      setEtat('lecture');
      return;
    }

    session.current += 1;
    const numero = session.current;
    const morceaux = decouperPourVoix(texteAEcouter(anecdote));

    // L'état passe à « lecture » avant le premier son : sur Android, le moteur
    // met parfois deux cents millisecondes à démarrer, et un bouton qui ne
    // réagit pas se fait appuyer deux fois.
    setEtat('lecture');
    activateKeepAwakeAsync(TAG_VEILLE).catch(() => {});
    compterEcoute(anecdote.id);

    morceaux.forEach((morceau, index) => {
      const dernier = index === morceaux.length - 1;
      Speech.speak(morceau, {
        language: 'fr-FR',
        // `onStopped` est attaché à chaque morceau, pas au dernier : un arrêt
        // demandé pendant le premier n'atteindrait jamais un rappel posé sur
        // le dernier, et l'écran resterait bloqué sur « en lecture ».
        onStopped: () => {
          if (numero !== session.current) return;
          relacherVeille();
          setEtat('repos');
        },
        onDone: dernier
          ? () => {
              if (numero !== session.current) return;
              relacherVeille();
              setEtat('repos');
            }
          : undefined,
        onError: () => {
          if (numero !== session.current) return;
          relacherVeille();
          setEtat('repos');
          setDisponible(false);
        },
      });
    });
  }, [anecdote, arreter, compterEcoute, etat, relacherVeille]);

  // Une voix française installée, ou rien à proposer. Sur Android le moteur
  // s'initialise à la première demande et peut répondre une liste vide : on
  // n'en conclut rien plutôt que de masquer le bouton à tort.
  useEffect(() => {
    let vivant = true;
    Speech.getAvailableVoicesAsync()
      .then((voix) => {
        if (!vivant || voix.length === 0) return;
        setDisponible(voix.some((v) => v.language?.toLowerCase().startsWith('fr')));
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  // Changer d'anecdote pendant la lecture couperait la voix au milieu d'un
  // texte qui n'est plus à l'écran.
  useEffect(() => {
    arreter();
  }, [anecdote?.id]);

  // Passer en arrière-plan coupe la synthèse côté système : on remet l'écran
  // au repos plutôt que de le laisser afficher une pause qui n'existe plus.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (statut) => {
      if (statut !== 'active') arreter();
    });
    return () => sub.remove();
  }, [arreter]);

  // Quitter l'onglet arrête la voix : personne ne s'attend à entendre une
  // anecdote qu'il ne regarde plus.
  useFocusEffect(
    useCallback(() => {
      return () => arreter();
    }, [arreter])
  );

  return { etat, disponible, basculer };
}
