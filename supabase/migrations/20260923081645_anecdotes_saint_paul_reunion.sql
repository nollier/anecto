-- Dix anecdotes de plus pour Saint-Paul (La Réunion).
--
-- La commune compte quinze anecdotes validées, mais cinq d'entre elles parlent
-- d'ailleurs : la chapelle Pauline du Vatican, la basilique Saint-Paul-hors-les-
-- Murs, la maison du Grand Fauconnier de Cordes-sur-Ciel. Le nom « Saint-Paul »
-- est trop partagé pour que la recherche par titre suffise, et le dossier
-- documentaire est parti deux fois à Rome. Les dix anecdotes ci-dessous
-- viennent toutes d'articles rattachés à la commune de l'ouest de La Réunion,
-- vérifiés un par un.
--
-- Apport éditeur, chaque sujet tiré d'un document différent, et aucun ne
-- recoupe ce qui est déjà en base (l'étang, le pont de l'Étang, la Chapelle
-- Pointue, Villèle, la grotte des Premiers Français, la poudrière, le cimetière
-- marin, le Maïdo, Cambaie, l'attaque de 1809) : le directoire élu de 1694, la
-- première femme née dans l'île, la maison de la Chaussée Royale louée
-- quatre-vingt-dix-neuf ans, l'hôpital des incurables devenu maison de maître,
-- l'Éléonore des Poésies érotiques, le journal d'Eugène Dayot, l'auberge de
-- Célimène Gaudieux, la sociétaire de la Comédie-Française née ici, le théâtre
-- de plein air de Saint-Gilles, l'accident des rampes de 1957.
--
-- Les faits sont repris des articles Wikipédia cités en source, relus le
-- 23/09/2026 ; les divergences internes à un article sont consignées dans
-- verification_notes. `on conflict do nothing` sur l'index
-- (city_place_id, lower(title)) rend la migration rejouable.

insert into public.anecdotes
  (city, city_place_id, title, hook, period, body, source_url, sources,
   status, confidence, verification_notes, generated_by, source)
select v.city, v.city_place_id, v.title, v.hook, v.period, v.body,
       v.source_url, v.sources, v.status, v.confidence, v.verification_notes,
       v.generated_by, 'Wikipédia — ' || (v.sources -> 0 ->> 'titre')
  from (values
-- 1 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Les soixante-dix flibustiers',
  $h$Pendant deux ans, l'île entière s'est gouvernée depuis Saint-Paul, avec six élus et sans gouverneur$h$,
  '1694–1696',
  $b$Le 29 avril 1694, les habitants de l'île Bourbon destituent Michel Firelin, qui tenait les commandes depuis novembre 1690. La colonie se retrouve sans autorité. On propose la place à de Prades, capitaine du navire Les Jeux ; trop prudent ou trop pris par son métier de marin, il refuse. Personne d'autre ne se présente.

C'est lui qui suggère alors la solution : puisqu'aucun homme ne veut du poste, qu'on le confie à plusieurs. Ce sera un directoire de personnalités locales, et la population en élira six. Le siège est à Saint-Paul, sur la Côte-sous-le-vent.

Son président s'appelle Athanase Touchard. Né en 1642 à Issy, près de Paris, il est arrivé dans l'île en 1665 avec le groupe d'Étienne Régnault. Il a épousé vers 1676 Élisabeth Hanno, veuve d'Henry Mangrolles, qui lui a donné onze enfants ; il est agriculteur, concessionnaire à La Montagne puis à l'Étang, et prieur de la congrégation du Carmel fondée en 1688. L'imaginaire créole l'a gardé sous le nom de « compère Athanase », parce que la légende veut qu'il ait toujours été d'accord avec la majorité du conseil, quitte à changer d'avis quand la majorité changeait.

En novembre 1695, un navire forban fait escale à Bourbon et y débarque soixante-dix flibustiers cousus d'or et d'argent. Il s'agit sans doute de l'équipage d'Henry Every, qui ne pouvait pas relâcher à Madagascar, y ayant déjà abandonné des compagnons pour éviter de partager le butin en trop de parts. Le Directoire n'a ni les moyens ni la volonté de s'y opposer : ni armement, ni véritable armée. Certains de ces hommes s'installent et font souche — Victor Riverain, Étienne Le Baillif, François Boucher, Jacques Huet, Jacques Picard, Denis Turpin, Claude Ruelle, René Le Pontho, Henri Grimaud, François Garnier.

Le 2 juillet 1696, l'escadre du comte Guillaume d'Aché de Serquigny arrive dans l'île, et le régime s'arrête là. Le 1er août, Joseph Bastide devient gouverneur par intérim. Des pirates, eux, restent : ils sont devenus des colons.$b$,
  'https://fr.wikipedia.org/wiki/Directoire_de_Saint-Paul',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Directoire_de_Saint-Paul","titre":"Directoire de Saint-Paul","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. La chronologie de l'article est incohérente sur un point : elle situe la mort du gouverneur Habert de Vauboulon au 18 août 1692 tout en faisant prendre le pouvoir à Firelin le 26 novembre 1690. Le texte ne raconte pas cette séquence et part de la destitution de 1694, seule date non contestée. L'identification du navire forban à celui d'Henry Every est donnée par l'article comme une probabilité (« sans doute ») et rendue telle quelle.$v$,
  'apport éditeur'
),
-- 2 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'La première née de l''île',
  $h$Cinq ans après le débarquement des premiers colons, une petite fille naît ici, et c'est la première de l'île$h$,
  '1668–1733',
  $b$Le 10 novembre 1663, Louis Payen et un compatriote débarquent pour s'installer à Bourbon. Dix Malgaches les accompagnent, parmi lesquels Jean Mousse, Marie Caze et sa sœur Marguerite. Quatre ans et demi plus tard, le 14 avril 1668, naît à Saint-Paul leur fille Anne Mousse : la première femme née sur l'île.

En 1674, le vice-roi des Indes Jacob Blanquet de la Haye interdit les mariages entre ethnies différentes. Anne Mousse passe outre : en 1687, elle épouse Noël Tessier, un colon français originaire de Bretagne, rescapé du massacre de Fort-Dauphin et son aîné de trente-quatre ans. Le mariage lui vaut d'échapper à la condition d'esclave. Le couple s'installe à Sainte-Marie, de l'autre côté de l'île, et aura huit enfants, dont six filles, puis soixante-cinq petits-enfants.

Veuve en 1721, elle se remarie l'année suivante avec un Portugais né près de Lisbonne, Dominique Ferrère, de vingt ans son cadet. En 1729, femme pieuse, elle lui fait construire une chapelle près de l'endroit où repose son premier mari. À cette époque, élever une chapelle équivalait à doter un quartier d'un édifice public. Il n'en reste aujourd'hui que les fondations, sur lesquelles a été bâtie l'église Notre-Dame-de-l'Assomption.

Elle meurt le 19 mars 1733, à soixante-cinq ans. Sa descendance et celle de sa sœur Cécile, mariée au Malouin Gilles Dugain, et de ses tantes, sont à l'origine des premiers métissages de l'île : on la surnomme la grand-mère des Réunionnais. Les Vidot, Maillot, Guichard, Hoareau, Boyer, Esparon descendent d'elle.

Son nom continue d'être donné à des choses neuves. Une rue à Sainte-Marie, une école maternelle à Saint-Gilles-les-Bains, une crèche à L'Étang-Salé. En mars 2019, une éruption du Piton de la Fournaise forme deux cônes volcaniques : l'un d'eux est baptisé Piton Anne Mousse. Le 16 septembre 2023, la première médiathèque accessible aux non-voyants de Sainte-Marie a pris son nom.$b$,
  'https://fr.wikipedia.org/wiki/Anne_Mousse',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Anne_Mousse","titre":"Anne Mousse","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article orthographie le second mari tantôt « Domingue Ferrero », tantôt « Dominique Ferrère » ; le texte retient la seconde graphie, celle employée pour le mariage de 1722. L'article signale une incertitude sur la présence d'Anne Caze parmi les arrivants de 1663 : cette tante n'est pas citée ici.$v$,
  'apport éditeur'
),
-- 3 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Le bail de quatre-vingt-dix-neuf ans',
  $h$Sur la Chaussée Royale, une maison bâtie par des artisans indiens a été louée un siècle à une association chinoise$h$,
  '1776–2011',
  $b$En 1912, la maison du 233 Chaussée Royale est louée à l'association chinoise Kuo-Min-Tang pour un bail de quatre-vingt-dix-neuf ans, à l'exclusion des dépendances donnant rue Saint-Louis, où est installée l'école catholique Saint-Charles. Le bail ira jusqu'à son terme.

La maison a été construite en 1776 au lieu-dit Saint-Charles par des artisans venus de l'Inde — tailleurs de pierre, charpentiers, menuisiers —, sur les instructions du richissime planteur Henri Panon-Desbassayns, pour le compte de son beau-père Julien Gonneau-Montbrun. On l'appelle maison de type « pondichérien », ou « malabar ». Basalte, briques cuites, toiture enduite à l'argamasse : ces matériaux en font le seul bâtiment de la Chaussée Royale de cette époque à avoir résisté au temps. Sa façade superpose deux varangues à colonnes, avec des arcs ; les dépendances, cuisines, magasins et écuries, sont en basalte.

Elle a servi de modèle à deux autres maisons de la famille : celle de Villèle, aujourd'hui musée, et Maison Blanche au Guillaume, qui abrite un collège privé. La famille n'y venait qu'en villégiature d'hiver, Madame Desbassayns préférant son domaine de Villèle, alors en pleine expansion.

En 1855, les Desbassayns la mettent à disposition de l'évêché de La Réunion. La Grande Cour devient un collège catholique communal, le collège Saint-Charles, qui ferme en 1874 pour raisons financières. En 1885, l'héritière de la maison, petite-fille de Madame Desbassayns, Marie Antoinette Camille Panon Desbassayns, la lègue définitivement à l'évêché avant de quitter l'île.

Après une période d'abandon, d'importants travaux de restauration ont lieu dans les années 1950, à l'initiative du père Antoine Lan Pin Ho, missionnaire chinois qui souhaitait délocaliser l'école franco-chinoise de Saint-Denis. L'école franco-chinoise Saint-Charles fonctionne de 1958 jusqu'aux années 1970. L'Amicale franco-chinoise a pris le relais et y propose encore des cours de mandarin et d'arts martiaux. La maison appartient désormais à la mairie de Saint-Paul, qui l'a rachetée après un passage par un office notarial. Ses façades et toitures sont classées monument historique depuis le 8 octobre 1984, son portail et son jardin à la fontaine inscrits le même jour.$b$,
  'https://fr.wikipedia.org/wiki/Maison_Grand_Cour',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Maison_Grand_Cour","titre":"Maison Grand Cour","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. Le titre de l'article est « Maison Grand Cour », son texte écrit « maison Grande Cour » : le texte emploie « Grande Cour », la forme de l'article. L'échéance du bail (2011) est déduite de 1912 et des quatre-vingt-dix-neuf ans donnés par l'article, qui dit seulement « à l'échéance du bail » ; le corps de l'anecdote ne date donc pas la vente.$v$,
  'apport éditeur'
),
-- 4 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'L''hôpital des incurables',
  $h$Une grande case aux fenêtres murées a été tour à tour hôpital, lazaret, maison de maître et entrepôt de sucre$h$,
  '1772–1948',
  $b$Au lieu-dit « Parc à Jacques », le ministère de la Marine et des colonies fait bâtir en 1772 un hôpital destiné aux malades incurables. C'est la réplique architecturale de celui installé cinq ans plus tôt au sud de Saint-Paul : une bâtisse imposante à un étage, en basalte taillé et bois de natte, couverte de bardeaux.

L'hôpital fonctionne une vingtaine d'années, puis il est vendu à un médecin major, Pierre Fiteau, qui le revend à la Colonie en 1803. Le bâtiment change alors d'usage sans changer de métier : il devient lazaret, où l'on garde les personnes ayant voyagé à bord de bateaux où des malades avaient été déclarés.

Revendu à des particuliers — les Troussail, les Lacaille —, il échoit enfin à Olive Lemarchand, à une époque où la canne à sucre s'impose partout. Lemarchand baptise son domaine Savannah, monte une usine sucrière tout près de la maison et y loge les directeurs successifs. Devant, il aménage un parc décoré de trois viviers. La maison des incurables est devenue la Grande Maison de Savanna.

La Seconde Guerre mondiale isole l'île : les transports sont coupés et le sucre ne part plus. La grande case sert alors à stocker les sacs qu'on ne peut plus exporter. Puis le cyclone de 1948 emporte le toit en bardeaux, remplacé par des feuilles de tôle.

Depuis, elle est inhabitée et fermée, et la plupart de ses fenêtres ont été murées. Elle est inscrite en totalité à l'inventaire supplémentaire des monuments historiques depuis le 22 octobre 1998, terrain d'assiette compris, et appartient à la mairie de Saint-Paul, qui envisage de la réhabiliter pour un usage lié à la réserve naturelle de l'étang, toute proche. Deux siècles et demi après sa construction, le bâtiment attend son sixième métier.$b$,
  'https://fr.wikipedia.org/wiki/Grande_Maison_de_l%27ancien_domaine_sucrier_de_Savanna',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Grande_Maison_de_l%27ancien_domaine_sucrier_de_Savanna","titre":"Grande Maison de l'ancien domaine sucrier de Savanna","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article écrit le nom du domaine « Savannah » et celui de la maison « Savanna » : les deux graphies sont conservées telles quelles. Il ne date pas le rachat par Olive Lemarchand ni la construction de l'usine sucrière ; le texte ne les date pas davantage.$v$,
  'apport éditeur'
),
-- 5 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Esther devenue Éléonore',
  $h$Le recueil le plus lu de la fin du XVIIIe siècle raconte un mariage empêché à L'Hermitage$h$,
  '1753–1778',
  $b$En 1773, un capitaine de vingt ans rentre à l'île Bourbon parce que son père l'a rappelé. Il s'appelle Évariste Désiré de Forges de Parny, il est né le 6 février 1753 à L'Hermitage de Saint-Paul, et il a quitté l'île à neuf ans pour le collège Saint-Thomas de Rennes. Pendant ce séjour, il se découvre des dispositions poétiques et tombe passionnément amoureux d'une jeune personne, Esther Lelièvre. Son père l'empêche de l'épouser.

Il repart pour la métropole en 1775, après avoir écrit à son ami Antoine Bertin qu'il ne saurait se plaire dans un pays où se pratique l'esclavage. Peu après son départ, Esther est mariée à un médecin.

De cette histoire sortent les Poésies érotiques, publiées en 1778, où elle apparaît sous le nom d'Éléonore. Le recueil a d'emblée un grand succès et apporte la célébrité à son auteur. « Je savais par cœur les élégies du chevalier de Parny, et je les sais encore », écrit Chateaubriand en 1813. Pouchkine, qui l'avait en grande estime, disait : « Parny, c'est mon maître ».

Le reste suit sans lui ressembler. En 1777, il rédige l'Épître aux insurgents de Boston pour dire sa solidarité avec ceux qui réclament la liberté. Le 6 novembre 1779, il est nommé capitaine au régiment des dragons de la Reine. Il revient à Bourbon en 1783 pour régler la succession de son père, puis part en 1785 pour Pondichéry comme aide de camp du gouverneur général des possessions françaises dans les Indes. Il déteste l'Inde, mais en rapporte une partie de la matière des Chansons madécasses, parmi les premiers poèmes en prose écrits en français.

La Révolution le ruine presque : les remboursements en assignats emportent ce qui lui restait en 1795, et il vit d'emplois de bureau. Il entre à l'Académie française en 1803, au 36e fauteuil, reçoit en 1813 une pension de 3 000 francs que la Restauration lui supprime l'année suivante, et meurt le 5 décembre 1814. Il est enterré au Père-Lachaise, à onze mille kilomètres de L'Hermitage.$b$,
  'https://fr.wikipedia.org/wiki/%C3%89variste_de_Parny',
  $s$[{"url":"https://fr.wikipedia.org/wiki/%C3%89variste_de_Parny","titre":"Évariste de Parny","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'moyenne',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. La distance de onze mille kilomètres entre Paris et La Réunion ne figure pas dans l'article : c'est un ordre de grandeur géographique, arrondi, et non une donnée reprise de la source. Confiance « moyenne » pour cette seule raison ; tous les autres faits, dates et citations sont dans l'article.$v$,
  'apport éditeur'
),
-- 6 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Publié par ceux qu''il combattait',
  $h$Un poète de Saint-Paul a fini par publier son roman dans le journal des propriétaires d'esclaves$h$,
  '1810–1852',
  $b$En 1839, Eugène Dayot rachète à Raibaud un journal moribond, Le Glaneur, et en fait Le Créole : feuille de l'île Bourbon. Dans ses premiers numéros paraît son poème le plus connu, « Le Mutilé ». Il y mène deux combats à la fois : l'abolition de l'esclavage, une dizaine d'années avant le décret de Victor Schœlcher du 27 avril 1848, et l'abolition de la peine de mort, dans un poème intitulé « La Hache ».

Laurent Joachim Dayot, dit Eugène, naît à Saint-Paul le 8 septembre 1810, fils d'un officier de marine devenu traitant à Madagascar et d'une créole de l'île. À douze ans, sa mère l'envoie au collège Raffray, un institut privé de renom de Saint-Paul. En 1828, il entre à l'administration coloniale des Ponts et Chaussées, démissionne pour rejoindre son père à Madagascar, y passe deux ans. C'est au retour, à vingt ans, qu'apparaissent les premiers symptômes de la lèpre. Son ami Jean-Marie Raffray décrira plus tard « la face meurtrie, le visage sillonné de rides, la vue considérablement affaiblie, les membres mutilés ».

Ses opinions sont mal reçues. Le parti esclavagiste possède la presse, les conseils municipaux et le conseil colonial. En 1843, Dayot est contraint de vendre Le Créole pour cinquante mille francs, et une débâcle commerciale emporte ses gains. Il devient clerc de notaire.

Puis il entre comme feuilletoniste au Courrier de Saint-Paul, journal politique, commercial et littéraire qui défend les propriétaires d'esclaves et affiche en devise : « Toutes les propriétés sont inviolables ». C'est là, en 1848, qu'il publie en feuilleton son roman Bourbon pittoresque — dans les colonnes de ceux contre qui il écrivait neuf ans plus tôt.

Le journal devient Le Bien public, et il y reste rédacteur jusqu'à sa mort, le 19 décembre 1852, à quarante-deux ans. Bourbon pittoresque est resté inachevé. « Aucun enfant au seuil de mes jours éternels / ne viendront recevoir mes adieux paternels », avait-il écrit dans « Le Mutilé ».$b$,
  'https://fr.wikipedia.org/wiki/Eug%C3%A8ne_Dayot',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Eug%C3%A8ne_Dayot","titre":"Eugène Dayot","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. Les deux vers cités sont reproduits avec la faute d'accord (« Aucun enfant… ne viendront ») telle qu'elle figure dans l'article. L'article ne précise pas si Le Bien public a conservé la devise du Courrier de Saint-Paul ; le texte ne l'affirme pas.$v$,
  'apport éditeur'
),
-- 7 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'L''enseigne de l''auberge',
  $h$Sur le fronton de son auberge, une femme née esclave avait fait graver un avertissement aux imbéciles$h$,
  '1807–1864',
  $b$« Hôtel des hommes d'esprit, les imbéciles doivent passer sans s'y arrêter ». La phrase est gravée sur le fronton d'une auberge de La Saline, et c'est son aubergiste qui l'a choisie.

Elle naît esclave à Saint-Paul le 20 avril 1807, et s'appelle alors Marie-Monique. Son père, Louis Edmond Jeance, est un créole blanc affranchi né à Saint-Paul en 1789 ; sa mère, Candide, est une esclave née vers 1790 qu'il affranchit en 1811. Le couple est illégal au regard du Code. Peu après l'arrivée des Anglais dans l'île en 1810, la mère et la fille sont affranchies ; les archives gardent la trace de chaque étape. En 1830, vingt ans plus tard, les parents se marient enfin, et l'acte légitime les deux filles.

Le 3 octobre 1839, elle épouse à Saint-Paul Pierre Gaudieux, né en 1815 à Belvès, en Périgord, arrivé dans l'île deux ans plus tôt comme gendarme colonial. Il démissionne pour devenir maréchal-ferrant au relais de poste de La Saline, et son activité grossit avec le trafic : il finit par dépanner et entretenir les voitures publiques. Le couple ouvre une auberge, que tient sa femme, sur une propriété que lui offre sa mère. Ils auront cinq enfants. En juillet 1852, Pierre Gaudieux meurt pendant l'épidémie de variole qui touche Saint-Paul. Dès novembre, elle loue sa maison de Saint-Paul, ferme la maréchalerie et se concentre sur l'auberge.

Elle a appris à lire et à écrire en suivant, du coin de l'œil, les leçons particulières données aux enfants dans les familles où elle était domestique. Elle écrit des poèmes en français et en créole, en vers et en prose, les met en musique et les chante à la guitare devant ceux qui passent. On l'appelle Célimène, et bientôt la « muse des trois bassins ». Son style est impertinent : elle chante les blancs malhonnêtes.

L'élite lettrée de l'île vient l'écouter — le journaliste Thomy Lahuppe, le linguiste Eugène Volcy Focard, l'historien Elie Pajot, le biographe Jean-Marie Raffray. Le lithographe Antoine Roussin l'inscrit dans son Album de l'île de la Réunion. Elle meurt à Saint-Paul le 13 juillet 1864.$b$,
  'https://fr.wikipedia.org/wiki/C%C3%A9lim%C3%A8ne_Gaudieux',
  $s$[{"url":"https://fr.wikipedia.org/wiki/C%C3%A9lim%C3%A8ne_Gaudieux","titre":"Célimène Gaudieux","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. Le nom du père est orthographié « Jeance » ou « Jans » selon les actes, d'après l'article ; le texte retient la première forme. La filiation avec Évariste de Parny dont Célimène Gaudieux se vantait est signalée « réf. nécessaire » dans l'article et n'est pas reprise ici.$v$,
  'apport éditeur'
),
-- 8 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Le théâtre qui a fermé',
  $h$La petite troupe de Saint-Paul a périclité vers 1847, et la fille du régisseur est entrée à la Comédie-Française$h$,
  '1842–1919',
  $b$Hyppolite Pierson est acteur, doté d'un fort strabisme qui l'a spécialisé dans les rôles comiques, et régisseur du théâtre de Saint-Paul. La salle est animée par la petite troupe locale de M. Petit Welter. Elle périclite, puis se disperse. En 1847, toute la famille Pierson se retrouve en France, le père ayant trouvé, avec l'aide de son ami Victorien Sardou, un emploi dans une troupe de province.

Sa fille Blanche Adeline est née à Saint-Paul le 10 mai 1842, dans une famille de comédiens — son oncle, l'acteur Numa, a joué une trentaine d'années au théâtre du Gymnase. Elle suit son père dans ses tournées, monte sur les planches dès l'âge de onze ans, joue les ingénues en province et au théâtre de Bruxelles. À quatorze ans, elle est engagée à Paris, au théâtre de l'Ambigu, puis au Vaudeville, où on remarque d'abord sa beauté blonde.

Elle entre ensuite au Gymnase, qu'elle ne quittera qu'en 1884, et y tient longtemps les rôles d'ingénue et de coquette. Hors de scène, elle répète tous les jours. Le public finit par s'apercevoir de ses progrès. La bascule a lieu en 1872, lors de la reprise de La Dame aux camélias, où elle joue Marguerite Gautier : « Elle a trouvé des accents d'une tendresse et d'une douleur incomparables », écrit le critique Francisque Sarcey. Alexandre Dumas fils dira d'elle qu'il ne connaît pas une seule comédienne possédant aussi complètement les qualités d'une grande actrice.

En 1884, elle entre à la Comédie-Française et y joue son premier rôle le 19 janvier. En 1886, elle en devient la 313e sociétaire, en interprétant Elmire dans le Tartuffe de Molière. En 1910, elle est admise à siéger au comité de lecture du théâtre.

Elle meurt d'une pneumonie en mars 1919, à soixante-dix-sept ans, sans avoir revu son île natale. Ses amis parisiens étaient, comme elle, des Réunionnais : Leconte de Lisle, Léon Dierx, Ambroise Vollard. Elle est inhumée au cimetière de Passy.$b$,
  'https://fr.wikipedia.org/wiki/Blanche_Pierson',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Blanche_Pierson","titre":"Blanche Pierson","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article ne date pas la dispersion de la troupe de Saint-Paul : il la situe avant le départ de la famille en 1847, d'où le « vers 1847 » de l'accroche. Le prénom du père est orthographié « Hyppolite » dans l'article et repris tel quel.$v$,
  'apport éditeur'
),
-- 9 ---------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Né d''un pique-nique',
  $h$Le théâtre en plein air qui domine Saint-Gilles a été choisi sur un site découvert pendant un pique-nique$h$,
  '1963–1967',
  $b$Michel Debré est élu député de La Réunion en 1963. Grand amateur de théâtre, il veut doter l'île d'un premier équipement culturel de qualité et demande au ministre de la Culture, André Malraux, les moyens d'édifier un théâtre en plein air, dans une zone touristique et peu pluvieuse, relativement proche de Saint-Denis. En décembre 1964, le Conseil général décide de le réaliser à Saint-Gilles-les-Bains.

En 1966, Malraux se tourne vers René Allio, homme de théâtre qui travaille déjà avec l'Atelier d'Urbanisme et d'Architecture, puis confirme la candidature de Jean Tribel, qu'il avait rencontré à l'inauguration de la maison de la culture d'Amiens. Quelques semaines plus tard, Tribel accompagne Debré à La Réunion. C'est au cours d'un pique-nique organisé par le Conseil général qu'il découvre le site à flanc de ravine, d'où l'on aperçoit l'océan Indien. Il y rencontre aussi celui qui sera l'architecte de l'opération, Gilbert Royer.

Royer est suisse d'origine, installé dans l'île depuis 1955 après cinq années passées au Maroc. À partir de 1967, il y développe une architecture néo-brutaliste, et sa très grande connaissance du béton sera précieuse pour ce chantier, mené avec Edwin Quessy, chef de chantier de la SOGEFOM.

Le résultat est un amphithéâtre découvert, entièrement de béton brut, posé sur une crête au-dessus de la station balnéaire, avec des vues plongeantes sur Saint-Gilles et sur l'océan. Il accueille mille personnes, et une seconde scène deux cent cinquante. On l'appelait au départ le « théâtre de verdure » ; il est devenu le théâtre de plein air.

Son jardin a longtemps abrité quelques espèces endémiques de l'île — bois d'Arnette, bois d'Olives, un vieux tamarin, un raisin de mer — mêlées à des plantes venues de l'océan Indien et d'ailleurs. Entre 2020 et 2022, le Département l'a entièrement réaménagé pour lui rendre son caractère de savane, sauvage et naturel. Peu visible depuis l'entrée, le lieu ne se découvre qu'au fil de la marche, à travers la végétation, jusqu'à la billetterie.$b$,
  'https://fr.wikipedia.org/wiki/T%C3%A9at_Plein_Air',
  $s$[{"url":"https://fr.wikipedia.org/wiki/T%C3%A9at_Plein_Air","titre":"Téat Plein Air","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article ne donne ni la date d'ouverture du théâtre ni la durée du chantier : la période s'arrête donc à 1967, année où Gilbert Royer commence à développer son architecture néo-brutaliste dans l'île. Le propriétaire est désigné « Conseil général » puis « Département » selon les passages, comme dans l'article.$v$,
  'apport éditeur'
),
-- 10 --------------------------------------------------------------------
(
  'Saint-Paul',
  'ChIJZxI5LTF-thIRsDhrFiGIBwQ',
  'Les rampes du dimanche',
  $h$Sur la route en lacets qui domine le centre-ville, une croix et une liste de noms rappellent un matin de 1957$h$,
  '1957',
  $b$Le dimanche 10 novembre 1957, il fait beau. À 7 h 30 du matin, un autocar de la Régie des transports descend les rampes, la route en lacets qui surplombe le centre-ville de Saint-Paul. Il est le deuxième d'un convoi affrété par les Œuvres diocésaines du père Favron, qui emmène des paroissiens vers un chantier de Sainte-Anne, à l'autre bout de l'île. Le convoi vient de quitter le lieu-dit Le Guillaume, où toutes les victimes sont domiciliées, à deux exceptions près, dont le chauffeur, originaire du Port.

Dans un virage, les freins lâchent. Le véhicule fait une chute de vingt-cinq mètres et s'écrase au pied de la falaise. Le bruit s'entend à des centaines de mètres à la ronde. Un employé de la mairie, M. Louisin, marche alors rue de la Caverne ; il voit le bus plonger dans le vide et reste tétanisé de longs moments avant de reprendre ses esprits.

Les secours s'organisent vite autour du point de chute, où sauveteurs et curieux se mêlent aux passagers du premier autocar, qui s'est arrêté. Vingt-trois personnes sont tuées sur le coup. Douze blessés sont transportés par la municipalité vers l'hôpital Félix-Guyon, à Saint-Denis ; quatre y meurent de leurs blessures. C'est l'accident le plus meurtrier de l'histoire de Saint-Paul, et sans doute de celle de La Réunion.

Le choc est tel que le Journal de l'île de La Réunion ouvre une souscription publique avec les Œuvres sociales diocésaines, en appelant ses lecteurs « à participer aussi largement que possible à cet élan de fraternité humaine et de solidarité réunionnaise ». Des listes circulent dans les établissements privés et dans plusieurs services administratifs. Le mardi 19 novembre, moins de dix jours après l'accident, les deux millions de francs CFA sont dépassés ; la clôture est repoussée de quarante-huit heures. Le samedi 23, la somme a doublé et dépasse quatre millions. La générosité vient aussi de métropole et de Maurice.

Un monument portant tous les noms des victimes et une croix ont été érigés dans les rampes, à l'endroit de la chute. Cinquante ans après, écrivait le quotidien, le drame restait gravé dans la mémoire collective.$b$,
  'https://fr.wikipedia.org/wiki/Accident_des_rampes_de_Saint-Paul',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Accident_des_rampes_de_Saint-Paul","titre":"Accident des rampes de Saint-Paul","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article se contredit sur le bilan : son introduction annonce vingt-sept morts, la section « Bilan et conséquences » vingt-huit, alors que le détail qu'elle donne (vingt-trois tués sur le coup, quatre blessés décédés ensuite) fait vingt-sept. Le texte ne donne pas de total et s'en tient au détail. Les descriptions de l'état des corps, présentes dans l'article, ne sont pas reprises.$v$,
  'apport éditeur'
)
) as v (city, city_place_id, title, hook, period, body, source_url, sources,
        status, confidence, verification_notes, generated_by)
on conflict (city_place_id, lower(title)) do nothing;
