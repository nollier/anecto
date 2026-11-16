# Tester les nouveautés sur iPhone et Android avant publication

## Le principe

On installe sur tes deux téléphones une **version de test** de l'app (profil
`preview` d'EAS), construite depuis `master`. Elle contient déjà tout le
nouveau code. Les vrais utilisateurs ne voient rien : ils restent sur la
version du store tant que tu n'as pas lancé `eas update --channel production`.

Pourquoi pas Expo Go : il ne reçoit plus les notifications push. Or la moitié
des tests porte sur les notifications.

Attention : la version de test parle à la **vraie base Supabase**. On teste
donc avec un **compte de test** créé pour l'occasion, puis supprimé à la fin.

## 1. Préparer ton ordinateur (une fois)

```
git clone https://github.com/nollier/anecto.git   # ou : git pull dans ton dossier existant
cd anecto
git checkout master && git pull
npm ci
npm install -g eas-cli
eas login
```

## 2. Enregistrer ton iPhone (une fois)

Apple n'autorise une version de test que sur les iPhone enregistrés.

```
eas device:create
```

Choisis « Website », ouvre le lien sur l'iPhone et installe le profil proposé
(Réglages > Profil téléchargé > Installer).

Sur iOS 16 et plus, active aussi le mode développeur :
Réglages > Confidentialité et sécurité > Mode développeur > Activé (l'iPhone redémarre).

## 3. Construire et installer la version de test

```
eas build --profile preview --platform all
```

Compte 15 à 30 minutes. À la fin, EAS donne un lien et un QR code par plateforme.

- **iPhone** : ouvre le lien dans Safari, puis Installer.
  Si EAS te demande d'ajouter l'appareil au profil, réponds oui.
- **Android** : ouvre le lien, télécharge l'APK et installe-le
  (autorise « Installer des applications inconnues » pour le navigateur si demandé).
  Si l'app du store est déjà installée, désinstalle-la d'abord : même identifiant.

Pour iPhone, la version de test remplace aussi celle du store. Désinstalle la
version du store avant, puis réinstalle-la après les tests.

## 4. Si tu corriges quelque chose pendant les tests

Pas besoin de reconstruire : envoie seulement le nouveau code aux versions de test.

```
eas update --channel preview --message "correctif test"
```

Ferme complètement l'app puis rouvre-la deux fois : la première ouverture
télécharge, la seconde applique.

## 5. Les tests

Utilise une adresse e-mail de test (par exemple ton adresse avec `+test1`
avant le `@`) pour avoir un **compte neuf** sur chaque téléphone : `+test1`
sur iPhone, `+test2` sur Android.

Pour chaque test : ✅ si conforme, sinon note ce que tu vois. Je vérifie la
base à ta demande (je peux lire les tables directement).

### A. Nouveau compte et notifications
1. Ouvre l'app, crée le compte. **Attendu** : aucune demande de notifications à l'ouverture.
2. **Attendu** : la question « Comment as-tu connu Anecto ? » s'affiche. Choisis une réponse.
3. Va dans Réglages, choisis une ville et une heure, enregistre.
   **Attendu** : bascule sur l'anecdote du jour, toujours aucune demande de notifications.
4. Lis l'anecdote en faisant défiler jusqu'à la source.
   **Attendu** : l'écran « Recevoir ton anecdote chaque matin ? » apparaît.
5. Sur l'iPhone : touche « Oui, je veux la recevoir », puis **Autoriser** dans la fenêtre du système.
   Sur Android : touche « Pas maintenant ».
6. **Attendu** : sur Android, l'écran ne revient pas si tu refais défiler.

### B. J'adore et partage
1. En bas de l'anecdote, touche « J'adore ».
   **Attendu** : la carte « Merci ! Envoyer cette histoire à un proche ? ».
2. Touche « Envoyer à un proche », choisis Messages ou WhatsApp, envoie-le-toi.
   **Attendu** : message court, accroche, ville, lien App Store, lien Google Play, ton code de parrainage.
   Aucun lien nollier.github.io.

### C. Vrai ou faux
1. Dis-moi « prêt pour le quiz » : je place une affirmation de test sur
   l'anecdote du jour de ton compte de test.
2. Tire l'écran vers le bas pour recharger.
   **Attendu** : l'affirmation, deux gros boutons Vrai / Faux, le lien « Passer ».
3. Réponds. **Attendu** : « Bien vu ! » ou « Raté ! », puis l'anecdote complète.
4. En bas, « Partager mon résultat ».
   **Attendu** : « Anecto, [Ville], [date] : j'ai trouvé ✅ Et toi, vrai ou faux ? » + liens, sans la réponse.
5. Recharge l'écran. **Attendu** : la question ne revient pas, le résultat reste affiché.

### D. Rappel du soir (iPhone, notifications autorisées)
1. Dis-moi « prêt pour le rappel » : je règle ton compte de test pour qu'un
   rappel parte dans les 15 minutes, et je remets l'anecdote du jour en « non lue ».
2. **Ne rouvre pas l'app** en attendant.
3. **Attendu** : une notification du type « Ton histoire du jour sur [Ville] t'attend encore ».
4. Touche-la. **Attendu** : l'app s'ouvre sur l'anecdote du jour.
   Je vérifie ensuite en base le rappel envoyé et l'ouverture depuis le push.

### E. Ce qui ne se teste pas facilement ici
- Le texte « Vrai ou faux : une question sur [Ville] t'attend » de la notification
  quotidienne : il faut une anecdote avec quiz servie par la notification.
  On le vérifiera après publication, quand l'équipe aura rempli des affirmations.
- Le cas « iPhone qui a déjà refusé les notifications » (bouton vers les réglages) :
  il faut un refus système puis attendre 7 jours. Le code est en place, à vérifier plus tard.

## 6. Après les tests

1. Dis-moi « fin des tests » : je retire l'affirmation de test.
2. Dans l'app de test : Réglages > Supprimer mon compte, sur chaque téléphone.
3. Désinstalle la version de test, réinstalle Anecto depuis le store.
4. Si tout est ✅ : `eas update --channel production --message "Rappel du soir, partage, Vrai ou faux"`.
