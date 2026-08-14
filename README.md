# Anecto

Une anecdote vraie et vérifiée sur ta ville, chaque jour, à l'heure de ton choix.

## Stack

- React Native + Expo (TypeScript)
- Supabase (Auth, Postgres, Edge Functions)
- Google Places API (New) — uniquement pour le choix de la ville
- Claude (Anthropic) avec recherche web — génération des anecdotes en `draft`
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
App.tsx                            point d'entrée, auth guard + navigation
src/lib/supabase.ts                 client Supabase
src/lib/notifications.ts            enregistrement token push Expo
src/lib/places.ts                   client de l'autocomplétion de ville
src/components/CityPicker.tsx       champ ville avec suggestions Google
src/screens/                        AuthScreen, HomeScreen, SettingsScreen, HistoryScreen
src/types/                          types partagés (Profile, Anecdote, CityDetails…)
supabase/functions/city-search/     proxy Google Places (clé côté serveur)
supabase/functions/generate-anecdote/  Claude + recherche web → anecdote `draft`
supabase/migrations/                schéma
```

## Backend Supabase (projet `anecto`)

Tables : `profiles`, `anecdotes`, `user_anecdote_history`, `feedback`.
RLS activé sur toutes les tables. Voir migration `init_anecto_schema`.

### Migrations

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

### Secrets des Edge Functions

Aucune clé tierce ne passe par le bundle de l'app : `EXPO_PUBLIC_*` est lisible
par n'importe qui décompresse l'APK. Les clés vivent côté fonction.

```bash
npx supabase secrets set \
  GOOGLE_MAPS_API_KEY=... \
  ANTHROPIC_API_KEY=... \
  ANECTO_ADMIN_SECRET=$(openssl rand -hex 32)
```

Optionnels : `ANECTO_ANTHROPIC_MODEL` (défaut `claude-opus-5`),
`ANECTO_ANTHROPIC_EFFORT` (défaut `high`), `ANECTO_PLACES_REGIONS` (ex. `FR,BE,CH`).

### Déploiement des fonctions

```bash
npx supabase functions deploy city-search
npx supabase functions deploy generate-anecdote
```

### Choix de la ville — `city-search`

Appelée depuis `CityPicker` avec le JWT de l'utilisateur. Deux actions :
`suggest` (autocomplétion restreinte aux types `locality`,
`administrative_area_level_3`, `postal_town` — jamais une rue ni un commerce)
et `details` (coordonnées + pays). Un `sessionToken` regroupe les frappes d'une
saisie et le `details` final en une seule session facturée par Google.

La ville est stockée sur le profil sous forme de `city_place_id` : c'est la clé
de rattachement des anecdotes. `city` ne sert plus qu'à l'affichage, ce qui
supprime le problème « Paris » ≠ « paris ».

Côté Google Cloud : activer **Places API (New)**, restreindre la clé à cette
seule API et aux IP/serveur qui l'utilisent.

### Génération d'anecdotes — `generate-anecdote`

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/generate-anecdote" \
  -H "x-anecto-admin-secret: $ANECTO_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"city":"Saint-Malo","cityPlaceId":"ChIJ..."}'
```

Claude cherche sur le web côté serveur Anthropic, vérifie, puis appelle un outil
au schéma strict (`titre`, `corps`, `periode`, `sources`, `confiance`,
`notes_verification`). La fonction refuse d'enregistrer en dessous de deux
sources indépendantes, et **écrit toujours en `status = 'draft'`** : rien ne
part en notification sans relecture humaine. Un index unique sur
`(city_place_id, lower(title))` empêche les doublons.

Le modèle par défaut est `claude-opus-5`. Le repli serveur (`fallbacks`) est
activé : si les classificateurs de sûreté refusent une requête, elle est
rejouée automatiquement sur le modèle de repli recommandé.

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

- Interface/process de validation avant passage en `validated`
- Cron (Supabase Cron ou n8n) pour l'envoi de la notif quotidienne par utilisateur
  selon `notification_hour` + `timezone`
- Sélection quotidienne côté serveur (fonction Postgres) : rotation, exclusion de
  l'historique, incrément de `reuse_count` dans une seule transaction
