-- Six anecdotes pour Saint-Malo, cinq pour Lille, sur des thèmes neufs.
--
-- Les deux villes sont déjà fournies — quarante anecdotes validées pour
-- Saint-Malo, trente pour Lille — mais le corpus a pris un pli : à Lille,
-- les trente parlent toutes d'un bâtiment (hôtels particuliers, hospices,
-- couvents, casernes, beffrois) ; à Saint-Malo, les forts, les églises et
-- les malouinières occupent la moitié du lot. Rien sur un métier, une fête,
-- une chanson, une course, une découverte scientifique.
--
-- Les onze sujets ci-dessous sont choisis pour sortir de ce pli, et aucun
-- ne reprend un article déjà cité en base :
--
--   Saint-Malo — les rochers sculptés de Rothéneuf (art brut), la république
--   de 1590 (politique), la première Route du Rhum (sport), Broussais et ses
--   sangsues (médecine), Mahé de La Bourdonnais embastillé (empire colonial),
--   les terre-neuvas (métier de la mer).
--
--   Lille — le barbier Maes sous le siège de 1792 (légende populaire), la
--   braderie (fête), le P'tit Quinquin (chanson), l'institut Pasteur et le
--   BCG (science), le VAL (technique).
--
-- Les faits sont repris des articles Wikipédia cités en source, relus le
-- 25/09/2026 ; les divergences internes à un article sont consignées dans
-- verification_notes. `on conflict do nothing` sur l'index
-- (city_place_id, lower(title)) rend la migration rejouable.

insert into public.anecdotes
  (city, city_place_id, title, hook, period, body, source_url, sources,
   status, confidence, verification_notes, generated_by, source)
select v.city, v.city_place_id, v.title, v.hook, v.period, v.body,
       v.source_url, v.sources, v.status, v.confidence, v.verification_notes,
       v.generated_by, 'Wikipédia — ' || (v.sources -> 0 ->> 'titre')
  from (values
-- Saint-Malo 1 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'Trois cents visages de granit',
  $h$Un prêtre écarté de sa paroisse a taillé la falaise pendant treize ans, et la mer efface lentement son travail$h$,
  '1894–1910',
  $b$En 1894, l'abbé Adolphe Julien Fouéré doit quitter son poste de recteur à Langouët, malgré une pétition de ses paroissiens. On l'envoie comme prêtre habitué à Rothéneuf, à cinq kilomètres de Saint-Malo. Il a cinquante-cinq ans et, jusque-là, une carrière de desservant ordinaire : Paimpont, Guipry, Forges-la-Forêt, Maxent, Langouët.

C'est là qu'il commence à tailler la côte. De la fin 1894 à 1907, treize ou quatorze ans durant, il sculpte plus de trois cents figures directement dans les rochers de granite qui surplombent la mer. Du bas-relief au visage entièrement dégagé, les personnages se confondent avec la pierre. Elles étaient peintes : bleu, jaune clair, grenat, couleur chocolat, certains traits soulignés au goudron. Il ne reste rien de ces couleurs.

Contrairement à ce qu'ont longtemps raconté les guides, ces figures ne représentent pas une famille imaginaire de contrebandiers. L'abbé puisait dans l'actualité qu'il lisait dans les journaux : la guerre du Transvaal lui inspire une saynète où l'on reconnaît le président Krüger et le colonel de Villebois-Mareuil. Il sculpte aussi des saints bretons, Budoc deux fois, saint Yves, mais encore Gargantua, la mère Michel et son chat, une marchande d'huîtres, des scènes de Chine, de Russie et du Japon. Son sujet préféré reste Jacques Cartier, l'homme célèbre de Rothéneuf.

Dans sa maison du bourg, qu'il appelait « Haute Folie » et que l'on connaîtra plus tard comme la Maison de l'Ermite, il taillait le bois : totems, dragons, figures mythologiques, rangés dans des galeries dites « infernale » ou « mystique ». Les cartes postales le montrent assis dans son fauteuil gravé de sa devise, Amor et dolor. Ces sculptures de bois ont disparu, à une date que personne ne sait dire.

En 1907, frappé de paralysie et privé de la parole, il s'arrête. Il meurt le 10 février 1910 et repose au cimetière de Rothéneuf.

Le site, lui, a continué sans lui : plus de 80 000 visiteurs par an dès 1925, encore 40 000 en 2012. Mais le sel, le vent, les embruns, les mousses et le passage des visiteurs rongent la pierre. Une inspection de la direction régionale des affaires culturelles jugeait en juillet 2009 l'état de conservation « alarmant » et la lisibilité des sculptures gravement compromise. Le site est privé, payant, et n'est ni classé ni inscrit aux monuments historiques.$b$,
  'https://fr.wikipedia.org/wiki/Rochers_sculpt%C3%A9s_de_Roth%C3%A9neuf',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Rochers_sculpt%C3%A9s_de_Roth%C3%A9neuf","titre":"Rochers sculptés de Rothéneuf","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article écrit le nom tantôt « Fouéré », tantôt « Fouré » (le surnom d'usage) : le texte retient la forme complète de l'état civil donnée en tête d'article. La durée du chantier est donnée comme « treize ou quatorze ans » et reprise telle quelle. L'article ne dit pas quand les sculptures de bois ont disparu ; le texte ne le dit pas davantage.$v$,
  'apport éditeur'
),
-- Saint-Malo 2 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'Quatre ans sans roi',
  $h$La ville a cessé d'obéir à la France pendant quatre ans, et elle en est sortie sans un seul procès$h$,
  '1590–1594',
  $b$En 1589, Henri IV hérite du royaume. Les Malouins refusent de reconnaître un huguenot pour roi. Leur gouverneur, Honorat du Bueil, prend pourtant son parti et déclare ouvertement qu'il ouvrira grand les portes de la ville au nouveau roi s'il se présente. En Bretagne, le gouverneur, le duc de Mercœur, a choisi le camp inverse, celui de la Sainte-Ligue.

Les notables de Saint-Malo ne veulent ni de l'un ni de l'autre. Le port est florissant, les marchands sont riches, et une guerre civile ruinerait leurs affaires. Ils décident en secret de se débarrasser du gouverneur. Le 11 mars 1590, une cinquantaine de jeunes Malouins donne l'assaut au château et finit par l'emporter au terme d'un combat acharné. Du Bueil et huit de ses hommes y sont tués.

Dans la foulée, le conseil de ville proclame la république de Saint-Malo, « jusqu'à ce que Dieu eût donné à la France un roi catholique ». Il s'arroge tous les pouvoirs : la défense, la justice, le commerce. Le mot est trompeur — les structures de la ville tiennent davantage de l'oligarchie marchande que d'une république au sens moderne.

Le 25 juillet 1593, Henri IV abjure solennellement le protestantisme ; il est couronné le 27 février 1594. La condition posée quatre ans plus tôt est remplie. En avril, la ville envoie une délégation négocier son retour.

Les conditions obtenues sont remarquables pour une cité qui vient de tuer le représentant du roi. L'édit de réduction, signé par Henri IV le 4 octobre 1594 et enregistré par le parlement de Bretagne le 5 décembre, laisse à Saint-Malo tous ses privilèges et franchises, garantit à ses dirigeants qu'ils ne seront pas poursuivis pour ce qui s'est passé depuis 1590, et exonère ses commerçants de taxes pendant six ans.

C'est très probablement de ces quatre années que viennent les devises officieuses de la ville : « Ni Français, ni Breton, Malouin suis », et celle que répètent aujourd'hui les guides, « Malouin d'abord, Breton ensuite... et Français s'il en reste ».$b$,
  'https://fr.wikipedia.org/wiki/R%C3%A9publique_de_Saint-Malo',
  $s$[{"url":"https://fr.wikipedia.org/wiki/R%C3%A9publique_de_Saint-Malo","titre":"République de Saint-Malo","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article orthographie le gouverneur « Honorat du Bueil » en tête puis « Du Beuil » plus loin : le texte retient la première graphie. La réserve sur le caractère oligarchique du régime est celle de l'article lui-même.$v$,
  'apport éditeur'
),
-- Saint-Malo 3 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'Quatre-vingt-dix-huit secondes',
  $h$La première course partie d'ici s'est jouée, après 3 500 milles d'Atlantique, en moins de deux minutes$h$,
  '1975–1978',
  $b$Au printemps 1975, deux hommes déjeunent rue Arsène Houssaye à Paris. Bernard Hass est secrétaire général du syndicat des producteurs de sucre et de rhum des Antilles et cherche une idée pour relancer la filière. En face, Florent de Kersauson, le frère cadet d'Olivier, qu'il a connu à l'université Cornell. La réponse tombe tout de suite : « Mais il faut faire une course à la voile, bien sûr, qui va vers les Antilles, à l'automne. »

Ils vont voir Éric Tabarly, puis Michel Etevenon, qui refuse. Les producteurs guadeloupéens, eux, embarquent : ils mettent 500 000 francs de l'époque sur la table pour récompenser les six premiers. Reste à choisir le port de départ, et c'est là que tout se joue pour Saint-Malo. Les rhumiers penchent pour Bordeaux, port emblématique du sucre et du rhum. Florent de Kersauson se bat pour Saint-Malo, et l'emporte.

En décembre 1976, les Anglais limitent à 17,06 mètres la taille des bateaux admis dans leurs courses. Le 14 décembre, dans L'Équipe, Etevenon — désormais convaincu — annonce une grande course française sans aucune limitation de taille. La société d'organisation est constituée le 14 mars 1978 ; Florent de Kersauson, vingt-huit ans, en est le secrétaire général.

Trente-huit concurrents prennent le départ le 5 novembre 1978. Vingt-quatre seront classés, quatorze abandonneront ou finiront hors temps. Monocoques et multicoques courent ensemble, sans catégorie.

À l'arrivée, après 3 510 milles de route théorique, le trimaran Olympus Photo de Mike Birch devance de quatre-vingt-dix-huit secondes le monocoque Kriter V de Michel Malinovsky. C'est l'édition qui fait basculer la course au large du côté des multicoques.

Elle a aussi son absent. Onze jours après le départ, le 16 novembre, Alain Colas et son trimaran Manureva disparaissent au large des Açores. Ni le bateau ni le corps n'ont jamais été retrouvés.

La course est repartie tous les quatre ans depuis, la ligne tracée un peu à l'ouest de la pointe du Grouin. En 2022, Charles Caudrelier a rallié la Guadeloupe en 6 jours 19 heures 47 minutes et 25 secondes.$b$,
  'https://fr.wikipedia.org/wiki/Route_du_Rhum',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Route_du_Rhum","titre":"Route du Rhum","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article écrit le nom du syndicaliste tantôt « Bernard Hass », tantôt « Bernard Haas » : le texte retient la première graphie, celle de la première occurrence. La ligne de départ est située sur la commune de Cancale, à l'ouest de la pointe du Grouin, ce que le texte dit sans en faire un départ hors Saint-Malo, la course partant bien du port malouin.$v$,
  'apport éditeur'
),
-- Saint-Malo 4 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'L''empereur des sangsues',
  $h$Un enfant de la ville a fait poser des sangsues sur le ventre de la France entière, et la mode a suivi$h$,
  '1772–1838',
  $b$François Broussais naît à Saint-Malo le 14 décembre 1772, d'un père chirurgien de marine — qui a fait campagne à Terre-Neuve sur un navire du comte de Chateaubriand — et d'une mère fille d'apothicaire. Au collège de Dinan, il est le condisciple d'un garçon de quatre ans son aîné, François-René de Chateaubriand, qui se souviendra de lui dans les Mémoires d'outre-tombe : les collégiens se baignaient ensemble dans la Rance, et « M. Broussais fut mordu par d'ingrates sangsues, imprévoyantes de l'avenir ».

La phrase est cruelle parce qu'elle vise juste. Après des parents massacrés par les chouans la nuit de Noël 1795, un embarquement comme chirurgien sur des corsaires, puis la médecine d'Empire d'Austerlitz à l'Espagne, Broussais devient en 1820 premier professeur et médecin en chef du Val-de-Grâce. Il y enseigne une doctrine simple : en pathologie, tout est inflammation, et presque tout part de l'irritation du tube digestif. Le traitement tient en deux gestes, la diète stricte et la saignée locale, c'est-à-dire des sangsues posées sur l'estomac.

Dans les années 1820, la France ne se soigne pratiquement plus autrement. Les pharmaciens et les éditeurs se plaignent de ne plus vendre que du Broussais. En 1824, le pays consomme plus de quatre-vingts millions de sangsues, qu'il faut importer par sacs entiers de Hongrie, de Bohême et de Turquie, arrosées en permanence dans des voitures spéciales. Des inventeurs proposent de petits instruments mécaniques pour reproduire leur action. Un médecin américain résume : « On reconnaît un Français à ses cicatrices de sangsues sur le ventre. » La mode féminine s'en empare avec les « robes à la Broussais », dont les garnitures en virgules violacées ressemblent à des sangsues.

Le système s'effondre en 1832, avec le choléra qui tue plus de dix-huit mille personnes à Paris. Des malades célèbres meurent dans ses bras, dont le président du Conseil Casimir Perier, qui l'avait fait nommer professeur deux ans plus tôt. Broussais attrape lui-même la maladie, sous une forme bénigne.

Il meurt le 17 novembre 1838. Ses obsèques rassemblent les académies en habit vert, les militaires en grand uniforme et une foule de médecins et d'élèves ; les honneurs sont rendus par un régiment de ligne. Une statue lui est élevée au Val-de-Grâce en 1841, payée par plus de mille souscripteurs, jusqu'aux États-Unis, et son corps y est transféré en 1844. À Saint-Malo, l'hôpital porte son nom.$b$,
  'https://fr.wikipedia.org/wiki/Fran%C3%A7ois_Broussais',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Fran%C3%A7ois_Broussais","titre":"François Broussais","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article donne le chiffre de plus de 80 millions de sangsues pour la seule année 1824 ; il est repris tel quel, sans extrapolation. Le texte ne reprend pas l'embarquement supposé de Broussais auprès de Surcouf, que l'article qualifie de « douteux ». Le surnom d'« empereur de la médecine » est celui que l'article lui donne sous la Restauration.$v$,
  'apport éditeur'
),
-- Saint-Malo 5 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'Trois ans à la Bastille',
  $h$Il a pris Madras pour le roi, s'est présenté à Versailles pour être jugé, et a été arrêté la nuit même$h$,
  '1699–1753',
  $b$Bertrand François Mahé de La Bourdonnais naît à Saint-Malo le 11 février 1699, fils d'un armateur et capitaine de navire. Il prend la mer très jeune et entre à dix-neuf ans, en 1718, au service de la Compagnie française des Indes orientales. Capitaine six ans plus tard, il se distingue à la prise de Mahé, sur la côte de Malabar, puis arme pour son propre compte dans la mer des Indes, où il amasse une fortune considérable.

En 1733, il est nommé gouverneur général des Mascareignes ; il prend son poste en 1735. Il équipe l'Isle de France et l'île Bourbon : première sucrerie de l'île au quartier des Pamplemousses, potagers et vergers pour ravitailler les équipages, encouragement du manioc, dont la farine devient la nourriture de base des esclaves. Car il intensifie aussi la traite : l'Isle de France comptait 648 esclaves recensés en 1735, elle en compte 2 612 en 1740. À Bourbon, il durcit la lutte contre le marronnage. Ses grands travaux coûtent cher, et lui valent l'hostilité d'une partie des directeurs de la Compagnie à Paris.

La guerre de Succession d'Autriche lui donne une escadre. Le 6 juillet 1746, il bat à Négapatam une escadre anglaise supérieure en nombre. En septembre, il débarque devant Madras, l'établissement anglais rival de Pondichéry ; les Anglais apportent les clefs de la place, et il entre dans la ville le 21 septembre à la tête de 1 500 hommes, le pavillon fleurdelisé remplaçant celui d'Angleterre sur les tours du fort Saint-Georges, salué de vingt et un coups de canon.

C'est sa victoire qui le perd. Marin de mentalité corsaire, il veut rendre la ville contre rançon. Dupleix, gouverneur général à Pondichéry, veut raser Madras et le fait. La brouille prive les Français d'un succès complet en Inde, et des mémoires partis de Pondichéry dénoncent à Paris le vainqueur comme un traître vendu à l'ennemi.

Destitué, envoyé en mission à la Martinique, La Bourdonnais rentre en Europe sous un faux nom, est reconnu, retenu quelque temps à Londres, puis obtient de gagner la France pour se défendre. Il se rend directement à Versailles et demande des juges. La nuit même, sur ordre du roi, il est arrêté et jeté à la Bastille : c'est le 3 mars 1748.

Il y restera près de trois ans, dont il profite pour écrire ses Mémoires. Le jugement qui le déclare innocent lui ouvre les portes le 3 février 1751. Il en sort paralysé par ses conditions de détention et meurt à Paris le 10 novembre 1753, à cinquante-quatre ans.$b$,
  'https://fr.wikipedia.org/wiki/Bertrand-Fran%C3%A7ois_Mah%C3%A9_de_La_Bourdonnais',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Bertrand-Fran%C3%A7ois_Mah%C3%A9_de_La_Bourdonnais","titre":"Bertrand-François Mahé de La Bourdonnais","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article se contredit sur deux points. La date de la prise de Mahé : l'introduction dit 1724, le corps du texte le nomme capitaine en 1724 et place la prise « l'année suivante » ; le texte ne date donc pas l'épisode. Le délai entre Négapatam (6 juillet 1746) et Madras : l'article écrit « cinq mois plus tard » alors qu'il date le débarquement du 15 septembre 1746 ; le texte s'en tient aux dates. L'article rapporte aussi une citation où La Bourdonnais refuse toute rançon devant Madras, ce qui contredit le reste de l'article sur la rançon négociée : cette citation n'est pas reprise.$v$,
  'apport éditeur'
),
-- Saint-Malo 6 ----------------------------------------------------------
(
  'Saint-Malo',
  'ChIJXb8mIRCBDkgRLeErsq196fg',
  'Les bagnards de la mer',
  $h$Quatre siècles durant, des équipages sont partis d'ici vers un banc de brume où l'on perdait les hommes par deux$h$,
  'XVIe siècle–1992',
  $b$Du XVIe au XXe siècle, chaque année, des navires quittent les côtes françaises pour la morue des Grands Bancs de Terre-Neuve. Saint-Malo est, avec Fécamp et Granville, l'un des grands ports de cette pêche. Au XIXe siècle, plus de dix mille pêcheurs français partent ainsi chaque année. À Saint-Malo, à partir de 1926, l'appareillage est l'occasion de fêtes et de processions.

Deux pêches coexistent. La morue sèche se pratique le long des côtes, avec une centaine d'hommes par navire : on construit des installations sommaires à terre, on pêche en chaloupe, et le poisson est salé puis séché sur les grèves caillouteuses — les graves — par des enfants et des adolescents recrutés dans l'arrière-pays, les graviers, exploités sans ménagement.

La morue verte, dite « pêche errante », se fait au large, six à sept mois d'affilée, avec vingt à trente hommes. À partir de 1873, les chaloupes cèdent la place aux doris, ces bateaux à fond plat que l'on empile sur le pont : deux hommes par doris, à la ligne dérivante, toute la journée. À bord, le traitement est réglé comme une chaîne : les piqueurs vident, les décolleurs coupent tête et tripes, les trancheurs fendent et retirent l'arête, les saleurs empilent en cale.

La première cause de mortalité n'est ni la tempête ni les icebergs : c'est la brume, qui égare les doris. Selon l'historien Éric Rieth, les plus mauvaises années coûtaient la vie à deux cents à quatre cents marins ; un bateau qui coulait, c'était une quarantaine d'hommes, et souvent un père et son fils, un oncle et son neveu dans le même équipage. Un aumônier des pêcheurs, le père Yvon, a donné à son livre de 1946 le titre qui leur est resté : Les Bagnards de la mer. Il avait armé une goélette-hôpital et créé, pour les bancs, une radio nommée Radio-Morue.

L'assistance était venue tard : elle s'organise à partir de 1896 avec la Société des Œuvres de mer, qui arme successivement sept navires-hôpitaux.

Les droits de pêche français sur la côte de Terre-Neuve cessent en 1904. Le dernier voilier terre-neuvier s'arrête en 1951, remplacé par les chalutiers puis les bateaux-usines. Et c'est à Saint-Malo, en 1992, qu'est armé le dernier navire français pour la pêche à Terre-Neuve, le Victor Pleven. La morue avait fini par manquer.$b$,
  'https://fr.wikipedia.org/wiki/Terre-neuvas',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Terre-neuvas","titre":"Terre-neuvas","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article nomme le dernier voilier terre-neuvier tantôt « René Guillon », tantôt « Lieutenant René Guillon » : le texte ne le nomme pas et ne retient que la date d'arrêt, 1951. Les fêtes d'appareillage « à partir de 1926 » sont données par l'article pour Saint-Malo ; le reste de la description du métier vaut pour l'ensemble des ports morutiers, ce que le texte ne masque pas.$v$,
  'apport éditeur'
),
-- Lille 1 ---------------------------------------------------------------
(
  'Lille',
  'ChIJEW4ls3nVwkcRYGNkgT7xCgQ',
  'Le barbier et l''éclat d''obus',
  $h$Sous trente mille boulets rouges, un perruquier a sorti sa chaise dans la rue et rasé quatorze clients$h$,
  '1792–1823',
  $b$Le 29 septembre 1792, le duc Albert de Saxe-Teschen, qui tient la ville assiégée avec treize mille Impériaux, envoie une sommation : il épargnera Lille contre sa reddition. Le général Ruault et le maire André Bonte répondent que les Lillois viennent de renouveler leur serment d'être fidèles à la Nation, de vivre libres ou de mourir, et qu'ils ne sont pas des parjures.

Le bombardement commence le lendemain. En neuf jours, la ville reçoit trente mille boulets rouges et six mille bombes. Le quartier Saint-Sauveur devient le foyer d'un vaste incendie ; plus de deux mille maisons sont détruites ou touchées.

C'est dans ce fracas qu'Adrien Maes entre dans la légende de la ville. Barbier perruquier rue du Vieux Marché aux Moutons, à la limite des paroisses Saint-Sauveur et Saint-Maurice, il est en train de raser un client quand une bombe frappe sa maison. Il installe alors sa chaise dans la rue et, faute d'ustensile, ramasse un éclat d'obus dont il fait un plat à barbe. Il rase ainsi, en riant, quatorze citoyens.

Le geste dit exactement ce que la ville voulait retenir d'elle-même, et la postérité s'en est chargée. L'histoire a inspiré des gravures, des tableaux, une opérette en 1858 — Le Siège de Lille, ou le Barbier Maes —, un char dans le cortège historique de 1882, une étiquette de chicorée, plusieurs chansons dont la plus marquante est celle de Desrousseaux, l'auteur du P'tit Quinquin. En 1883, la rue du Prez est rebaptisée rue du Barbier Maes, et un hebdomadaire satirique lillois, Le Barbier Maës, paraît de 1884 à 1886.

L'homme, lui, a eu une vie moins héroïque que sa journée. Né à Aire-sur-la-Lys en 1761, marié en 1786, il devient agent de change au 118 rue de Paris, s'enrichit, puis se ruine. Il meurt à Lille le 30 avril 1823, au 38 de la rue Basse.

Sa rue d'origine a disparu dans les bombardements de 1914 ; elle correspond aujourd'hui à la portion de la rue du Molinel comprise entre la rue des Augustins et la rue de Tournai. Des boulets de 1792 sont, eux, toujours fichés dans les murs de la ville — la plupart à l'intérieur des habitations, où on les a longtemps gardés comme ornements.$b$,
  'https://fr.wikipedia.org/wiki/Barbier_Maes',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Barbier_Maes","titre":"Barbier Maes","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/Si%C3%A8ge_de_Lille_(1792)","titre":"Siège de Lille (1792)","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 25/09/2026. Le nom du barbier est écrit « Maes », « Maës » et, sur son acte de décès, « Masse » : le texte retient « Maes », la forme du titre de l'article et de la rue. La date de levée du siège varie selon les sources citées (5 octobre dans l'article sur le siège, nuit du 7 au 8 octobre sur l'inscription de la colonne de la Déesse) : le texte ne la donne pas et s'en tient aux neuf jours de bombardement. Le décret de la Convention est daté du 8 octobre par un article et du 12 octobre par l'autre ; il n'est pas repris.$v$,
  'apport éditeur'
),
-- Lille 2 ---------------------------------------------------------------
(
  'Lille',
  'ChIJEW4ls3nVwkcRYGNkgT7xCgQ',
  'Trente-quatre heures sans fermer',
  $h$La plus grande brocante d'Europe descend d'un droit accordé aux domestiques : vendre la nuit les vieilleries de leurs maîtres$h$,
  '1127–2024',
  $b$La première trace écrite date de 1127, dans les récits du chroniqueur Galbert de Bruges. La foire de Lille, ou Franche Foire, se tient alors après l'Assomption sur la place du Marché — les actuelles place du Général-de-Gaulle et place du Théâtre. C'est l'une des cinq foires flamandes, avec Ypres, Bruges, Thourout et Messines, complémentaires des foires de Champagne pour le commerce des tissus. Elle dure trente jours, dont les quinze premiers servent à installer les marchands.

Le nom viendrait d'un détail de 1446 : deux marchands de volailles, Godin Maille et Pierre Tremart, obtiennent l'autorisation de vendre sur la foire des harengs et des poulets cuits. En flamand, rôtir se dit braden.

La transformation en vide-grenier vient du début du XVIe siècle, quand les domestiques obtiennent le droit de vendre les objets usagés de leurs patrons, entre le coucher et le lever du soleil. Le reste suit cette pente : en 1523, la date est fixée au 30 août et la durée à sept jours ouvrables ; au XIXe siècle, on l'appelle aussi la « fête aux loques » ; dès 1863, la compagnie des chemins de fer du Nord affrète des trains « de plaisir » depuis Paris.

Les moules arrivent plus tard, et peut-être par accident : une hypothèse veut que des épidémies aient touché les volailles qu'on mangeait traditionnellement à la braderie. La première mention de tas de moules date du 7 septembre 1904. Les coquilles empilées devant les restaurants, notamment place Rihour, en sont devenues un emblème ; on estime la consommation à cinq cents tonnes de moules et trente tonnes de frites.

Aujourd'hui, la braderie dure officiellement trente-quatre heures sans interruption, du samedi 8 heures au dimanche 18 heures, sur plus de cinquante kilomètres de trottoir, avec environ cinq mille cinq cents exposants et plus ou moins deux millions de visiteurs. Les emplacements sont gratuits pour les particuliers : une exception française.

Elle a été interrompue par les deux guerres — la première braderie d'après-guerre a lieu en septembre 1919, la précédente datait de 1913 —, annulée en 2016 après l'attentat de Nice, ce qui n'était plus arrivé depuis soixante-dix ans, puis en 2020 et 2021 pour la pandémie, et décalée de quinze jours en 2024, les forces de sécurité étant mobilisées par les Jeux olympiques.$b$,
  'https://fr.wikipedia.org/wiki/Braderie_de_Lille',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Braderie_de_Lille","titre":"Braderie de Lille","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'origine flamande du mot « braderie » et l'explication des moules par des épidémies de volailles sont présentées par l'article comme des hypothèses ; le texte les rend comme telles. Le chiffre de deux millions de visiteurs est donné par l'article comme une estimation, la fréquentation étant impossible à compter précisément.$v$,
  'apport éditeur'
),
-- Lille 3 ---------------------------------------------------------------
(
  'Lille',
  'ChIJEW4ls3nVwkcRYGNkgT7xCgQ',
  'La berceuse de l''employé de l''octroi',
  $h$Écrite d'un jet en patois par un fonctionnaire municipal, elle est devenue l'hymne officieux de la ville$h$,
  '1820–1902',
  $b$Alexandre Desrousseaux naît en 1820 au 120 de la rue Saint-Sauveur, dans le quartier du même nom, sixième d'une fratrie de sept dont quatre meurent en bas âge. Le père est passementier et violoniste, la mère dentellière. À six ans, l'enfant entre en apprentissage chez un tisserand de Mons-en-Barœul, qui lui apprend à lire et à écrire. Il passera ensuite par une fabrique d'indiennes, un atelier de tullistes, puis chez un tailleur, ancien souffleur de théâtre qui chante toute la journée les airs des chansonniers. À partir de 1834, il suit les cours gratuits du conservatoire de Lille.

À dix-huit ans, il met en chansons trois figures populaires et les chante le jour du Mardi gras, costumé en marchand de chansons, debout dans une voiture découverte. Le succès est immédiat. Vient la conscription : sa mère lui glisse dans la poche une « peau divine », ce talisman censé porter chance. Il tire quand même un mauvais numéro et passe près de sept ans au 46e régiment d'infanterie, à jouer de la clarinette et du violon.

Revenu à Lille en 1847, il entre au mont-de-piété, puis à l'hôtel de ville, où il finira responsable du service de l'octroi. C'est son métier ; les chansons sont le reste de sa vie.

En 1853, il écrit d'un jet L'Canchon Dormoire. Il cherche en vain un air connu sur lequel la poser et se voit « forcé, bien à regret » — le mot est de lui — de noter la mélodie qui lui vient en tête : trop modeste, il craint que sa musique nuise aux paroles. Le soir où il la chante, l'auditoire est électrisé, cinq cents voix la reprennent en chœur, des jeunes gens la promènent dans la ville une partie de la nuit. Un mois plus tard, tout Lille connaît l'air du P'tit Quinquin.

En 1870, les soldats du Nord partant à la guerre en font leur chanson de marche. Desrousseaux est fait chevalier de la Légion d'honneur en décembre 1884 et décoré par le général Faidherbe. Quand il meurt, le 23 novembre 1892, la foule l'accompagne au cimetière de l'Est au son d'une marche funèbre composée sur l'air du P'tit Quinquin, transcrit en mode mineur avec un accord final sur la tierce.

Une souscription est ouverte dès 1893. Le monument, un buste d'Eugène Déplechin avec, devant le socle, une statue illustrant la chanson, est inauguré le 17 août 1902. Les originaux sont aujourd'hui à l'hôtel de ville, remplacés sur place par des moulages en résine depuis 2001. Et le carillon du beffroi de la chambre de commerce sonne toujours l'air, régulièrement, à l'heure.$b$,
  'https://fr.wikipedia.org/wiki/Alexandre_Desrousseaux',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Alexandre_Desrousseaux","titre":"Alexandre Desrousseaux","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article donne deux dates de naissance : le 2 juin 1820 en tête, le 1er juin 1820 dans le corps du texte ; le texte ne retient que l'année. Le square où le monument a été inauguré en 1902 est nommé « square Jussieu » par l'article ; le texte ne le nomme pas, le lieu ayant changé de nom depuis sans que l'article le précise.$v$,
  'apport éditeur'
),
-- Lille 4 ---------------------------------------------------------------
(
  'Lille',
  'ChIJEW4ls3nVwkcRYGNkgT7xCgQ',
  'Le vaccin né dans la bile de bœuf',
  $h$Une épidémie de diphtérie a fait naître ici, par souscription publique, l'institut où sera mis au point le BCG$h$,
  '1854–1921',
  $b$Louis Pasteur a été le premier doyen de la faculté des sciences de Lille, de 1854 à 1857, rue des Arts. C'est là, avec l'aide des brasseurs du Nord, qu'il pose les bases de la microbiologie moderne, avant de partir diriger l'École normale supérieure.

Quarante ans plus tard, une importante épidémie de diphtérie frappe la ville. En novembre 1894, le conseil d'hygiène se rend à Paris pour rencontrer le docteur Émile Roux, qui vient de publier ses travaux sur la maladie et sur le sérum qu'il a mis au point. Les Lillois voulaient un centre de production de sérum, un centre antirabique et un bureau d'hygiène ; Roux leur propose un institut entier, sur le modèle de celui de Paris. Pasteur approuve et en confie la direction à l'un de ses élèves, le docteur Albert Calmette.

Calmette commence tout de suite, dans les locaux provisoires laissés par l'ancienne faculté des sciences. Pour bâtir, une souscription publique est lancée, le conseil municipal débloque des fonds, la ville cède un terrain de dix mille mètres carrés, les entreprises et les particuliers donnent massivement. La première pierre est posée le 20 novembre 1895, moins de deux mois après la mort de Pasteur. L'institut est reconnu d'utilité publique le 1er avril 1898 et inauguré le 9 avril 1899, en présence de deux ministres et de la famille Pasteur. Il aura coûté 972 000 francs, dont 300 000 pris sur les ressources personnelles de Calmette.

C'est là qu'est mis au point le vaccin le plus utilisé au monde. Le biologiste Albert Calmette et le vétérinaire Camille Guérin cherchent à obtenir une souche de tuberculose bovine assez affaiblie pour ne plus rendre malade, mais assez proche pour immuniser. Leur méthode tient à un milieu de culture singulier : des tranches de pomme de terre immergées dans de la bile de bœuf stérile. L'invasion allemande de 1914 interrompt le travail ; ils le reprennent et aboutissent en 1921. La souche portera leurs deux noms : bacille de Calmette et Guérin, BCG.

L'institut est resté une fondation privée, totalement indépendante de celui de Paris, avec lequel il partage le réseau international des instituts Pasteur. Les subventions ne représentent que le quart de ses ressources : le reste vient toujours des dons, des legs et du mécénat — comme en 1895.$b$,
  'https://fr.wikipedia.org/wiki/Institut_Pasteur_de_Lille',
  $s$[{"url":"https://fr.wikipedia.org/wiki/Institut_Pasteur_de_Lille","titre":"Institut Pasteur de Lille","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir de l'extrait Wikipédia relu le 25/09/2026. L'article ne date que la reprise des travaux sur le BCG (1921) après leur interruption en 1914, sans dire quand ils avaient commencé : le texte ne date pas davantage le début des recherches. Le nom de l'établissement dirigé par Pasteur est écrit « faculté des sciences de Lille », celui du poste « premier doyen », comme dans l'article.$v$,
  'apport éditeur'
),
-- Lille 5 ---------------------------------------------------------------
(
  'Lille',
  'ChIJEW4ls3nVwkcRYGNkgT7xCgQ',
  'Le métro sans conducteur',
  $h$Le premier métro entièrement automatique du monde est sorti d'un train miniature bricolé par un professeur lillois$h$,
  '1968–1983',
  $b$En 1968, l'établissement public d'aménagement de Lille-Est charge le professeur Robert Gabillard de mettre au point un moyen de transport pour la ville nouvelle de Villeneuve-d'Ascq. On l'avait déjà sollicité pour cartographier, par voie électromagnétique, les zones calcaires du sous-sol : c'est en partie son relevé qui avait déterminé où implanter la ville nouvelle.

Le cahier des charges est contraignant. Il faut une fréquence élevée même aux heures creuses, alors que le trafic attendu est modeste ; or, à cette cadence, la masse salariale d'une conduite manuelle devient prohibitive. Il faut aussi des stations et des rames courtes, et des véhicules capables d'avaler de fortes pentes et des courbes serrées pour s'insérer dans le tissu urbain à moindre coût. La conduite automatique n'est pas une coquetterie technique : c'est la condition économique du projet.

Gabillard commence par un prototype fait d'un train miniature modifié. Il envisage d'abord un système de « canton temporel », où chaque rame porte une horloge et où l'ensemble du réseau s'arrête par sécurité si l'une d'elles prend de l'avance ; trop compliqué à mettre au point, il est remplacé par des cantons fixes, où une seule rame à la fois circule par section. Le brevet est déposé en 1971. Le sigle VAL vient du trajet d'origine : Villeneuve-d'Ascq – Lille.

En 1972, Matra est retenu comme ensemblier et un site d'essai est construit à Lezennes, avec une boucle et deux voitures. De ce partenariat sortent un système anticollision fondé sur un signal électromagnétique basse fréquence dont l'absence coupe le courant de la ligne, et des portes palières commandées par boucles magnétiques pour empêcher toute chute sur les voies.

La ligne 1 est inaugurée le 25 avril 1983 par François Mitterrand, arrivé en hélicoptère à la station Quatre-Cantons, accueilli notamment par Robert Gabillard. Le transport est gratuit les deux premières semaines. Quarante mille curieux prennent le métro le premier jour ; le million de passagers est franchi en moins de dix mois, et treize millions d'usagers l'empruntent de mai 1983 à mars 1984. Près d'un tiers des trajets sont faits par des gens qui ne prenaient pas les transports en commun.

La technologie s'est ensuite exportée à Toulouse, Rennes, Turin, Taipei, Uijeongbu, à Orly, à Roissy et jusqu'à l'aéroport O'Hare de Chicago. En 2012, l'année de la mort de Robert Gabillard, la station Cité Scientifique a pris son nom.$b$,
  'https://fr.wikipedia.org/wiki/V%C3%A9hicule_automatique_l%C3%A9ger',
  $s$[{"url":"https://fr.wikipedia.org/wiki/V%C3%A9hicule_automatique_l%C3%A9ger","titre":"Véhicule automatique léger","editeur":"Wikipédia"},{"url":"https://fr.wikipedia.org/wiki/M%C3%A9tro_de_Lille","titre":"Métro de Lille","editeur":"Wikipédia"}]$s$::jsonb,
  'validated', 'haute',
  $v$Rédigée à partir des deux extraits Wikipédia relus le 25/09/2026. L'article sur le VAL donne deux dates pour le dépôt du brevet : le 31 juillet 1971 en tête, le 2 juillet 1971 dans le corps du texte ; le texte ne retient que l'année. Le trafic visé (environ 6 000 passagers par heure et par direction) n'est pas chiffré dans le texte, qui le rend par « modeste ». La station Cité Scientifique porte depuis 2012 le nom complet « Cité Scientifique - Professeur Gabillard ».$v$,
  'apport éditeur'
)
) as v (city, city_place_id, title, hook, period, body, source_url, sources,
        status, confidence, verification_notes, generated_by)
on conflict (city_place_id, lower(title)) do nothing;
