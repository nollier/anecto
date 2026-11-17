import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { syncPushToken } from './src/lib/notifications';
import { declarerProvenance } from './src/lib/provenance';
import { noter } from './src/lib/mesure';
import { doitDemanderConnuPar, signalerQuestionConnuPar } from './src/lib/connuPar';
import ConnuPar from './src/components/ConnuPar';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnecdoteScreen from './src/screens/AnecdoteScreen';
import AuthScreen from './src/screens/AuthScreen';
import { TailleLectureProvider } from './src/components/ReglageTaille';

const Tab = createBottomTabNavigator();
const PileHistorique = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

/**
 * L'onglet Historique est une pile, pas un écran seul : une anecdote se relit
 * en entier, et un texte de 400 mots demande son propre écran plutôt qu'un
 * dépliement dans la liste. La pile apporte aussi le retour par balayage.
 */
function OngletHistorique() {
  return (
    <PileHistorique.Navigator>
      <PileHistorique.Screen
        name="Liste"
        component={HistoryScreen}
        options={{ headerShown: false }}
      />
      <PileHistorique.Screen
        name="Anecdote"
        component={AnecdoteScreen}
        options={{
          title: '',
          headerBackTitle: 'Historique',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1a1a1a',
        }}
      />
    </PileHistorique.Navigator>
  );
}

const ONGLET_DU_JOUR = "Aujourd'hui";

// Sans `tabBarIcon`, react-navigation affiche un rectangle vide en lieu et
// place de l'icône manquante — visible sur Android, où aucune police système
// ne comble le trou comme sur iOS.
const ICONES_ONGLET: Record<string, keyof typeof Ionicons.glyphMap> = {
  [ONGLET_DU_JOUR]: 'today',
  Historique: 'time',
  Réglages: 'settings',
};

function ouvrirAnecdoteDuJour() {
  if (navigationRef.isReady()) {
    navigationRef.navigate(ONGLET_DU_JOUR as never);
  }
}

const CLE_DERNIERE_OUVERTURE = 'anecto.push.derniere-ouverture';

/**
 * Mesure l'ouverture de l'app depuis une notification : type (quotidien ou
 * rappel), jour et anecdote. Dédoublonnée par identifiant, car la dernière
 * réponse reste lisible d'un démarrage à l'autre.
 */
async function noterOuverturePush(response: Notifications.NotificationResponse) {
  try {
    const id = response.notification.request.identifier;
    if ((await AsyncStorage.getItem(CLE_DERNIERE_OUVERTURE)) === id) return;
    await AsyncStorage.setItem(CLE_DERNIERE_OUVERTURE, id);
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    noter('ouverture_push', {
      type: typeof data.type === 'string' ? data.type : 'quotidien',
      jour: typeof data.jour === 'string' ? data.jour : null,
      anecdote_id: typeof data.anecdoteId === 'string' ? data.anecdoteId : null,
    });
  } catch (erreur) {
    console.warn('Ouverture push non mesurée', erreur);
  }
}

function surReponseNotification(response: Notifications.NotificationResponse) {
  noterOuverturePush(response);
  ouvrirAnecdoteDuJour();
}

export default function App() {
  return (
    <TailleLectureProvider>
      <Application />
    </TailleLectureProvider>
  );
}

function Application() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const dernierJetonSynchronise = useRef<string | null>(null);
  const [questionConnuPar, setQuestionConnuPar] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Le jeton push est réenregistré à chaque ouverture de session : il change
  // à la réinstallation ou à la restauration d'une sauvegarde, et sans ça les
  // notifications cesseraient sans que personne ne s'en aperçoive.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || dernierJetonSynchronise.current === userId) return;
    dernierJetonSynchronise.current = userId;
    // L'identité vient du jeton de session côté base, pas d'ici : `userId` ne
    // sert plus qu'à ne pas resynchroniser deux fois la même session.
    syncPushToken();
    // Une fois par compte : le canal par lequel le lecteur est arrivé.
    declarerProvenance(userId);
    // Et, pour un compte qui vient d'être créé, la question qui complète ce
    // que le magasin ne dit pas : « Comment as-tu connu Anecto ? ».
    doitDemanderConnuPar(session!.user).then((poser) => {
      signalerQuestionConnuPar(poser ? 'ouverte' : 'reglee');
      setQuestionConnuPar(poser);
    });
  }, [session]);

  // Un tap sur la notification doit ouvrir l'anecdote, pas l'onglet où
  // l'utilisateur s'était arrêté la veille.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) surReponseNotification(response);
    });

    const listener = Notifications.addNotificationResponseReceivedListener(surReponseNotification);
    return () => listener.remove();
  }, []);

  // Retour au premier plan : le lecteur a peut-être activé les notifications
  // dans les réglages du téléphone. La resynchro ne demande rien, elle
  // n'enregistre le jeton que si la permission est accordée.
  useEffect(() => {
    if (!session?.user?.id) return;
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') syncPushToken();
    });
    return () => sub.remove();
  }, [session?.user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <AuthScreen />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#b3402f',
          tabBarInactiveTintColor: '#888',
          tabBarIcon: ({ focused, color, size }) => {
            const nom = ICONES_ONGLET[route.name];
            return (
              <Ionicons name={focused ? nom : (`${nom}-outline` as any)} size={size} color={color} />
            );
          },
        })}
      >
        <Tab.Screen name={ONGLET_DU_JOUR} component={HomeScreen} />
        <Tab.Screen name="Historique" component={OngletHistorique} />
        <Tab.Screen name="Réglages" component={SettingsScreen} />
      </Tab.Navigator>
      {questionConnuPar && (
        <ConnuPar
          userId={session.user.id}
          onFerme={() => {
            setQuestionConnuPar(false);
            signalerQuestionConnuPar('reglee');
          }}
        />
      )}
    </NavigationContainer>
  );
}
