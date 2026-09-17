# Sources documentaires — La Réunion, commune de Saint-Paul

Référentiel de sourcing. Il ne décrit pas ce que la chaîne de génération sait
faire aujourd'hui, mais ce sur quoi une anecdote de Saint-Paul peut légitimement
s'appuyer — que ce soit une Edge Function qui l'interroge ou quelqu'un qui la
consulte.

La distinction compte, parce que l'essentiel de cette liste n'est pas
interrogeable par une machine. Les délibérations municipales et les archives
notariales sont ce qu'il y a de plus riche pour une anecdote inédite, et elles
se consultent sur place ou sur demande. Aucune ne figure sur Wikipédia.

## Comment lire la colonne « accès »

| Mention | Ce que ça veut dire |
|---|---|
| **API** | Interrogeable par une Edge Function, testé, réponse exploitable |
| **API — à revalider** | Testé depuis Supabase sans réponse concluante ; à réessayer depuis la fonction |
| **API — routes introuvables** | Un service existe, mais aucune route publique trouvée |
| **Portail web** | Consultable en ligne par un humain, pas d'API exploitable côté serveur |
| **Sur place / sur demande** | Consultation physique ou requête auprès de l'institution |
| **Imprimé** | Ouvrages, à lire |

État des tests : 17 septembre 2026. Les résultats sont datés parce qu'ils
périment — la route Mérimée fonctionnait avant août 2026.

## Archives

La mine pour l'inédit, et la moins accessible.

| Source | Accès |
|---|---|
| Archives départementales de La Réunion (AD974) — état civil, presse ancienne | Portail web |
| Archives nationales d'outre-mer (ANOM), Aix-en-Provence | Portail web |
| Archives municipales de Saint-Paul — délibérations du conseil, cadastre ancien | Sur place / sur demande |
| Archives diocésaines de La Réunion — registres paroissiaux, baptêmes | Sur place / sur demande |
| FranceArchives | API — inexploitable (voir plus bas) |
| Fonds de la Compagnie des Indes (via ANOM et Lorient) | Sur place / sur demande |

## Presse ancienne numérisée

| Source | Accès |
|---|---|
| Gallica, sélection « La Réunion » | API — à revalider |
| Presse locale ancienne (BnF), portail territorial 974 | Portail web |
| Le Courrier de La Réunion | Portail web |
| Le Journal de l'île de La Réunion (JIR) | Portail web |
| Le Moniteur de La Réunion | Portail web |
| Le Petit Journal de La Réunion | Portail web |
| Almanach de La Réunion | Portail web |

## Bibliothèques et fonds patrimoniaux

| Source | Accès |
|---|---|
| Bibliothèque départementale de La Réunion (Saint-Denis) | Portail web |
| Bibliothèque universitaire de La Réunion — collections Océan Indien | Portail web |
| Catalogue collectif de France (CCFr) | Portail web |
| Bibliothèque nationale de France | Portail web |

## Musées et sites — commune de Saint-Paul en priorité

| Source | Accès |
|---|---|
| Musée historique de Villèle (domaine de Villèle, Saint-Gilles-les-Hauts) | Sur place / sur demande |
| Lazarets de La Grande Chaloupe | Sur place / sur demande |
| Cimetière marin de Saint-Paul | Sur place |
| Musée de Stella Matutina (Saint-Leu) | Sur place / sur demande |
| MADOI — Musée des arts décoratifs de l'océan Indien (Saint-Louis) | Sur place / sur demande |
| Musée Léon Dierx (Saint-Denis) | Sur place / sur demande |
| Saga du Rhum | Sur place / sur demande |

⚠️ Seuls le musée de Villèle et le cimetière marin sont sur la commune de
Saint-Paul. Les autres sont à Saint-Leu, Saint-Louis et Saint-Denis : ils
documentent l'île, pas la ville. Une anecdote qui s'y appuie doit établir le
lien avec Saint-Paul, sans quoi elle tombe sous le motif de rejet « hors
commune » — celui qui a emporté quinze brouillons le 17 septembre 2026.

## Sociétés savantes et médias d'histoire locale

| Source | Accès |
|---|---|
| Société des sciences et arts de La Réunion | Portail web / imprimé |
| Académie de La Réunion | Portail web |
| 7 Lames la Mer (7lameslamer.net) | API — volontairement non branchée (voir « Licences ») |
| Réunionnais du monde | Portail web |
| Le Quotidien de La Réunion | Portail web |
| Témoignages | Portail web |

## Historiens de référence

Imprimé, tous. C'est la voie la plus sûre pour une anecdote solide et la seule
qui ne s'automatise pas du tout.

- Jean Barassin — spécialiste de Saint-Paul
- Prosper Ève — déjà cité en source seconde par l'anecdote « L'interdiction des quilles »
- Sudel Fuma — la longère Sudel-Fuma, à Saint-Paul, porte son nom
- Hubert Gerbeau
- Claude Wanquet
- Michèle Marimoutou

## Bases patrimoniales nationales

| Source | Accès |
|---|---|
| Base Mérimée (monuments historiques) | API — routes introuvables |
| Base Palissy (objets mobiliers) | API — routes introuvables |
| POP, Plateforme ouverte du patrimoine | API — routes introuvables |
| Atlas des patrimoines | Portail web |
| Inventaire général du patrimoine culturel de La Réunion | Portail web |

## Les quatre meilleures pour Saint-Paul

1. **Musée historique de Villèle** — sur la commune, fonds d'habitation
2. **Cimetière marin de Saint-Paul** — pirates, esclaves, notables
3. **Archives départementales de La Réunion** — délibérations, état civil
4. **7 Lames la Mer** — anecdotes déjà rédigées, très bonnes histoires locales

Les deux premières sont déjà exploitées par le corpus, via leurs articles
Wikipédia : « La chapelle des esclaves », « La chapelle de la maîtresse »,
« Le pirate et le poète ». Les fonds eux-mêmes ne le sont pas.

## Ce qui a été testé, et ce que ça a donné

Tests menés le 17 septembre 2026 depuis le réseau de Supabase, c'est-à-dire
dans les conditions d'une Edge Function.

**7 Lames la Mer.** L'API WordPress du site (`/wp-json/wp/v2/posts`) répond et
rend le texte intégral des articles. C'est la seule source de cette liste qui
soit à la fois automatisable et riche. Elle n'est volontairement pas branchée,
pour la raison exposée ci-dessous.

**Gallica.** Deux appels au point d'entrée SRU (`gallica.bnf.fr/SRU`,
`operation=searchRetrieve`) sont restés sans réponse, y compris avec un délai
de 40 secondes. Ce n'est pas la preuve que le service est indisponible : le
départ était `pg_net`, dont le comportement sur les réponses longues diffère de
celui d'une Edge Function. À revalider depuis un `fetch` Deno avant d'en
conclure quoi que ce soit.

**POP / Mérimée / Palissy.** La racine `api.pop.culture.gouv.fr` répond
`{"message":"POPv2 API"}`, donc le service existe. Mais `/search/merimee`,
`/search/merimee/_search` et `/merimee/search` renvoient tous
`{"statusCode":404}`. Les routes de la v2 restent à découvrir, comme le note
déjà `supabase/functions/generate-anecdote/patrimoine.ts` depuis août 2026. Tant
qu'elles ne le sont pas, `fetchPatrimoineDocs` rend un dossier vide et Wikipédia
fait tout le travail.

**FranceArchives.** `/fr/api/search` ne rend pas du JSON mais une page HTML qui
redirige en JavaScript et exige les cookies. Inexploitable depuis un serveur.

## Licences — pourquoi tout ce qui est lisible n'est pas citable

La chaîne ne se contente pas de lire ses sources : elle en **recopie des phrases
mot pour mot**, les vérifie par comparaison de chaînes, et les conserve dans
`verification_notes`. La source est par ailleurs affichée et cliquable sous
chaque anecdote dans l'app.

C'est ce qui rend Wikipédia (CC BY-SA) et les bases du ministère de la Culture
(licence ouverte) utilisables sans autre formalité. Un média de presse ne relève
pas du même régime, même quand son API est publique : 7 Lames la Mer reste donc
une piste de lecture humaine, pas un fetcher.

Brancher une source sous droits supposerait, au choix, un accord avec l'éditeur,
ou de distinguer dans le contrôle les documents qui amorcent un sujet de ceux
qui peuvent être cités — ce que `controler()` ne sait pas faire aujourd'hui,
puisqu'il valide les citations contre la concaténation de tout le dossier.

## Ajouter une source à la chaîne

Quand une source est à la fois interrogeable et citable, l'y brancher revient à
écrire un fetcher qui rend des `SourceDoc` et à l'inscrire dans `buildDossier` —
le reste de la chaîne ne bouge pas. Prévoir une enveloppe de caractères par
origine, comme `MAX_CHARS_WIKIPEDIA` et `MAX_CHARS_MERIMEE` : sans réservation,
la source la plus volumineuse remplit tout le dossier.
