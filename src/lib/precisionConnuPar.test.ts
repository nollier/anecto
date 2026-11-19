// node --experimental-strip-types --test src/lib/precisionConnuPar.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRECISION_CONNU_PAR_MAX, precisionConnuPar } from './precisionConnuPar.ts';

test('seul « autre » conserve le texte, trimmé', () => {
  assert.equal(precisionConnuPar('autre', '  un groupe  '), 'un groupe');
  assert.equal(precisionConnuPar('autre', '\n un ami \n'), 'un ami');
  assert.equal(precisionConnuPar('autre', '  un   article  '), 'un   article');
});

test('vide ou blanc devient null, la question peut être passée', () => {
  assert.equal(precisionConnuPar('autre', ''), null);
  assert.equal(precisionConnuPar('autre', '   '), null);
  assert.equal(precisionConnuPar('autre', '\n\t  '), null);
});

test('les autres réponses ignorent le texte, pour ne pas changer leur valeur', () => {
  for (const reponse of ['proche', 'whatsapp_sms', 'facebook', 'instagram', 'tiktok', 'store', null]) {
    assert.equal(precisionConnuPar(reponse, '  un article  '), null);
  }
});

test('coupe à 200 caractères Unicode, puis retire l’espace devenu final', () => {
  assert.equal(PRECISION_CONNU_PAR_MAX, 200);
  assert.equal(precisionConnuPar('autre', 'é'.repeat(250))?.length, 200);
  assert.equal(Array.from(precisionConnuPar('autre', 'é'.repeat(250))!).length, 200);

  const trop = `${'a '.repeat(100)}b`;
  const coupe = precisionConnuPar('autre', trop)!;
  assert.ok(Array.from(coupe).length <= 200);
  assert.equal(coupe, coupe.trim());
  assert.equal(coupe.endsWith(' '), false);

  const emojis = precisionConnuPar('autre', '😀'.repeat(201))!;
  assert.equal(Array.from(emojis).length, 200);
  assert.equal(emojis, '😀'.repeat(200));
});
