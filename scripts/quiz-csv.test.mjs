import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ecrireCsv, lireCsv, valider } from './quiz-csv.mjs';

const ID = '0b6f2a0e-4c1d-4b5e-9f7a-1234567890ab';

test('aller-retour avec ; et guillemets', () => {
  const csv = ecrireCsv([{ id: ID, ville: 'Bayonne', accroche: 'Le « jambon » ; vraiment ?', extrait: 'Il dit "non"', affirmation: '', reponse: '' }]);
  const [l] = lireCsv(csv);
  assert.equal(l.accroche, 'Le « jambon » ; vraiment ?');
  assert.equal(l.extrait, 'Il dit "non"');
});

test('validation : VRAI/FAUX, longueur, lignes vides ignorées', () => {
  const lignes = lireCsv(
    `id;ville;accroche;extrait;affirmation;reponse\n` +
      `${ID};Lyon;a;b;La ville compte plus de 500 traboules.;vrai\n` +
      `${ID};Lyon;a;b;;\n` +
      `${ID};Lyon;a;b;Court;FAUX\n` +
      `${ID};Lyon;a;b;Une affirmation correcte ici.;peut-être\n`
  );
  const { pretes, erreurs } = valider(lignes);
  assert.equal(pretes.length, 1);
  assert.equal(pretes[0].quiz_reponse, true);
  assert.equal(erreurs.length, 2);
});
