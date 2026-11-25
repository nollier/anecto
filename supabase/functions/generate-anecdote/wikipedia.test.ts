// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/wikipedia.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirTitreVille, estRacontable, lireAxe, occurrences, ordreAxes, parleDe, qualificatif } from './wikipedia.ts';

test('les axes tournent à partir de celui du lot', () => {
  assert.deepEqual(ordreAxes('patrimoine'), ['patrimoine', 'personnalites', 'histoire', 'mentions']);
  assert.deepEqual(ordreAxes('histoire'), ['histoire', 'mentions', 'patrimoine', 'personnalites']);
});

test('un axe inconnu retombe sur patrimoine', () => {
  assert.equal(lireAxe('histoire'), 'histoire');
  assert.equal(lireAxe(undefined), 'patrimoine');
  assert.equal(lireAxe('n’importe quoi'), 'patrimoine');
});

test('compte la ville sans tenir compte des accents ni des tirets', () => {
  assert.equal(occurrences('Saint-Jean-de-Luz, puis saint jean de luz, puis Saint-Jean-de-Luz.', 'Saint-Jean-de-Luz'), 3);
});

test('une fiche descriptive ne raconte rien', () => {
  const fiche =
    'Le casino de Saint-Jean-de-Luz compte 120 machines à sous et deux tables. ' +
    'Il est ouvert de 10 h à 3 h. Le casino de Saint-Jean-de-Luz est rénové en 2015. ' +
    'Saint-Jean-de-Luz en est propriétaire.';
  assert.equal(estRacontable(fiche, 'Saint-Jean-de-Luz'), false);
});

test('une histoire datée qui se passe dans la ville est racontable', () => {
  const histoire =
    'Le casino ouvre à Saint-Jean-de-Luz en 1928. Il fait faillite en 1934, ' +
    'sert d’hôpital en 1940 et rouvre en 1952. Saint-Jean-de-Luz le rachète, ' +
    'et Saint-Jean-de-Luz en confie la gestion à un groupe.';
  assert.equal(estRacontable(histoire, 'Saint-Jean-de-Luz'), true);
});

test('un article qui cite la ville une fois parle d’autre chose', () => {
  const ailleurs = 'Né en 1901 à Bayonne, il joue en 1920, 1921 et 1925, dont une fois à Saint-Jean-de-Luz.';
  assert.equal(estRacontable(ailleurs, 'Saint-Jean-de-Luz'), false);
});

test('une autre commune qui cite la ville n’est pas retenue', () => {
  const voisine =
    'Ciboure est une commune française située dans le département des Pyrénées-Atlantiques. ' +
    'En 1627, 1650, 1660 et 1700, Saint-Jean-de-Luz, Saint-Jean-de-Luz et Saint-Jean-de-Luz.';
  assert.equal(estRacontable(voisine, 'Saint-Jean-de-Luz'), false);
});

// Le 25 novembre : « Le Port » (La Réunion) recevait des anecdotes sur
// Boulogne, Calais, Portsmouth, Douvres et Anvers.
test("Le Port : jamais la page d'homonymie, ni l'article « Port »", () => {
  const recherche = [
    { title: 'Port', homonymie: false },
    { title: 'Le Port', homonymie: true },
  ];
  assert.equal(choisirTitreVille('Le Port', recherche), null);

  const liensHomonymie = [
    { title: 'Port', homonymie: false },
    { title: 'Le Port (La Réunion)', homonymie: false },
    { title: 'Le Port (homonymie)', homonymie: true },
  ];
  assert.equal(choisirTitreVille('Le Port', liensHomonymie), 'Le Port (La Réunion)');

  // Deux communes homonymes, rien pour trancher : pas de dossier.
  assert.equal(
    choisirTitreVille('Le Port', [...liensHomonymie, { title: 'Le Port (Ariège)', homonymie: false }]),
    null
  );
  assert.equal(choisirTitreVille('Rennes', [{ title: 'Rennes', homonymie: false }]), 'Rennes');
});

test('Le Port : « le port de Boulogne » ne nomme pas la ville', () => {
  const boulogne = {
    origine: 'wikipedia',
    title: 'Port de Boulogne-sur-Mer',
    url: 'https://fr.wikipedia.org/wiki/Port_de_Boulogne-sur-Mer',
    editeur: 'Wikipédia',
    extract: "En 636, un vaisseau entre dans le port de Boulogne. Le port est agrandi en 1803. Le port de pêche est le premier de France.",
  } as const;
  assert.equal(occurrences(boulogne.extract, 'Le Port'), 0);
  assert.equal(parleDe(boulogne, 'Le Port (La Réunion)', 'Le Port'), false);

  const commune = {
    ...boulogne,
    title: 'Pointe des Galets',
    extract: "La pointe des Galets se trouve sur la commune du Port, à La Réunion. Le Port est fondé en 1895 autour du bassin creusé à Le Port.",
  };
  assert.equal(parleDe(commune, 'Le Port (La Réunion)', 'Le Port', true), true);
  assert.equal(qualificatif('Le Port (La Réunion)'), 'Réunion');

  // Un homonyme sur l'axe des mentions : le nom y est, la Réunion non.
  const ariege = { ...boulogne, title: 'Vicdessos', extract: 'Le Port, en Ariège, compte 150 habitants en 1990.' };
  assert.equal(parleDe(ariege, 'Le Port (La Réunion)', 'Le Port', true), false);
});
