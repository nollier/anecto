import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloture,
  construireCampagne,
  gagnants,
  messageErreur,
  periode,
  type LigneCampagne,
} from './communaute.ts';

process.env.TZ = 'Europe/Paris';

const base = {
  campagne_id: 'c1',
  numero: 1,
  titre: 'Que voulez-vous en priorité ?',
  debut: '2026-12-01T08:00:00Z',
  fin: '2026-12-14T23:00:00Z',
  ouverte: true,
  description: null,
};

const lignes: LigneCampagne[] = [
  { ...base, option_id: 'o3', libelle: 'Favorites', ordre: 3, mon_choix: false },
  { ...base, option_id: 'o1', libelle: '2 villes', ordre: 1, mon_choix: true },
  { ...base, option_id: 'o2', libelle: 'Images', ordre: 2, mon_choix: false },
];

test('les lignes de la RPC forment une campagne triée avec le choix du lecteur', () => {
  const c = construireCampagne(lignes)!;
  assert.deepEqual(c.options.map((o) => o.id), ['o1', 'o2', 'o3']);
  assert.equal(c.monChoix, 'o1');
  assert.equal(construireCampagne([]), null);
  assert.equal(construireCampagne(lignes.map((l) => ({ ...l, mon_choix: false })))!.monChoix, null);
});

test('la période affiche le dernier jour inclus', () => {
  assert.equal(periode(base), 'Vote n°1 · du 1er au 14 décembre');
  assert.equal(
    periode({ numero: 3, debut: '2026-12-28T23:00:00Z', fin: '2027-01-10T23:00:00Z' }),
    'Vote n°3 · du 29 décembre au 10 janvier'
  );
});

test('la clôture se lit en jours restants', () => {
  const fin = '2026-12-14T23:00:00Z';
  assert.equal(cloture(fin, new Date('2026-12-02T10:00:00Z')), 'Clôture dans 13 jours');
  assert.equal(cloture(fin, new Date('2026-12-13T10:00:00Z')), 'Clôture demain soir');
  assert.equal(cloture(fin, new Date('2026-12-14T10:00:00Z')), 'Clôture ce soir');
  assert.equal(cloture(fin, new Date('2026-12-15T10:00:00Z')), 'Vote clos');
});

test('les gagnants incluent les égalités', () => {
  const c = construireCampagne(lignes)!;
  const g = gagnants(c, [
    { option_id: 'o1', pourcentage: 40, en_tete: true },
    { option_id: 'o2', pourcentage: 40, en_tete: true },
    { option_id: 'o3', pourcentage: 20, en_tete: false },
  ]);
  assert.deepEqual(g.map((o) => o.id), ['o1', 'o2']);
});

test("seules les erreurs prévues sont montrées telles quelles", () => {
  assert.equal(messageErreur({ message: 'Ce vote est clos' }, 'x'), 'Ce vote est clos');
  assert.equal(
    messageErreur({ message: 'Une idée par semaine : prochaine possible le 26/11' }, 'x'),
    'Une idée par semaine : prochaine possible le 26/11'
  );
  assert.equal(messageErreur({ message: 'violates check constraint' }, 'Réessaie.'), 'Réessaie.');
});
