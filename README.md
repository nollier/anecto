# Anecto

Une anecdote vraie et vérifiée sur ta ville, chaque jour, à l'heure de ton choix.

## Stack

- React Native + Expo (TypeScript)
- Supabase (Auth, Postgres, Edge Functions)
- Google Places API (New) — uniquement pour le choix de la ville
- Wikipédia (API MediaWiki) et base Mérimée (POP, ministère de la Culture) —
  dossier documentaire qui ancre les anecdotes
- DeepSeek — rédaction et vérification des anecdotes, en `draft`
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
supabase/functions/generate-anecdote/  Wikipédia + DeepSeek → anecdote `draft`
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
  DEEPSEEK_API_KEY=... \
  ANECTO_ADMIN_SECRET=$(openssl rand -hex 32)
```

Optionnels : `DEEPSEEK_MODEL` (défaut `deepseek-chat`), `DEEPSEEK_BASE_URL`
(défaut `https://api.deepseek.com`), `ANECTO_PLACES_REGIONS` (ex. `FR,BE,CH`).

⚠️ La clé Google doit être **sans restriction de référent HTTP** : une Edge
Function appelle depuis un serveur, sans référent, et une clé restreinte au
navigateur renvoie `API_KEY_HTTP_REFERRER_BLOCKED`. Laisse « Restrictions
relatives aux applications » sur *Aucune* et restreins uniquement l'API à
*Places API (New)*. La clé n'est jamais livrée dans le bundle de l'app.

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
curl -X POST "https://swvhclxwchrhyhtrvmhb.supabase.co/functions/v1/generate-anecdote" \
  -H "x-anecto-admin-secret: $ANECTO_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"city":"Saint-Malo","cityPlaceId":"ChIJ...","count":3}'
```

Le modèle n'écrit jamais de mémoire. Quatre étapes :

1. **ancrage** — deux sources gratuites et sans clé, interrogées en parallèle :
   - **Wikipédia** : l'article de la ville, « Histoire de <ville> », « Liste des
     monuments historiques de <ville> », et jusqu'à six articles **liés** au
     patrimoine (églises, châteaux, forts, halles…). C'est là qu'est le volume :
     l'article général d'une commune noie trois lignes d'histoire dans la
     démographie, l'article de son château en contient dix fois plus.
   - **Base Mérimée** (Plateforme ouverte du patrimoine) : une notice par
     monument protégé, avec un champ historique — dates de construction,
     commanditaires, remaniements, usages successifs.

   Chaque source a son enveloppe (28 000 caractères pour Wikipédia, 12 000 pour
   Mérimée) : sans réservation, Wikipédia remplirait tout. Si une source échoue,
   l'autre fait le travail ; si les deux sont muettes, la fonction s'arrête là —
   elle ne retombe jamais sur la mémoire du modèle.
2. **rédaction** — DeepSeek écrit à partir de ce dossier et doit recopier
   **mot pour mot** les phrases qui établissent son anecdote.
3. **contrôle** — on vérifie par comparaison de chaînes que chaque citation
   figure réellement dans la source, et que chaque millésime du texte y
   apparaît. Aucun modèle n'intervient ici : c'est du code. Une citation
   introuvable ou une date fabriquée fait rejeter l'anecdote.
4. **vérification** — un second appel DeepSeek relit l'anecdote *face au
   dossier* et rend un verdict `confirme` / `doute` / `refute`. Un `refute`
   bloque l'enregistrement.

L'étape 3 est le vrai garde-fou : elle attrape l'erreur la plus dangereuse du
modèle, le récit plausible avec une date fabriquée. La normalisation tolère les
accents perdus et les apostrophes typographiques, pas l'invention.

L'anecdote est stockée avec l'URL Wikipédia réelle, et **toujours en
`status = 'draft'`** : un extrait d'encyclopédie n'est pas une validation
éditoriale. Un index unique sur `(city_place_id, lower(title))` empêche les
doublons.

La réponse de la fonction renvoie un champ `dossier` listant chaque document
retenu, son origine et son volume : c'est là qu'on voit ce qui a réellement
nourri le modèle.

Pour aller au-delà (presse locale, archives municipales), ajouter une source
revient à écrire un fetcher qui renvoie des `SourceDoc` et à l'inscrire dans
`buildDossier` : le reste de la chaîne ne bouge pas.

**Sur le volume attendu.** Aucune source ne fournit 365 anecdotes par an sur une
commune moyenne. Compter quelques dizaines d'anecdotes racontables par ville,
tous supports confondus — le rythme quotidien suppose donc d'élargir le
périmètre géographique quand une ville est épuisée, ou d'assumer un cycle de
reprise.

### Relecture — `anecdotes_a_valider`

La génération n'écrit qu'en `draft` ; rien n'atteint un lecteur avant relecture
humaine. La file se lit dans le Table Editor de Supabase :

```sql
select * from anecdotes_a_valider;
```

Les brouillons les plus sûrs remontent en premier (`confidence` décroissante).
Pour chacun : lire `verification_notes` (verdict, problèmes signalés, citations
retrouvées automatiquement), ouvrir `source_url`, puis passer `status` à
`validated` — un déclencheur remplit `validated_at` tout seul. Un `rejected`
laisse l'anecdote en base sans jamais la servir.

La vue est en `security_invoker` et révoquée pour `anon` et `authenticated` :
elle n'est lisible qu'avec la clé de service ou depuis le dashboard.

### Sélection quotidienne — `get_daily_anecdote()`

L'app n'orchestre plus rien : un seul `supabase.rpc('get_daily_anecdote')`.
La fonction, en `security definer`, fait dans une seule transaction :

- si l'utilisateur a déjà reçu une anecdote aujourd'hui **dans son fuseau**,
  elle renvoie la même — rouvrir l'app n'en consomme pas une de plus ;
- sinon elle prend la moins servie parmi celles de sa ville qu'il n'a jamais
  lues (`random()` départage les ex aequo), écrit l'historique et incrémente
  `reuse_count` ;
- si deux appareils appellent en même temps, l'index unique
  `(user_id, sent_on)` tranche et le perdant reçoit le choix du gagnant ;
- plus rien à servir renvoie `null`.

`reuse_count` ne peut pas être incrémenté depuis l'app : RLS n'accorde à
`anecdotes` qu'une politique de lecture, sur les lignes `validated`. C'est
précisément pourquoi la sélection vit en base.

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

- Cron (Supabase Cron + pg_net) pour l'envoi de la notif quotidienne par
  utilisateur selon `notification_hour` + `timezone`
- Afficher `source_url` et `period` dans l'app : c'est ce qui rend la promesse
  « vérifiée » contrôlable par le lecteur
- Le bouton « Proposer » n'ouvre pas de champ texte et perd la proposition
- Onboarding ville + heure au premier lancement
- Déconnexion et suppression de compte (exigée par l'App Store)
- Ouvrir l'anecdote du jour au tap sur la notification
