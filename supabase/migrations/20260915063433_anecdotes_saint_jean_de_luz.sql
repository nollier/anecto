-- Dix anecdotes de plus pour Saint-Jean-de-Luz.
--
-- Le rapport du matin signalait un stock bas : un lecteur n'avait plus qu'une
-- anecdote jamais servie devant lui, sur les douze validées de la ville. En
-- dessous de quatre, `rapport-quotidien` alerte ; à une, le lecteur tombe sur
-- « Rien à lire aujourd'hui » dans trois jours.
--
-- Apport éditeur, comme les huit premières de la ville : la génération
-- automatique tournait en rond sur l'église et la maison de l'Infante, et
-- ramenait des monuments de Bayonne ou de Ciboure — sept anecdotes rejetées
-- pour cette raison. Les dix sujets ci-dessous viennent chacun d'un document
-- différent, aucun n'a déjà servi, et les faits sont repris des articles
-- Wikipédia cités en source, relus le 15/09/2026.
--
-- Le contenu est versionné ici, et pas seulement inséré en base, parce qu'un
-- texte éditorial se relit en diff. `on conflict do nothing` sur l'index
-- (city_place_id, lower(title)) rend la migration rejouable.

-- `source` est la colonne d'origine, antérieure à `sources` : c'est le libellé
-- affiché sous l'anecdote dans l'app. On le dérive du premier document du
-- dossier, celui dont l'anecdote tire son sujet, plutôt que de le recopier.
insert into public.anecdotes
  (city, city_place_id, title, hook, period, body, source_url, sources,
   status, confidence, verification_notes, generated_by, source)
select v.city, v.city_place_id, v.title, v.hook, v.period, v.body,
       v.source_url, v.sources, v.status, v.confidence, v.verification_notes,
       v.generated_by, 'Wikipédia — ' || (v.sources -> 0 ->> 'titre')
  from (values
-- 1 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le peintre de La Ruche',
  $h$À la mairie, une toile de trois mètres a été donnée par un peintre luzien dont Ravel a signé l'épitaphe en musique$h$,
  '1883–1916',
  $b$À la mairie de Saint-Jean-de-Luz, une toile de 143 sur 322 centimètres occupe un mur. Elle s'appelle Le Chevrier, elle date de 1908, et elle n'a pas été achetée : le peintre en fait don à sa ville natale l'année même.

Gabriel Deluc naît le 1er octobre 1883 rue Neuve, l'actuelle rue Tourasse. Léon Bonnat le remarque et le confie en 1898 à Philippe Jolyet, directeur de l'École municipale de dessin de Bayonne. En 1900, il entre dans l'atelier de Bonnat à Paris ; en 1903, il est reçu élève définitif de l'École nationale des beaux-arts.

De 1904 à 1912, il habite La Ruche, la cité d'artistes du 2 passage de Dantzig, dans le XVe arrondissement. Il y vit très misérablement, au milieu de voisins dont personne ne sait encore ce qu'ils deviendront : Ossip Zadkine, Marc Chagall, et surtout Alexandre Altmann, qui devient son ami et passe certains étés au Pays basque avec lui. Le sculpteur lorrain Charles-Arthur Müller, pensionnaire lui aussi, réalise son buste.

Les récompenses suivent. Mention honorable au Salon des artistes français de 1906 pour Intimité, assortie d'un encouragement spécial de 500 francs. En 1910, La Danse est achetée par le mécène Edmond de Rothschild, qui l'offre à la ville de Bayonne. En 1913, le Portrait de Mlle H.C. lui vaut une médaille d'argent et un encouragement spécial de 1 000 francs.

Engagé au début de la Première Guerre mondiale, d'abord comme infirmier, il rejoint les troupes de combat en 1915, devient sergent le 5 mars 1916, sous-lieutenant en juin. Il est tué le 15 septembre 1916 au cours d'une reconnaissance dans le no man's land, à Souain-Perthes-lès-Hurlus. Maurice Ravel lui dédie, à titre posthume, la Forlane, troisième pièce du Tombeau de Couperin.$b$,
  'https://fr.wikipedia.org/wiki/Gabriel_Deluc',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Gabriel_Deluc","titre":"Gabriel Deluc","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 15/09/2026. Toutes les dates, sommes et dimensions figurent dans l'article.$v$,
  'apport éditeur'
),
-- 2 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le corsaire qui saborde sa flotte',
  $h$Une avenue de la ville porte le nom d'un marin qui a coulé lui-même les trois navires qu'il commandait$h$,
  '1727–1808',
  $b$Saint-Jean-de-Luz a une avenue d'Olabaratz, comme elle a une avenue Pellot, une rue Cépé et une rue Duconte, toutes trois de corsaires. Celle-là rappelle une famille qui a donné plusieurs bayles à la ville, et un marin qui a fini par saborder sa propre flottille.

Jean d'Olabaratz naît ici le 20 octobre 1727, fils du corsaire Joannis-Galand d'Olabaratz. Il embarque jeune avec son père, entre au service de la Marine du roi à dix-huit ans, et le seconde sur la frégate Bristol puis sur la corvette Catherine entre 1746 et 1749. Quand le père est nommé capitaine de port à Louisbourg en 1750, le fils y prend les fonctions d'enseigne de port.

En 1756, il commande la frégate Aigle au départ de Rochefort. Aux côtés de l'Outarde, il capture deux navires marchands britanniques pendant la traversée, puis entre dans le golfe du Saint-Laurent par le détroit de Belle Isle et s'échoue près de l'île du Gros Mécatina, sur de mauvaises indications. La Légère, envoyée secourir les naufragés, arrive deux mois après et percute le Bien-Aimé dans une tempête soudaine. Il réquisitionne alors un senau de pêcheurs français, le Roi du Nord, dont la coque crève à proximité de l'île Saint-Barnabé.

On lui confie ensuite la défense navale du lac Champlain, pour retarder au maximum l'avance des troupes britanniques. Trois chebecs sont construits pour lui par Pierre Levasseur : le Muskelonge, la Brochette et l'Esturgeon. Le 12 octobre 1759, bloqué avec sa flottille près du futur Plattsburgh, il réunit ses officiers sur le Muskelonge, décide de saborder les trois bateaux et profite de la nuit pour rejoindre Montréal avec ses hommes.

Les autorités coloniales n'apprécient pas : François Gaston de Lévis lui refuse le commandement d'une goélette. Il rentre en France comme passager, fait naufrage une fois de plus en aval de Québec, repart, et le bâtiment sur lequel il voyage est capturé en mer par un navire britannique qui le débarque prisonnier en Angleterre. Il n'en sera pas moins capitaine de vaisseau en mars 1779, et se retirera brigadier des armées navales en 1786, pour mourir chez lui le 1er février 1808.$b$,
  'https://fr.wikipedia.org/wiki/Jean_d%27Olabaratz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Jean_d%27Olabaratz","titre":"Jean d'Olabaratz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Liste_des_voies_de_Saint-Jean-de-Luz","titre":"Liste des voies de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des extraits Wikipédia relus le 15/09/2026. Les noms de voies (avenue d'Olabaratz, avenue Pellot, rue Cépé, rue Duconte) viennent de la liste des voies, qui qualifie explicitement les trois derniers de corsaires.$v$,
  'apport éditeur'
),
-- 3 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Les feux jumeaux du port',
  $h$Les deux tours qui balisent l'entrée du port sont l'œuvre d'un observateur de tir né à Paris de parents russes exilés$h$,
  '1891–1961',
  $b$Deux feux marquent l'entrée du port : celui de Saint-Jean-de-Luz, dit feu aval, et son jumeau, le phare de Ciboure. Ils sont construits en 1936 sur les plans du même homme, André Pavlovsky. Le phare de Saint-Jean-de-Luz est inscrit au titre des monuments historiques depuis le 8 octobre 1993.

Pavlovsky naît le 7 septembre 1891 dans le 17e arrondissement de Paris, de parents russes exilés en France pour leur opposition au régime tsariste : son père, Isaac Yacovlevitch Pavlovsky, est journaliste ; sa mère, Theodosia Vassilievna Vandacourova, chirurgien-dentiste. Lycée Carnot, puis l'École des beaux-arts de Paris, section architecture, atelier Chifflot.

En 1915, avec ses frères Nicolas et Jean, il s'engage dans la Légion des volontaires russes pour combattre aux côtés des troupes françaises. Il est d'abord conducteur au service des Ambulances russes aux Armées françaises, puis lieutenant d'artillerie, observateur de tir à bord des biplans qui survolent le front. La guerre finie, il achève ses études et participe à la reconstruction du Nord de la France, à Méteren et à Vieille-Chapelle.

Il s'installe sur la côte basque en 1925 et épouse Yvonne Longi en 1930. La clientèle est riche et cosmopolite, et il construit beaucoup : la villa Zortziko pour le violoniste Jacques Thibaud, les villas San Firmin, Santa Barbara et Los Escudos pour Firmin van Bree, Lacostenia pour René et Simone Lacoste. À partir de 1932, il est architecte départemental des Basses-Pyrénées pour l'arrondissement de Bayonne.

Il meurt le 12 février 1961 à Saint-Jean-de-Luz et repose au cimetière ancien de la ville. Il faudra attendre le 15 septembre 2007 pour qu'une plaque rappelle son nom : le maire Peyuco Duhart l'inaugure ce jour-là, pour les Journées du Patrimoine, devant le phare.$b$,
  'https://fr.wikipedia.org/wiki/Phare_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Phare_de_Saint-Jean-de-Luz","titre":"Phare de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Andr%C3%A9_Pavlovsky","titre":"André Pavlovsky","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. Aucune description physique des tours n'est reprise : l'article n'en donne pas.$v$,
  'apport éditeur'
),
-- 4 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'La maison du chef espagnol',
  $h$L'incendie de 1558 n'a épargné qu'une seule maison de la ville, et c'est celle où logeait le chef des occupants$h$,
  'fin du XVe siècle–1996',
  $b$Rue de la République, à trente mètres de la plage, une maison de pierre de trois étages porte une tour, des fenêtres à meneaux ornées de moulures Renaissance et un escalier à vis. Elle date de la fin du XVe siècle, et c'est la seule maison de la ville rescapée de l'incendie de 1558.

La communauté n'a jamais eu d'enceinte. Longtemps propriété des chanoines de la cathédrale de Bayonne, elle ne fait pas véritablement figure de ville avant l'époque moderne, et sa position frontalière lui coûte cher : elle est souvent prise et pillée par les Espagnols. Le siècle commence d'ailleurs mal. La peste apparaît en Labourd, et le 11 avril 1518, alors qu'elle sévit ici, Bayonne « fait inhibition et défense à tous les manants et habitants de la cité et autres étrangers d'aller entretenir des relations au lieu et paroisse de Saint-Jean-de-Luz où les gens sont morts de la peste ».

En 1558, le siège des Espagnols met le feu à la cité. Une seule maison en réchappe, celle où réside le chef du contingent ibérique qui occupe la ville. Ce n'est donc pas la chance qui a sauvé la maison Ezkerrenea, ni la pierre : c'est d'avoir servi de logement à l'occupant.

C'est pour faciliter le mouillage des navires et protéger la baie que le roi Henri IV entreprend ensuite de faire construire le fort de Socoa, sur la commune voisine de Ciboure. La maison, elle, n'a plus rien à craindre du feu : elle traversera le mariage royal, la ruine du port et les tempêtes.

Elle est inscrite aux monuments historiques depuis 1996. C'est une propriété privée : son rez-de-chaussée abrite un restaurant, et l'intérieur est aménagé en appartements. On peut donc dîner dans la seule maison que l'incendie de 1558 ait laissée debout, et y habiter.$b$,
  'https://fr.wikipedia.org/wiki/Maison_Ezkerrenea',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Maison_Ezkerrenea","titre":"Maison Ezkerrenea","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Saint-Jean-de-Luz","titre":"Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. L'article de la commune donne la maison épargnée sans la nommer ; celui de la maison Ezkerrenea la dit « seule maison de la ville rescapée de l'incendie provoqué par le siège des Espagnols en 1558 ». Le rapprochement des deux est explicite dans le texte.$v$,
  'apport éditeur'
),
-- 5 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le casino qui remplace les bains',
  $h$Le bâtiment qui fait face à la baie devait être un établissement de bains : on a tout rogné, sauf le casino$h$,
  '1848–1928',
  $b$Au sortir de la Première Guerre mondiale, ce qu'on projette face à la baie n'est pas une salle de jeux : c'est un établissement de bains. Le projet, confié à William Marcel, inclut un hôtel-casino.

Au début de l'année 1927, il est réduit en taille. On abandonne les bains ; ne restent que le casino, l'hôtel et les boutiques. Le maître d'œuvre change aussi : c'est en définitive Robert Mallet-Stevens qui pilote l'opération. Le casino ouvre en 1928.

L'idée des bains, pourtant, est plus vieille que le projet. Le boulevard qui mène à l'océan s'est d'abord appelé avenue des Bains, en raison de l'installation d'un premier établissement de bains de mer en 1848. Devenu boulevard Thiers, c'est là qu'à la Belle Époque se sont installées les luxueuses villas, les hôtels et le casino.

La même clientèle fait vivre le reste. Près du site de Sainte-Barbe, où l'un des tout premiers parcours de golf du continent a été ouvert, le baron Van Bree, aviateur belge tombé amoureux du Pays basque, crée un motel unique. André Pavlovsky, lui, bâtit pour Firmin van Bree les villas San Firmin, Santa Barbara et Los Escudos, et crée avec lui les Motels Basques, luxueux appartements inspirés des structures hôtelières américaines.

Le bâtiment n'a pas fini de changer. Dans les années 1950, c'est ce même Pavlovsky — l'architecte des deux feux de l'entrée du port — qui est chargé des surélévations destinées à recevoir des appartements : le casino gagne des étages qui n'ont rien à voir avec le jeu. Il fait toujours face à la baie, non loin du port, de la plage et du centre-ville historique, et appartient au groupe Joa. Du projet d'origine, il ne reste que le premier nom du boulevard qui y conduit.$b$,
  'https://fr.wikipedia.org/wiki/Casino_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Casino_de_Saint-Jean-de-Luz","titre":"Casino de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Liste_des_voies_de_Saint-Jean-de-Luz","titre":"Liste des voies de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Andr%C3%A9_Pavlovsky","titre":"André Pavlovsky","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Saint-Jean-de-Luz","titre":"Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'moyenne',
  $v$Rédigée à partir des quatre extraits Wikipédia relus le 15/09/2026. Le dossier nomme séparément « le baron Van Bree » (article de la commune) et « Firmin van Bree » (article Pavlovsky) sans établir qu'il s'agit de la même personne : le texte les juxtapose sans les confondre.$v$,
  'apport éditeur'
),
-- 6 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Suzanne, Le Fanchic, Patchiku',
  $h$Un thonier de 1959 amarré au port a porté deux autres noms avant celui sous lequel il est classé$h$,
  '1959–2006',
  $b$Le Patchiku sort en 1959 du chantier naval Marin, à Ciboure. C'est un ligneur destiné à la pêche au thon, immatriculé BA 294 644 à Bayonne. Il n'a pas toujours porté ce nom : il s'est d'abord appelé Suzanne, puis Le Fanchic, et n'est devenu le Patchiku que dans les années 1980.

On le dit bolincheur parce qu'il sert aussi à la sardine. La bolinche est un filet tournant, archétype de la senne, dont les pêcheurs de Saint-Jean-de-Luz introduisent l'usage entre les deux guerres. Le bateau pratique également la pêche à la palangre.

Tout à bord tient dans quelques mètres. Trois mâts de travail servent à mettre les engins à la mer ; le mât arrière porte le power-block, la grosse poulie qui gère la bolinche. Il peut aussi gréer un foc et un tapecul, voilure de travail qui tient le bateau dans le vent pendant ses dérives en opération de pêche. À l'avant, un poste d'équipage de quatre couchettes ; la cuisine est attenante à la salle des machines.

En 1999, il sert au tournage des Moissons de l'océan, réalisé pour France 2. Le 7 juin 2002, il est classé au titre objet des monuments historiques. Comme l'Aïrosa, il est caractéristique du patrimoine maritime basque, et l'un des derniers exemplaires de la construction traditionnelle de la charpenterie de marine basque.

Il est désarmé en 2003, un an après son classement. L'Association pour la sauvegarde du Patchiku, créée en 2006, décide de le reprendre pour en effectuer la restauration, puis sa valorisation et son entretien, en partenariat avec Itsas Begia. Le port, lui, continue sans lui : il reste spécialisé dans la pêche à l'anchois et au merlu, et la criée n'a pas fermé.$b$,
  'https://fr.wikipedia.org/wiki/Patchiku',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Patchiku","titre":"Patchiku","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Port_de_Saint-Jean-de-Luz","titre":"Port de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. L'anecdote déjà en base sur l'Aïrosa porte sur l'autre bateau classé du port ; celle-ci ne le mentionne que pour situer le Patchiku.$v$,
  'apport éditeur'
),
-- 7 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le stade cédé au jaï-alaï',
  $h$En 1962, le club de football de la ville a perdu son terrain : il fallait la place pour un jaï-alaï$h$,
  '1909–1962',
  $b$Les premiers footballeurs luziens jouent sur la prairie d'Aïce-Leku, sur les hauteurs de Sainte-Barbe, et se changent dans les écuries de M. Bernoville, qui font office de vestiaires. Les précurseurs sont P. Caresson, qui vient de terminer ses études à Manchester, et Indart.

Le club vit deux ans en semi-clandestinité avant d'être déclaré à la sous-préfecture de Bayonne, le 21 septembre 1909, sous le nom d'Arin Sporting Club luzien. Les fondateurs sont François Navaz, Jean Larre et Laurent Althabe. C'est un patronage catholique omnisports : on y pratique le cyclisme, le tennis, la pelote, l'athlétisme, la gymnastique, et même la musique. En 1911, l'Arin gagne son premier trophée en finale contre le FA Bourbaki de Pau, au terrain du Herré, à Salies-de-Béarn, devant 400 personnes — buts de Pouchoulou et Lacarra, un seul de Péninou en face.

Rebaptisé Arin luzien en 1935, le club est le porte-étendard du football basque jusqu'aux années 1980 : sept victoires en championnat de France des patronages, en 1920, 1922, 1923, 1943, 1946, 1947 et 1953.

Puis, en 1962, le terrain est requis pour la construction d'un jaï-alaï, et le club perd son stade. En contrepartie, un nouveau terrain est construit sur le site de la ferme Kechiloa, qui a donné son nom au quartier, puis au terrain. À l'entrée, une plaque « stade Kechiloa » atteste du nom de baptême.

L'échange a laissé des traces des deux côtés. Au stade Kechiloa, l'Arin bat en 1981 Angoulême, alors club professionnel, un à zéro sur un but de Cigarroa, et atteint en 1985-1986 les trente-deuxièmes de finale de la Coupe de France. Au jaï-alaï, chaque été, deux soirées par semaine, le mardi et le jeudi, se disputent les internationaux de cesta punta, qui opposent les meilleurs joueurs professionnels du monde.$b$,
  'https://fr.wikipedia.org/wiki/Arin_luzien',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Arin_luzien","titre":"Arin luzien","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Internationaux_de_cesta_punta_de_Saint-Jean-de-Luz","titre":"Internationaux de cesta punta de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. L'article mêle par endroits l'Arin luzien et le Saint-Jean-de-Luz olympique au sujet du stade du Pavillon bleu : le texte s'en tient à ce qu'il affirme de l'Arin, la perte du terrain en 1962 et l'installation à Kechiloa.$v$,
  'apport éditeur'
),
-- 8 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le tramway jusqu''en 1937',
  $h$Jusqu'en 1937, un tramway venu de Bayonne par la Pointe Sainte-Barbe débouchait sur le boulevard du bord de mer$h$,
  '1848–1937',
  $b$Le boulevard qui relie le centre-ville à l'océan s'est d'abord appelé avenue des Bains, en raison de l'installation d'un premier établissement de bains de mer en 1848. Il est percé entre 1882 et 1886 et rejoint la jetée qui protège la ville des vagues et des tempêtes. À la Belle Époque, il se couvre de luxueuses villas, d'hôtels et d'un casino, et porte le nom d'Adolphe Thiers.

Jusqu'en 1937, un tramway y débouche. Il vient de Bayonne, par la Pointe Sainte-Barbe. Le boulevard, lui, est raccordé à la route nationale 10 en 1913.

Un second axe est percé dans le même mouvement, large de seize mètres. Il s'appelle d'abord boulevard du Marais et sert à désengorger la rue Gambetta — la grande rue, la Karrika Handia, à laquelle des majorités républicaines ont donné le nom du tribun. En 1885, Victor Hugo meurt, et le boulevard du Marais est rapidement rebaptisé de son nom. Lui aussi est raccordé à la RN 10 en 1913.

Les autres noms disent le reste de la ville. Rue du 17 Pluviôse, pour un jour du calendrier républicain lié à la bataille du camp des Sans Culottes, sur la corniche basque, en 1794. Avenue de Lohobiague, pour la famille d'armateurs dont la maison, érigée en 1643 au bord du marais, est connue sous le nom de maison Louis XIV depuis qu'elle a logé le roi. Rue Joannot de Haraneder, pour l'armateur qui fait bâtir vers 1640 la Joanoenia, qu'on appelle depuis la maison de l'Infante.

Et puis les corsaires, qui ont chacun leur voie : avenue Pellot, rue Cépé, rue Duconte, rue Pierre de Chibau, rue Renau d'Élissagaray. Deux boulevards républicains percés pour les baigneurs, cinq rues pour des hommes qui prenaient des navires : le plan de la ville n'a pas choisi.$b$,
  'https://fr.wikipedia.org/wiki/Liste_des_voies_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Liste_des_voies_de_Saint-Jean-de-Luz","titre":"Liste des voies de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Saint-Jean-de-Luz","titre":"Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. Les deux articles divergent sur la date du percement des boulevards : l'article de la commune l'attribue au début du XXe siècle, la liste des voies donne 1882-1886. Le texte retient les dates précises de la liste et ne date pas l'attribution du nom de Gambetta.$v$,
  'apport éditeur'
),
-- 9 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le concours du ttoro',
  $h$La soupe faite des poissons que personne n'avait achetés a maintenant son concours et son inscription au patrimoine$h$,
  'XXe siècle–2013',
  $b$Le ttoro ne vient pas d'une recette : il vient de ce qui restait. Les marins pêcheurs de Saint-Jean-de-Luz, de Ciboure et de Socoa le font à l'origine avec les morceaux de poissons entiers invendus de leur pêche du jour, ou le cuisinent à bord de leurs bateaux. Contrairement aux soupes de poisson, rien n'y est mouliné.

Ce qui entre dedans dépend de la saison : merlu, congre, rouget, grondin, rascasse, vive, lotte, moule, palourde, crevette, langoustine, étrille. Le tout mijote dans un court-bouillon d'huile d'olive et de vin blanc, avec oignon, tomate, poivron rouge, bouquet garni, persil, ail, sel, poivre et piment d'Espelette. On le sert avec des croûtons aillés et de l'aïoli.

Ce plat de fin de journée a désormais son concours. Un week-end de septembre, les Fêtes de la mer et du Ttoro s'ouvrent le samedi par un concours de pêche, puis par deux concours gastronomiques : celui du ttoro à Saint-Jean-de-Luz, celui du sandwich de la mer à Ciboure. Visites des ports, démonstrations nautiques, et le soir, la musique.

Le dimanche ne ressemble à rien de tout cela. La journée s'ouvre par une cérémonie officielle à caractère militaire : anciens combattants, fanfare, levée des drapeaux. La fanfare guide ensuite le cortège jusqu'à l'église, où une messe est célébrée. À la sortie, les officiels, la fanfare et les anciens combattants embarquent pour lancer une gerbe de fleurs à la mer.

C'est de là que tout vient. Jusqu'aux années 1970, les pêcheurs et les ouvriers des conserveries forment la catégorie socio-professionnelle la plus nombreuse de l'agglomération, et la navigation, sans les moyens de communication d'aujourd'hui, emporte régulièrement des marins. Les messes et les processions célébrées avant le départ des campagnes étaient censées les protéger ; elles sont à l'origine de la fête. Les Fêtes de la mer sont inscrites à l'Inventaire du patrimoine culturel immatériel en France depuis 2013. Un repas collectif clôt les festivités.$b$,
  'https://fr.wikipedia.org/wiki/F%C3%AAtes_de_la_mer_%C3%A0_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/F%C3%AAtes_de_la_mer_%C3%A0_Saint-Jean-de-Luz","titre":"Fêtes de la mer à Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Ttoro","titre":"Ttoro","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 15/09/2026. La liste des poissons et des ingrédients est celle de l'article Ttoro, donnée comme variable selon la saison.$v$,
  'apport éditeur'
),
-- 10 --------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le Sultan arrêté à Dublin',
  $h$Un exercice d'entraînement du rugby toulonnais porte le nom d'un Luzien arrêté dans un pub de Dublin en 1920$h$,
  '1890–1951',
  $b$Jean Sebédio naît le 12 décembre 1890 au 10 rue Saint-Jacques, au domicile de ses parents : Alexandre Sebédio, charpentier, et Martine Dithurbide. Il commence par la pelote basque. En 1911, il est champion de France à chistera, associé à son jeune frère et à Pierre Etchebaster, alors âgé de dix-huit ans.

Le rugby est encore naissant quand il le découvre, en 1908. Il joue trois saisons au club d'Hendaye, rejoint Tarbes en 1911, Nîmes en 1917, l'AS Béziers en 1918, puis Carcassonne en 1920, dont il devient l'entraîneur en 1923. Athlète truculent au corps massif, pilier polyvalent capable de jouer en deuxième ou en troisième ligne, il compte onze sélections en équipe de France entre 1913 et 1922 et dispute cinq éditions du Tournoi des cinq nations.

En 1920, l'équipe de France remporte en Irlande sa première victoire dans un match international hors de France. Juste avant, Sebédio est arrêté à Dublin. Son tort : avoir osé entonner La Marseillaise et d'autres chants révolutionnaires dans un pub, en compagnie de supporters indépendantistes irlandais et de deux autres internationaux français, Marcel-Frédéric Lubin-Lebrère et Théophile Cambre.

On le surnomme Le Sultan, du fait de sa participation à la guerre en Syrie. Entre les matchs, il exerce dans le Midi le métier de transporteur camionneur. Son palmarès aurait été plus étoffé sans l'interruption de la Première Guerre mondiale : vice-champion de France avec Tarbes en 1914, sans jouer la finale ; capitaine et vice-champion avec l'US Carcassonne en 1925 ; entraîneur du FC Lézignan vice-champion en 1929.

Il meurt le 12 juin 1951 à Saint-Jean-de-Luz, là où il était né. Son nom, lui, est resté attaché à un exercice : au RC Toulon, on appelle « la Sébédio » une phase d'entraînement dans un tout petit périmètre, qui sollicite les capacités de défense et de combat des joueurs pour développer leur esprit guerrier. Elle a été pratiquée par le club des années 1970 aux années 1990.$b$,
  'https://fr.wikipedia.org/wiki/Jean_S%C3%A9b%C3%A9dio',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Jean_S%C3%A9b%C3%A9dio","titre":"Jean Sébédio","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 15/09/2026. L'article orthographie le nom tantôt Sebédio, tantôt Sébédio ; le corps retient la graphie de l'état civil citée dans l'article, le surnom de l'exercice garde celle du club.$v$,
  'apport éditeur'
)
) as v (city, city_place_id, title, hook, period, body, source_url, sources,
        status, confidence, verification_notes, generated_by)
on conflict (city_place_id, lower(title)) do nothing;
