-- Dix anecdotes de plus pour Saint-Jean-de-Luz.
--
-- La ville compte vingt-deux anecdotes validées, et les articles Wikipédia qui
-- les portent sont épuisés : l'église Saint-Jean-Baptiste en a donné quatre, la
-- page de la commune cinq, le port deux bateaux classés. Une génération
-- automatique relancée sur ce terrain revient sur la maison de l'Infante ou sort
-- de la commune — les sept anecdotes rejetées de la ville le disent toutes.
--
-- Apport éditeur, donc, comme les deux séries précédentes. Les dix sujets
-- ci-dessous viennent chacun d'un document différent, et aucun ne recoupe les
-- vingt-deux anecdotes en base : Hornung et son gentleman-cambrioleur, le
-- Stradivarius de Jacques Thibaud, le Fandango de Ramiro Arrue, la croix de
-- Saint-Louis cherchée chez Jean Dalbarade, la présidence du golf de Chantaco,
-- le titre de rugby gagné dans une fédération dissidente, le moulin de Romardy
-- à Acotz, les conserveries du Fargeot, le cimetière ancien bâti sur une dune,
-- les deux explosions du McDonald's.
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
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le cambrioleur et son beau-frère',
  $h$Au cimetière ancien repose l'Anglais qui a inventé l'exact contraire du héros de son beau-frère$h$,
  '1866–1921',
  $b$Ernest William Hornung meurt d'une pneumonie à Saint-Jean-de-Luz le 22 mars 1921, et il est inhumé au cimetière ancien de la ville. Sa femme lui survit trois ans et repose, elle, à West Grinstead, dans le Sussex : les deux tombes sont séparées par la Manche.

Il naît le 7 juin 1866 à Middlesbrough, huitième enfant de John Peter Hornung, Hongrois émigré en Grande-Bretagne et négociant en bois et en charbon, et d'une Anglaise, Harriet Armstrong. L'enfant est fragile, asthmatique. Après la Uppingham School, dans le comté de Rutland, il part en 1884 pour l'Australie, pour raisons de santé, et y passe deux ans.

De retour en Angleterre, il se lance dans le journalisme et se lie avec Arthur Conan Doyle, qui a créé Sherlock Holmes en 1887. Le 27 septembre 1893, à l'église catholique St. Edward's de Londres, il épouse la sœur de son ami, Constance Aimée Monica Doyle. Le couple partage sa vie entre la France et l'Angleterre.

En 1898, Hornung invente le contraire du détective de son beau-frère : Arthur J. Raffles, gentleman-cambrioleur, dont la première aventure paraît dans le Cassell's Magazine. Comme Holmes a son Watson, Raffles a son faire-valoir, Harry « Bunny » Manders. Le cycle compte vingt-six nouvelles et un roman. Quand Raffles est démasqué au cours d'une tentative de vol pendant une croisière, son auteur le fait plonger du navire pour laisser croire à une noyade — exactement comme Conan Doyle avait précipité Holmes dans les chutes du Reichenbach. Quand l'éditeur Pierre Lafitte commande une nouvelle à Maurice Leblanc, c'est en lui imposant un personnage bâti sur ce modèle : Arsène Lupin paraît en 1905.

Le 6 juillet 1915, Arthur Oscar, leur fils unique, né le 25 mars 1895 et lieutenant au Essex Regiment, est tué à Ypres. Son père compose pour lui le poème Last Post. Il passe le reste de la guerre à accueillir de jeunes soldats au sein de l'YMCA, puis vient mourir ici, à cinquante-quatre ans, dans une ville dont ses livres ne parlent pas.$b$,
  'https://fr.wikipedia.org/wiki/Ernest_William_Hornung',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Ernest_William_Hornung","titre":"Ernest William Hornung","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Cimeti%C3%A8re_ancien_de_Saint-Jean-de-Luz","titre":"Cimetière ancien de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 23/09/2026. La filiation entre Raffles et Arsène Lupin est signalée « réf. souhaitée » dans l'article : le texte la donne telle que l'article la formule, c'est-à-dire comme une commande de l'éditeur, et non comme un emprunt de Leblanc. L'article ne date pas la pneumonie autrement que par le jour de la mort.$v$,
  'apport éditeur'
),
-- 2 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le violon du Mont Cimet',
  $h$Une voie longe la plage au nom d'un violoniste dont le Stradivarius a disparu avec lui dans les Alpes$h$,
  '1880–1953',
  $b$Le 1er septembre 1953, un avion qui emmène Jacques Thibaud en Indochine s'écrase sur le Mont Cimet, près de Barcelonnette, dans les Alpes françaises. Il n'y a aucun survivant. Avec le violoniste et le pianiste René Herbin disparaît un Stradivarius de 1709, le « Baillot », ainsi nommé parce qu'il avait appartenu à Pierre Baillot.

Thibaud naît à Bordeaux le 27 septembre 1880 et apprend le violon avec son père. À treize ans, il entre au Conservatoire de Paris, dans la classe de Martin-Pierre Marsick, aux côtés de Georges Enesco. En 1896, il remporte le premier prix de violon, partagé avec Pierre Monteux. Il débute comme violoniste du rang, sous la direction notamment d'Édouard Colonne, avant de passer soliste.

Blessé pendant la Première Guerre mondiale, il doit réapprendre longuement sa technique. Il devient l'un des grands interprètes de Mozart et forme, avec le violoncelliste Pablo Casals et le pianiste Alfred Cortot, un trio de musique de chambre de réputation internationale. Il enseigne à l'École normale de musique de Paris et à l'Académie Chigiana de Sienne, et fonde en 1943, avec la pianiste Marguerite Long, le concours qui porte leurs deux noms. Eugène Ysaÿe, dont il est l'ami et le disciple, écrit pour lui sa Deuxième sonate.

Le Baillot n'est pas le seul instrument passé entre ses mains : il a aussi joué le Bérou de 1714 et le Colossus de 1716, deux autres Stradivarius, ainsi qu'un François Pique et un Bergonzi qui venaient tous deux d'Ysaÿe. Après l'accident, il reste des enregistrements, et un nom donné à des lieux : le Conservatoire de Bordeaux a été rebaptisé en son honneur.

Sa tombe est au cimetière ancien de Saint-Jean-de-Luz, section D. Une voie qui longe la plage porte son nom. Les promeneurs qui l'empruntent passent devant une plaque de rue sans savoir qu'elle désigne le propriétaire d'un violon de 1709 qui n'a jamais été retrouvé.$b$,
  'https://fr.wikipedia.org/wiki/Jacques_Thibaud',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Jacques_Thibaud","titre":"Jacques Thibaud","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Cimeti%C3%A8re_ancien_de_Saint-Jean-de-Luz","titre":"Cimetière ancien de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 23/09/2026. L'article signale que d'autres sources datent le violon disparu de 1720 plutôt que de 1709 ; le texte retient 1709, la date que l'article donne en premier, et ne tranche pas au-delà. La section D de la sépulture vient de l'article du cimetière ancien.$v$,
  'apport éditeur'
),
-- 3 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le Fandango de la mairie',
  $h$La salle des mariages doit son grand panneau peint à un artiste que la France a interné en 1943$h$,
  '1892–1971',
  $b$En 1925, à l'Exposition internationale des arts décoratifs et industriels modernes de Paris, un peintre de la côte basque reçoit la médaille d'or pour une toile intitulée Yo ou Fandango. Pour le stand du Pays basque français, il exécute avec son frère José deux grands formats de 155 sur 300 centimètres : Baserritarrak, aujourd'hui au musée des Beaux-Arts de Bilbao, et Fandango, destiné à la salle des mariages de la mairie de Saint-Jean-de-Luz.

Ramiro Arrue y Valle naît à Bilbao le 20 mai 1892 dans une famille d'artistes. Son père, Lucas Arrue, collectionneur, vend ses collections — dont un Goya — pour payer les études artistiques de ses fils. À dix-neuf ans, Ramiro monte à Paris suivre les cours de la Grande Chaumière et fréquente Montparnasse : Zuloaga, Francisco Durrio, le sculpteur Bourdelle qui devient son ami, et aussi Picasso, Modigliani, Jean Cocteau. Il expose au Salon des artistes français dès 1911.

Il alterne les hivers parisiens et les étés basques, puis s'installe pour de bon au Pays basque en 1917 avec son frère José. En 1922, avec Philippe Veyrin et le commandant Boissel, il fonde le Musée basque de Bayonne. Il illustre Francis Jammes, le Ramuntcho de Pierre Loti, Joseph Peyré, Jean Poueigh, dessine décors et costumes pour l'Opéra de Bordeaux, peint des murs d'hôtels et de villas, réalise des émaux.

En 1943, il est arrêté avec d'autres Basques espagnols et incarcéré à la citadelle de Saint-Jean-Pied-de-Port : il ne s'était jamais préoccupé de se faire naturaliser. Après la guerre, les commandes diminuent et il continue à peindre avec acharnement. En 1965, il obtient à Saint-Sébastien le premier prix du Paysage basque.

Il meurt d'un cancer du poumon le 1er avril 1971 à Saint-Jean-de-Luz, dans la solitude et le dénuement, et repose au cimetière ancien. L'historien Eugène Goyheneche l'avait surnommé le « Gauguin basque ». Le panneau de trois mètres, lui, est toujours là où l'on se marie.$b$,
  'https://fr.wikipedia.org/wiki/Ramiro_Arrue',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Ramiro_Arrue","titre":"Ramiro Arrue","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article se contredit sur la ville d'installation en 1917 : un passage dit Ciboure, un autre Saint-Jean-de-Luz. Le texte écrit « au Pays basque » et ne tranche pas. La destination du Fandango (salle des mariages de la mairie de Saint-Jean-de-Luz) est, elle, donnée sans ambiguïté.$v$,
  'apport éditeur'
),
-- 4 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'La croix cherchée après sa mort',
  $h$Un corsaire mort ici le dernier jour de 1819 a vu son domicile fouillé sur ordre du roi$h$,
  '1743–1819',
  $b$Jean Dalbarade meurt à Saint-Jean-de-Luz le 31 décembre 1819. Louis XVIII a alors la curiosité de faire chercher à son domicile la croix et le brevet de l'ordre royal et militaire de Saint-Louis que Louis XVI lui avait donnés le 11 août 1787 : il s'agit de savoir s'il les a déposés à sa municipalité, comme l'exigeait le décret du 28 juillet 1793, ou s'il leur en a substitué d'autres, comme beaucoup à cette époque. On ne retrouve qu'une petite croix de Saint-Louis, qu'il avait reprise et portée depuis le retour des Bourbons.

Né à Biarritz le 30 avril 1743, surnommé « Le Bayonnais », il est lieutenant à dix-sept ans et se distingue sur le corsaire Le Labourd, de Saint-Jean-de-Luz, commandé par Pierre Naguille, où il est blessé. Quelques mois plus tard, sur La Minerve de Bayonne, il reçoit deux blessures, l'une à la tête, l'autre au pied, saute le premier à bord de La Jenny de Lancaster — un navire de tonnage deux fois supérieur — et le ramène au port avec six prisonniers, le 30 octobre 1761.

La guerre d'indépendance des États-Unis lui redonne l'occasion de s'illustrer. En 1779, il s'empare d'une frégate britannique après deux heures de combat, puis, la remorquant, croise deux navires ennemis. Une balle de mousquet le frappe au moment où il s'apprête, sabre à la main, à sauter à l'abordage. Gravement atteint, il est capturé, soigné en Grande-Bretagne et échangé en janvier 1780 contre un capitaine britannique. En 1781, il capture plus d'une vingtaine de bâtiments, dont six corsaires.

Adjoint au ministre de la Marine et des Colonies le 1er mars 1793, il devient ministre jusqu'au 2 juillet 1795. Contre-amiral en 1798, commandant d'armes du port de Lorient, il voit le 29 avril un incendie éclater sur le vaisseau de ligne Quatorze Juillet, qui achevait son armement. Le 11 septembre 1798, un conseil de guerre le déclare « incapable de commander, comme convaincu de relâchement et de négligence dans le service ». Il lui restait vingt et un ans à vivre, et une petite croix à porter.$b$,
  'https://fr.wikipedia.org/wiki/Jean_Dalbarade',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Jean_Dalbarade","titre":"Jean Dalbarade","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article se contredit sur la date de nomination au ministère : l'introduction donne le 10 avril 1793, le corps de l'article le 10 avril 1794. Le texte ne retient aucune des deux et s'en tient aux dates non contestées (adjoint le 1er mars 1793, fin de fonctions le 2 juillet 1795).$v$,
  'apport éditeur'
),
-- 5 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'La présidente de Chantaco',
  $h$Le parcours de golf ouvert en 1928 à la sortie de la ville a eu pour présidente une championne britannique$h$,
  '1908–2001',
  $b$En 1924, une jeune fille de seize ans devient la première joueuse étrangère à remporter le British Girls Amateur Golf Championship. Trois ans plus tard, elle est la première étrangère à gagner le British Ladies Amateur Golf Championship, l'un des tournois féminins les plus prestigieux. Sa fille, Catherine Lacoste, le gagnera quarante-deux ans après elle.

Simone Thion de La Chaume naît le 24 novembre 1908 dans le 17e arrondissement de Paris. La même année 1927 où elle s'impose en Grande-Bretagne, elle perd au troisième tour du United States Women's Amateur Golf Championship, face à Alexa Stirling, trois fois championne. Elle rencontre le joueur de tennis René Lacoste à un match de coupe Davis ; ils se marient le 28 juin 1930 et auront trois fils et une fille.

Dès septembre 1939, au déclenchement de la Seconde Guerre mondiale, elle met sa carrière en pause. Elle organise la création de l'ambulance de guerre bénévole de l'hôpital américain de Paris et effectue des missions au profit du service de santé des armées jusqu'à la fin de la bataille de France.

Son père, René Thion de La Chaume, avait fondé en 1928 le golf de Chantaco, à Saint-Jean-de-Luz — l'année même où sa fille accumulait les titres en Grande-Bretagne. À la mort du fondateur, c'est elle qui en reprend la présidence. Un parcours de la côte basque se retrouve ainsi dirigé par la joueuse qui a gagné, la première pour une étrangère, les deux grands championnats amateurs britanniques, le féminin et celui des jeunes filles.

Quarante-deux ans après elle, sa fille Catherine gagne à son tour le British Ladies Amateur. En 1999, la même Catherine crée en hommage à sa mère un trophée qui porte son nom.

Simone Thion de La Chaume meurt à Saint-Jean-de-Luz le 4 septembre 2001, à quatre-vingt-douze ans. Le club de la sortie de la ville, que les automobilistes longent sans le voir, a eu à sa tête la première étrangère à avoir gagné le championnat amateur féminin britannique.$b$,
  'https://fr.wikipedia.org/wiki/Simone_Thion_de_La_Chaume',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Simone_Thion_de_La_Chaume","titre":"Simone Thion de La Chaume","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article ne donne pas l'année de mort de René Thion de La Chaume : le texte écrit « à sa mort » sans la dater. Le trophée créé en 1999 est présenté par l'article comme l'œuvre de sa fille Catherine Lacoste.$v$,
  'apport éditeur'
),
-- 6 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Champion d''une fédération dissidente',
  $h$Le club de rugby de la ville a gagné un championnat de France que la fédération ne reconnaissait pas$h$,
  '1930–1938',
  $b$Le Saint-Jean-de-Luz olympique commence en quatrième série du championnat Côte basque, c'est-à-dire tout en bas. Il enchaîne ensuite les montées : titre de troisième série en 1930, de deuxième série en 1931, de Promotion en 1935.

Entre-temps, il fait parler de lui d'une façon qui ne figure pas dans les palmarès officiels du moment. En 1932, il remporte le championnat de France de l'UFRA, une ligue dissidente de la Fédération française de rugby, avant de revenir dans le giron fédéral. Le titre reste au palmarès du club, sous l'intitulé « championnat de France UFRA B ».

Arrivé au plus haut niveau régional, le club atteint les demi-finales du championnat de France Honneur dès 1938, à peine onze ans après sa fondation, ce qui lui ouvre la première division. La guerre met un terme à cette ascension. Il repart d'assez bas, ne retrouve la deuxième division qu'en 1960 et l'élite qu'en 1968, après un titre de champion de France de D2.

Suivent huit saisons en première division, de 1969 à 1977, et quatre qualifications pour les phases finales. Le club retombe en groupe B une saison en 1978, remonte deux ans en groupe A, puis rejoint le groupe B en 1981 et y remporte le championnat en 1987, en battant Bergerac 16 à 10 à Auch. En 1988, une phase de brassage le renvoie en groupe A ; il en redescend dès la saison suivante.

Les années 1990 se passent en première division groupe B, championnat qui devient Nationale 1 puis, à l'orée des années 2000, Fédérale 1, l'élite du championnat amateur. Le club y reste jusqu'en 2014-2015, redescend en Fédérale 2, et la saison suivante, entraîné par Serge Milhas, survole la division : champion de France 2016 et remontée. Suivent six saisons dans le haut du tableau de la Fédérale 1, avec des quarts de finale en 2017, 2018 et 2019, puis une promotion en Nationale 2 en 2022 et une demi-finale.

Le logo a moins bougé que le niveau de jeu : un ballon de rugby pris dans les serres d'un vautour de la Rhune, dont le dessin actuel reste très proche de celui des premières années du club, à la fin des années 1920.$b$,
  'https://fr.wikipedia.org/wiki/Saint-Jean-de-Luz_olympique_rugby',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Saint-Jean-de-Luz_olympique_rugby","titre":"Saint-Jean-de-Luz olympique rugby","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article ne donne pas d'année de fondation explicite : il écrit « à peine onze ans après sa fondation » à propos de 1938 et situe le premier logo « à la fin des années 1920 ». Le texte reprend ces deux formulations sans en déduire une date.$v$,
  'apport éditeur'
),
-- 7 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Le moulin partagé en quarts',
  $h$À cinq kilomètres du port, un quartier de campings garde le souvenir d'un moulin divisé en trois parts inégales$h$,
  'XVIIe siècle–1839',
  $b$Au XVIIe siècle, le sieur d'Etchebiague possède la moitié des terres d'Acotz. Sur ces terres est bâti le moulin de Romardy, et la propriété du moulin suit une règle curieuse : la moitié au maître d'Etchebiague, un quart aux bourgeois de la ville, un quart aux paysans d'Acotz.

Le moulin devient très tôt la propriété entière des maîtres d'Etchebiague, les d'Olabaratz — la famille qui donne à Saint-Jean-de-Luz neuf bayles entre 1652 et 1757. Ils conservent le domaine trois cents ans, jusqu'en 1839.

Les premiers actes écrits concernant Saint-Jean-de-Luz datent du XIIe siècle, mais le site est habité dès le Paléolithique, et les premiers habitants sédentaires se groupent sur les hauteurs d'Acotz et de Bordagain, baignées à marée haute par les eaux de l'embouchure de la Nivelle. Le fleuve était alors beaucoup plus large qu'aujourd'hui, et se remplissait à marée basse d'une boue noire et épaisse. Les cartes hésitent encore sur le nom : Accotz chez Cassini, Akotz sur l'IGN.

Le quartier reste longtemps un grenier, voué à l'agriculture, et il en garde un aspect semi-rural malgré le déclin du maïs et des pâturages. Une douzaine de campings s'y sont installés, quelques résidences de tourisme et des lotissements aux noms basques — Kokotia, Beraun, Argi Eder, « Belle lumière ». La densité de population reste faible : presque toutes les activités économiques y sont saisonnières, à l'exception d'un bar.

Trois plages bordent le quartier : Lafiténia, Mayarco et Cenitz, la plus septentrionale, partagée avec Guéthary. Lafiténia est connue pour des vagues surfées toute l'année, et Quiksilver, implanté dans la zone d'activité voisine de Jalday, y organise des compétitions de haut niveau. À deux pas de l'accès principal à cette grève se tient depuis 1990 le Donibane Ziburuko Gaztetxea, la maison des jeunes de Saint-Jean et de Ciboure. Le bâtiment n'a pas toujours servi à cela : pendant plusieurs décennies, il a été l'école élémentaire du quartier.$b$,
  'https://fr.wikipedia.org/wiki/Acotz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Acotz","titre":"Acotz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article orthographie la plage tantôt Cenitz, tantôt Sénix ; le texte retient Cenitz, la graphie employée pour l'ancienne gare du tramway. Le partage du moulin (une moitié, deux quarts) est donné tel quel par l'article.$v$,
  'apport éditeur'
),
-- 8 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Les conserveries du Fargeot',
  $h$Un quartier de la ville a vécu du poisson en boîte, avec des ouvriers venus d'Espagne et de Bretagne$h$,
  'XIXe–XXe siècle',
  $b$La chaudière à vapeur change tout. En se généralisant, elle modifie les conditions de la pêche et raccourcit les distances : les bateaux rapportent davantage, et plus vite qu'on ne sait le vendre. De nombreuses usines sont alors construites pour traiter le poisson dans le quartier du Fargeot, et l'essentiel de la main-d'œuvre est importée — d'Espagne, mais aussi de Bretagne.

Saint-Jean-de-Luz devient au début du XXe siècle une ville moderne et pour partie ouvrière. Des majorités républicaines sont élues et administrent la commune ; c'est à elles que la grande rue, la Karrika handia, doit son nom de rue Gambetta.

L'histoire du port est faite de ces renversements. Au XVe siècle, les pêcheurs d'ici explorent les premiers les bancs de Terre-Neuve, et la morue jointe à la baleine fait la prospérité de leur port d'attache. L'enrichissement et l'afflux de population sont tels qu'ils provoquent l'urbanisation de Ciboure, quartier détaché d'Urrugne puis érigé en paroisse. Le couvent des Récollets est même implanté sur le tracé du pont pour apaiser deux communautés souvent rivales.

Puis tout se retourne. En 1713, le traité d'Utrecht abandonne Terre-Neuve à la Grande-Bretagne. À la fin du siècle, la baleine a disparu du golfe de Gascogne et l'Océan a rompu les barres de Socoa et de Sainte-Barbe qui protégeaient la baie. L'année 1789 est marquée par une tempête qui détruit tout un quartier, La Barre, et submerge le couvent des Ursulines.

Le port est aujourd'hui spécialisé dans l'anchois et le merlu, et partagé avec Ciboure. Des chalutiers en partent encore pour l'ouest de l'Afrique et les côtes atlantiques de l'Amérique du Nord, la criée et le mareyage restent importants, et le groupe Olano charge chaque jour du poisson chez les mareyeurs pour livrer Rungis le soir même. De l'industrie de transformation et de conservation, jadis prospère, il ne reste à peu près rien.$b$,
  'https://fr.wikipedia.org/wiki/Port_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Port_de_Saint-Jean-de-Luz","titre":"Port de Saint-Jean-de-Luz","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 23/09/2026. L'article ne date pas la construction des usines du Fargeot autrement que par « le début du XXe siècle » et la généralisation de la chaudière à vapeur ; le texte ne va pas plus loin. Il ne date pas non plus l'attribution du nom de Gambetta à la Karrika handia.$v$,
  'apport éditeur'
),
-- 9 ---------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'La dune sans chapelles',
  $h$Le plus ancien cimetière de la ville n'a presque pas de chapelles, et beaucoup de ses tombes portent des noms étrangers$h$,
  '1857–XXe siècle',
  $b$Le cimetière ancien de Saint-Jean-de-Luz, qu'on appelle aussi cimetière du Calvaire ou Aïcé Errota, ouvre en 1857 sur une hauteur, avec vue sur la Rhune au loin. Il n'accueille plus de nouvelles inhumations, sauf dans les concessions déjà existantes.

Il est bâti sur une pente douce et dominé par un grand calvaire. Il possède encore des tombes anciennes, mais presque aucune chapelle : le sol est une dune, et il ne porte pas ce genre de construction. Une seule fait exception, massive, en forme de pyramide. Quelques stèles discoïdales basques se remarquent au milieu du reste.

Ce qui frappe le plus, ce sont les noms. Un nombre important de sépultures portent des patronymes britanniques ou espagnols, ou des particules. C'est le dépôt d'une époque précise : avant la guerre de 1914-1918, Saint-Jean-de-Luz était une station hivernale prisée des touristes aisés, avant de devenir une station balnéaire de la belle saison. Les hivernants qui mouraient ici y restaient.

On y trouve l'écrivain britannique George Gissing, mort en 1903, et son ami Ernest William Hornung, mort en 1921, l'auteur de Raffles. Des descendants des bijoutiers Chaumet. Le violoniste Jacques Thibaud, en section D, et à quelques pas de là son frère de destin Yves Réal del Sarte, compositeur, tandis que le sculpteur Maxime Réal del Sarte repose en section B, sous un médaillon de Jeanne d'Arc. L'architecte André Pavlovsky, qui a dessiné le phare du port, est là aussi, et Pierre Etchebaster, champion du monde de paume.

Et puis une tombe qui n'était pas prévue pour ce lieu. José Antonio Aguirre, né à Bilbao le 6 mars 1904, président du gouvernement autonome basque pendant la guerre d'Espagne puis en exil, meurt à Paris le 22 mars 1960 après vingt et un ans d'un exil qui l'a mené de Bruxelles à New York en passant par Berlin, Rio, Buenos Aires et Montevideo. Il repose à quelques kilomètres de la frontière qu'il n'a pas pu repasser.$b$,
  'https://fr.wikipedia.org/wiki/Cimeti%C3%A8re_ancien_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Cimeti%C3%A8re_ancien_de_Saint-Jean-de-Luz","titre":"Cimetière ancien de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Jos%C3%A9_Antonio_Aguirre","titre":"José Antonio Aguirre","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 23/09/2026. L'article du cimetière donne Gissing comme y reposant ; l'article qui lui est consacré situe sa mort à Ispoure, et non à Saint-Jean-de-Luz — le texte ne dit donc pas qu'il est mort ici. Yves et Maxime Réal del Sarte étaient frères selon l'article du cimetière, qui précise leurs sections respectives.$v$,
  'apport éditeur'
),
-- 10 --------------------------------------------------------------------
(
  'Saint-Jean-de-Luz',
  'ChIJ25IAan4RUQ0RUJITSBdlBgQ',
  'Deux bonbonnes de treize kilos',
  $h$Un restaurant de chaîne a sauté deux fois en dix mois, la seconde après la condamnation d'un militant$h$,
  '1996–1997',
  $b$Le 17 août 1996, à 4 h 2 du matin, une bonbonne de gaz de treize kilos munie d'un système électrique de mise à feu fait exploser le McDonald's alors en construction à Saint-Jean-de-Luz. La déflagration s'entend à plusieurs kilomètres.

Le 29 mai 1997, à 1 h 28 du matin, une bonbonne de gaz de treize kilos fait exploser une seconde fois le même établissement. L'explosion suit de six jours la condamnation, le 23 mai 1997, de Jean-Noël Garispe, militant d'Iparretarrak, à huit ans de prison.

L'organisation revendique l'attentat le 3 juin 1997. Son communiqué explique que « ce type d'établissement est contraire au développement de notre pays » et ajoute que « ni les insultes ni les lourdes condamnations comme celle infligée à Jean-Noël Garispe n'affaibliront notre détermination ». Elle y réaffirme le choix de la lutte armée et dénonce le mépris de la classe politique envers les institutions et le vote des électeurs.

Iparretarrak — « ceux du Nord » — a été fondée au début des années 1970 dans le Pays basque français par quelques militants, dont Philippe Bidart, et revendique sa première action le 11 décembre 1973. L'organisation regroupe de jeunes militants abertzale qui jugent le parti Enbata trop modéré. Contemporaine d'ETA, elle conserve un fonctionnement autonome et publie un bulletin interne intitulé Ildo, « le sillon ».

Ses cibles disent son programme : les agences immobilières et les résidences touristiques, contre la spéculation qui fait monter le prix des logements ; les agences de travail intérimaire, contre le travail précaire des jeunes ; et ce qu'elle considère comme la folklorisation de la langue et de la culture basques par le tourisme. Un restaurant de chaîne en bord de station balnéaire cochait, de ce point de vue, plusieurs cases à la fois. Il a fallu le reconstruire deux fois.$b$,
  'https://fr.wikipedia.org/wiki/Attentats_contre_le_McDonald%27s_de_Saint-Jean-de-Luz',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Attentats_contre_le_McDonald%27s_de_Saint-Jean-de-Luz","titre":"Attentats contre le McDonald's de Saint-Jean-de-Luz","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Iparretarrak","titre":"Iparretarrak","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 23/09/2026. L'article ne revendique la première explosion au nom d'aucune organisation : seule la seconde l'est, le 3 juin 1997. Le texte respecte cette distinction. L'écart de six jours entre la condamnation et l'explosion est calculé à partir des deux dates données par l'article.$v$,
  'apport éditeur'
)
) as v (city, city_place_id, title, hook, period, body, source_url, sources,
        status, confidence, verification_notes, generated_by)
on conflict (city_place_id, lower(title)) do nothing;
