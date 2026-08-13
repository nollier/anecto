# Anecto

Une anecdote vraie et vérifiée sur ta ville, chaque jour, à l'heure de ton choix.

## Stack

- React Native + Expo (TypeScript)
- Supabase (Auth, Postgres, Edge Functions)
- Expo Notifications (push quotidien)
- React Navigation (bottom tabs)

## Démarrage

```bash
npm install
cp .env.example .env
# renseigner EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env (Project Settings > API sur supabase.com)
npx expo start
```

## Structure

```
App.tsx                 point d'entrée, auth guard + navigation
src/lib/supabase.ts      client Supabase
src/lib/notifications.ts enregistrement token push Expo
src/screens/             AuthScreen, HomeScreen, SettingsScreen, HistoryScreen
src/types/               types partagés (Profile, Anecdote, HistoryEntry)
```

## Backend Supabase (projet `anecto`)

Tables : `profiles`, `anecdotes`, `user_anecdote_history`, `feedback`.
RLS activé sur toutes les tables. Voir migration `init_anecto_schema`.

## Build & publication

```bash
npx eas login
npx eas init                 # récupère le projectId, à coller dans app.json > extra.eas.projectId
npx eas build --platform ios
npx eas build --platform android
npx eas submit --platform ios
npx eas submit --platform android
```

## À faire ensuite

- Edge Function de génération d'anecdote (LLM + recherche web, statut `draft`)
- Interface/process de validation avant passage en `validated`
- Cron (Supabase Cron ou n8n) pour l'envoi de la notif quotidienne par utilisateur selon `notification_hour`
