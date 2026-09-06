import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/lib/supabase';
import { syncPushToken } from './src/lib/notifications';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import AnecdoteScreen from './src/screens/AnecdoteScreen';
import AuthScreen from './src/screens/AuthScreen';

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const dernierJetonSynchronise = useRef<string | null>(null);

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
  }, [session]);

  // Un tap sur la notification doit ouvrir l'anecdote, pas l'onglet où
  // l'utilisateur s'était arrêté la veille.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) ouvrirAnecdoteDuJour();
    });

    const listener = Notifications.addNotificationResponseReceivedListener(ouvrirAnecdoteDuJour);
    return () => listener.remove();
  }, []);

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
    </NavigationContainer>
  );
}
