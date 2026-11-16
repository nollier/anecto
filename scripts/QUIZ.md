# Remplir les « Vrai ou faux ? »

Chaque anecdote peut porter une affirmation courte, montrée avant le texte,
avec deux boutons « Vrai » et « Faux ». L'anecdote donne ensuite
l'explication. Sans affirmation, l'anecdote s'affiche normalement.

## Règles de rédaction

- Une phrase de 10 à 200 caractères, simple, lisible par tous.
- La réponse doit se trouver dans le texte de l'anecdote.
- Ne pas recopier l'accroche : elle s'affiche juste après et donnerait la réponse.
- Varier : environ moitié de « vrai », moitié de « faux ».
- Une affirmation fausse doit rester plausible (un chiffre, une date, un lieu modifié).

## Étapes

1. Exporter les anecdotes validées qui n'ont pas encore d'affirmation (option : une ville) :

   ```
   SUPABASE_URL=https://swvhclxwchrhyhtrvmhb.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/quiz.mjs export "Bayonne" > quiz.csv
   ```

2. Ouvrir `quiz.csv` dans Excel, LibreOffice ou Google Sheets (séparateur `;`).
   Remplir les colonnes `affirmation` et `reponse` (`VRAI` ou `FAUX`).
   Laisser vides les lignes qu'on ne traite pas.

3. Vérifier le fichier (rien n'est enregistré) :

   ```
   node scripts/quiz.mjs import quiz.csv
   ```

4. Enregistrer :

   ```
   node scripts/quiz.mjs import quiz.csv --appliquer
   ```

Le fichier doit rester en UTF-8. La clé `service_role` donne tous les droits
sur la base : ne jamais la partager ni la committer.
