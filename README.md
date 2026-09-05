# Anecto

Une anecdote vraie et vérifiée sur ta ville, chaque jour, à l'heure de ton choix.

Les anecdotes sont **rédigées par une IA à partir de sources vérifiables** —
Wikipédia, base Mérimée du ministère de la Culture — et jamais de mémoire. Le
modèle ne dispose que d'un dossier documentaire, il doit recopier mot pour mot
les phrases sur lesquelles il s'appuie, et ces citations sont recherchées dans
la source par comparaison de chaînes : une citation introuvable fait rejeter
l'anecdote. C'est ce qui exclut l'hallucination, plus sûrement qu'une relecture
ne le ferait. La source reste affichée et cliquable dans l'application, sous
chaque anecdote : le lecteur peut toujours remonter au texte d'origine et
vérifier lui-même.

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
src/lib/partage.ts                  texte partagé et feuille de partage système
src/components/CityPicker.tsx       champ ville avec suggestions Google
src/screens/                        AuthScreen, HomeScreen, SettingsScreen, HistoryScreen
src/types/                          types partagés (Profile, Anecdote, CityDetails…)
supabase/functions/city-search/     proxy Google Places (clé côté serveur)
supabase/functions/generate-anecdote/  Wikipédia + Mérimée + DeepSeek → `draft`
supabase/functions/send-daily-notifications/  envoi push, appelé par pg_cron
supabase/functions/delete-account/  suppression de compte (clé de service)
supabase/functions/rapport-quotidien/  rapport du matin par email (pg_cron)
supabase/migrations/                schéma
telecharger/index.html              page d'atterrissage des liens partagés
```

## Connexion

Code numérique reçu par email, pas de lien magique : un lien suppose une URL de redirection
vers l'app, donc un lien profond et une liste blanche qui casse à chaque tunnel
Expo — et il est à usage unique, donc consommé par les scanners de sécurité des
messageries avant que l'utilisateur ne clique.

Côté Supabase, **Authentication → Emails → Magic Link**, le gabarit doit exposer
le code :

```html
<h2>Ton code de connexion Anecto</h2>
<p>Saisis ce code dans l'application :</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Il expire dans une heure.</p>
```

`{{ .Token }}` est le code ; `{{ .ConfirmationURL }}` est le lien, qui n'est plus
utilisé.

La longueur du code est un réglage de projet (**Authentication → Sign In /
Providers → Email OTP Length**, 6 à 10 chiffres). L'écran accepte toute la
plage : rien à changer dans l'app si tu la modifies.

Le service d'email intégré de Supabase est bridé à quelques envois par heure et
ne livre qu'aux membres de l'organisation. Pour tester au-delà, configurer un
SMTP : avec Gmail, `smtp.gmail.com` sur le port 465, l'adresse d'expéditeur
**doit** être celle du compte SMTP, et le mot de passe d'application se saisit
sans les espaces que Google affiche. Gmail plafonne à ~500 envois par jour et
sans SPF/DKIM alignés — pour la production, un service transactionnel avec ton
propre domaine.

## Partage d'une anecdote

Le bouton « Partager » de l'accueil et de l'historique ouvre la feuille de
partage du système avec **l'anecdote entière** en texte brut : ville, accroche,
corps, source cliquable, puis une invitation à créer un compte.

L'anecdote n'est pas tronquée. Une accroche coupée en deux ne se lit pas et
convertit mal ; ce qui protège le corpus, c'est que le partage reste unitaire —
une anecdote à la fois, choisie par un lecteur — là où rouvrir la lecture en
base à `anon` l'exposerait en bloc, ce que la migration
`20260819060000_durcissement_avant_publication.sql` a précisément fermé.

Tout le contenu tient dans `message`, jamais dans `url` : sur iOS, un `url`
fourni à côté fait que certaines destinations ne reprennent que lui et jettent
le texte.

Le lien de l'invitation pointe vers `telecharger/index.html`, publiée par
GitHub Pages depuis ce dépôt comme les pages légales. Une page plutôt qu'une
fiche de magasin : on ne sait pas sur quel système est le destinataire, et la
page se corrige sans republier l'application : les deux fiches de magasin y
sont des liens à changer, pas une version à soumettre.

### Jeton push — un appareil, un compte

`expo_push_token` identifie un téléphone, pas une personne. Il s'écrit par
`enregistrer_jeton_push()`, qui **le retire d'abord à tout autre profil qui le
portait**, et se rend par `oublier_jeton_push()` à la déconnexion.

Ce n'est pas une précaution théorique : trois comptes utilisés sur le même
téléphone en portaient le même exemplaire, et l'appareil recevait les
notifications des trois, chacune à son heure et pour sa ville. Le cron servait
en plus réellement l'anecdote des comptes fantômes, qui entrait dans leur
historique et consommait leur stock pour personne.

L'opération ne peut pas se faire depuis le client : RLS n'autorise chacun à
écrire que sa propre ligne, et libérer le jeton suppose de toucher celle des
autres. D'où une fonction `security definer`, et un `upsert` de profil qui ne
porte plus la colonne.

## Langue de l'application

La fiche App Store affichait « LANGUE : EN, Anglais » alors que tous ses textes
sont en français. Cette ligne ne décrit pas la fiche mais **le binaire** : une
app Expo déclare `en` comme langue de développement tant qu'on ne lui dit rien,
et l'App Store lit cette valeur.

Trois déclarations dans `app.json` la corrigent : `CFBundleDevelopmentRegion` et
`CFBundleLocalizations` dans `ios.infoPlist`, et surtout `locales`, qui fait
naître un dossier `fr.lproj` dans le bundle — c'est lui que l'App Store
inspecte pour lister les langues d'une application.

⚠️ Ces trois valeurs vivent dans le binaire : les changer suppose **un nouveau
build**, une mise à jour OTA n'y touche pas.

## Backend Supabase (projet `anecto`)

Tables : `profiles`, `anecdotes`, `user_anecdote_history`, `feedback`.
RLS activé sur toutes les tables. Voir migration `init_anecto_schema`.

### Migrations

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Une migration s'applique **par `db push`**, jamais par l'éditeur SQL du tableau
de bord ni par un outil qui écrit directement en base. Ce qui est appliqué
autrement s'enregistre sous son horodatage d'exécution, ou ne s'enregistre pas
du tout : le fichier et la ligne d'historique portent alors deux versions
différentes, et `db push` refuse de repartir avec « Remote migration versions
not found in local migrations directory ».

C'est arrivé sur onze des quinze migrations, réparé le 5 septembre 2026 :
versions distantes réalignées sur les noms de fichiers, `produire_lot`
enregistrée après vérification qu'elle était bien en base, et
`20260813162503_init_anecto_schema.sql` restituée au dépôt d'où elle manquait.
Sans ce dernier fichier, un clone ne pouvait pas reconstruire la base.

Si `db push` bute à nouveau, ne lance pas le `migration repair --status
reverted` que la CLI propose : il déclare les migrations comme non appliquées
et le push suivant les rejoue toutes sur une base qui les contient déjà.
Compare d'abord `supabase_migrations.schema_migrations` au contenu de ce
dossier.

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
npx supabase functions deploy send-daily-notifications
npx supabase functions deploy delete-account
npx supabase functions deploy rapport-quotidien
```

## Tests

```bash
npm test
```

Couvre le contrôle des citations et des millésimes (`verification.ts`), qui est
le garde-fou du produit : c'est la seule étape qui distingue une anecdote
soutenue par la source d'une anecdote inventée.

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

L'anecdote est stockée avec l'URL réelle de ses sources, et **toujours en
`status = 'draft'`** : c'est la barrière de publication, décrite plus bas, qui
décide ensuite de la servir ou de la laisser en attente. Un index unique sur
`(city_place_id, lower(title))` empêche les doublons.

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

### Ouverture automatique d'une ville

Demander une ville depuis l'app déclenche désormais toute la chaîne, sans
intervention :

| Étape | Quand | Quoi |
|---|---|---|
| `demander_ville()` | à la demande | enregistre dans `demandes_ville` |
| `produire_villes_demandees(2, 15)` | toutes les heures, à :07 | deux villes au plus, jusqu'à 15 anecdotes chacune |
| `valider_automatiquement(100)` | tous les quarts d'heure | publie ce qui passe la barrière |
| `declencher_alerte_villes_pretes()` | toutes les deux heures, 8 h 30 à 20 h 30 | email « ta ville est prête » |

La barrière de publication tient en trois conditions cumulées, dans
`valider_automatiquement` :

- les citations ont été retrouvées **mot pour mot** dans le dossier
  documentaire — filtre déterministe, appliqué avant même l'insertion ;
- le second passage de vérification rend `verdict = 'confirme'`, et non un
  doute ;
- il rend `confidence = 'haute'`.

Tout ce qui ne coche pas les trois reste en `draft` et attend la relecture
humaine décrite ci-dessous. Le verdict a sa propre colonne depuis cette
bascule : le lire dans la phrase française de `verification_notes` reviendrait
à publier au gré d'une reformulation du prompt.

L'email au lecteur attend **cinq anecdotes validées** dans sa ville, pour qu'il
n'arrive pas sur une ville qu'il épuise le soir même. Une demande de plus de
sept jours abaisse ce seuil à une : certaines villes n'ont pas la matière
documentaire pour en produire cinq, et attendre un seuil qui ne tombera jamais
serait pire que de prévenir sur trois textes.

Pour surveiller ce que la chaîne va produire au prochain passage :

```sql
select * from villes_a_ouvrir(15, 2);
```

### Rapport quotidien — `rapport_quotidien()`

Un email chaque matin à 6 h UTC, vers `ANECTO_ALERT_EMAIL` : lecteurs de la
veille rapportés au nombre de profils, anecdotes lues, lecteurs actifs sur sept
jours, nouveaux comptes, état du stock, brouillons en attente, demandes de
ville non servies.

Il porte surtout une alerte : **les lecteurs à trois anecdotes ou moins de la
fin de leur ville**, en comptant les anecdotes validées qui ne leur ont jamais
été servies. C'est la seule métrique qui prévient d'un départ avant qu'il ait
lieu — un lecteur qui tombe sur « Rien à lire aujourd'hui » ne revient pas le
lendemain. Le sujet de l'email porte le compte, l'ouvrir n'est nécessaire que
les jours où quelque chose cloche.

La journée se juge à Paris et non en UTC, sinon les lectures de 23 h compteraient
pour le lendemain.

### Relecture — `anecdotes_a_valider`

La génération n'écrit qu'en `draft`. Ce qui franchit les trois conditions de la
barrière ci-dessus est publié sans intervention ; **tout le reste attend une
relecture humaine** — un doute à la vérification, une confiance moyenne ou
faible, et la file se remplit. Elle se lit dans le Table Editor de Supabase :

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

### Envoi quotidien — `send-daily-notifications`

pg_cron appelle `declencher_envoi_notifications()` toutes les 15 minutes ; la
fonction lit l'URL et le secret dans Vault, puis appelle l'Edge Function. Celle-ci
demande à `profiles_a_notifier()` qui est dû à cette minute — heure locale de
chaque utilisateur, fenêtre de 15 minutes, passage de minuit géré — réserve leur
anecdote du jour, et pousse vers l'API Expo par lots de 100.

La notification ne porte pas l'anecdote : elle l'annonce. Le texte entier tenait
dans un push, mais il fallait déplier la notification pour le lire, et une fois
lu il n'y avait plus de raison d'ouvrir l'app — donc plus d'historique, plus de
source à vérifier, plus de retours. L'amorce nomme la ville et le titre du jour :

> **C'est l'heure de ton anecdote sur Saint-Malo**
> Aujourd'hui, on découvre « Les chiens du guet ».

Quatre ouvertures tournent selon le quantième, pour que la même phrase ne
revienne pas tous les soirs. Un jeton `DeviceNotRegistered` est effacé du
profil, sinon il ferait échouer chaque envoi suivant. Chaque exécution écrit une
ligne dans `notification_runs` :

```sql
select ran_at, due_count, sent_count, error_count, details
from notification_runs order by ran_at desc limit 20;
```

Planification, une fois `ANECTO_ADMIN_SECRET` posé :

```sql
select vault.create_secret(
  'https://swvhclxwchrhyhtrvmhb.supabase.co/functions/v1', 'anecto_functions_url');
select vault.create_secret('<ANECTO_ADMIN_SECRET>', 'anecto_admin_secret');
select cron.schedule('anecto-notifications', '*/15 * * * *',
                     $job$select public.declencher_envoi_notifications()$job$);
```

### Suppression de compte — `delete-account`

Exigée par l'App Store dès qu'une app permet de créer un compte. L'identité vient
du JWT de l'appelant, jamais du corps de la requête ; supprimer la ligne
`auth.users` suffit, les clés étrangères de `profiles`, `user_anecdote_history`
et `feedback` étant en CASCADE.

## Build & publication

```bash
npx eas login
npx eas build --platform android --profile production   # .aab pour le Play Store
npx eas build --platform ios --profile production       # .ipa pour l'App Store
npx eas submit --platform android
npx eas submit --platform ios
```

Le `projectId` est déjà dans `app.json` (`extra.eas.projectId`) : `eas init`
n'a pas à être relancé, et le relancer casserait le lien avec les builds et
les mises à jour existants.

### Mises à jour à chaud — `eas update`

Une correction qui ne touche qu'au JavaScript n'a pas besoin d'un nouveau
binaire :

```bash
npx eas update --branch production --message "ce qui change"
```

Les appareils la récupèrent au lancement suivant. `fallbackToCacheTimeout: 0`
fait que le démarrage n'attend jamais le réseau : la mise à jour se télécharge
en arrière-plan et s'applique au lancement d'après.

Ce qui **exige** un vrai build : tout ce qui est natif — `app.json`, icônes,
permissions, plugins, ajout d'une dépendance à code natif, changement de SDK.

`runtimeVersion` suit la politique `fingerprint` : Expo calcule une empreinte
du projet natif et n'envoie une mise à jour qu'aux binaires dont l'empreinte
correspond. Un `eas update` ne peut donc pas atterrir sur un build
incompatible — il est simplement ignoré par ceux qui n'ont pas la bonne
empreinte. C'est plus sûr qu'une politique fondée sur le numéro de version,
qu'on oublie de monter.

Chaque profil de `eas.json` porte son canal (`development`, `preview`,
`production`), et `--branch` s'y raccorde. Un `eas update --branch preview`
ne touche donc jamais les binaires de production.

Attention : Google Play et Apple interdisent de modifier *substantiellement*
le comportement d'une application par cette voie. Corriger un texte, un style
ou une requête, oui ; livrer une fonctionnalité entière sans repasser par la
revue, non.

## À faire ensuite

- Planifier le cron (deux `vault.create_secret` + un `cron.schedule`, ci-dessus)
- Traiter les retours : une correction ou une proposition devrait pouvoir
  repasser une anecdote en `draft`, ou en créer une
- `app.json` : `extra.eas.projectId` après `npx eas init`
- Restreindre la lecture des anecdotes à `authenticated` si le corpus est la
  valeur du produit (aujourd'hui `public` : la clé publiable suffit à l'aspirer)
