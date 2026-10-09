// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/qualite.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlerRedaction, horsCitations, neutraliserAffects } from './qualite.ts';

/** Un paragraphe de 80 mots, sans rien de ce que les règles interdisent. */
const PARAGRAPHE = Array.from({ length: 16 }, (_, i) => `Le môle numéro ${i} reçoit`).join(' ') + '.';

const BON = {
  titre: 'Le fort bâti contre les Anglais devient le temple du rock',
  accroche: 'Le 21 septembre 1746, un Malouin hisse le pavillon fleurdelisé sur le fort Saint-Georges de Madras',
  corps: [PARAGRAPHE, PARAGRAPHE, PARAGRAPHE, PARAGRAPHE].join('\n\n'),
};

test('laisse passer une anecdote conforme', () => {
  const q = controlerRedaction(BON);
  assert.deepEqual(q.problemes, []);
  assert.equal(q.ok, true);
});

test('refuse un corps trop court ou mal découpé', () => {
  const q = controlerRedaction({ ...BON, corps: PARAGRAPHE });
  assert.equal(q.ok, false);
  assert.ok(q.problemes.some((p) => p.includes('mots')));
  assert.ok(q.problemes.some((p) => p.includes('paragraphe')));
});

test('refuse les adjectifs d’affect, même accordés', () => {
  const corps = BON.corps.replace('Le môle numéro 3', 'La remarquable jetée');
  const q = controlerRedaction({ ...BON, corps });
  assert.ok(q.problemes.some((p) => p.includes('remarquable')));
});

test('refuse la voix personnelle et les questions, hors citations seulement', () => {
  const avecCitation = BON.corps.replace('Le môle numéro 3', '« Nous tiendrons ? » écrit le gouverneur, et le môle');
  assert.equal(controlerRedaction({ ...BON, corps: avecCitation }).ok, true);

  const adresse = BON.corps.replace('Le môle numéro 3', 'Vous passez devant le môle');
  const q = controlerRedaction({ ...BON, corps: adresse });
  assert.ok(q.problemes.some((p) => p.includes('impersonnel')));

  const question = BON.corps.replace('Le môle numéro 3 reçoit', 'Qui construit le môle ?');
  assert.ok(controlerRedaction({ ...BON, corps: question }).problemes.some((p) => p.includes('question')));
});

test('refuse le point final et l’ouverture géographique générique', () => {
  const q = controlerRedaction({
    ...BON,
    titre: `${BON.titre}.`,
    corps: `Au cœur du centre historique, ${BON.corps}`,
  });
  assert.ok(q.problemes.some((p) => p.includes('titre se termine')));
  assert.ok(q.problemes.some((p) => p.includes('géographique')));
});

test('ne confond pas « nous » avec un mot qui le contient', () => {
  assert.equal(horsCitations('« a » b'), '  b');
  const corps = BON.corps.replace('Le môle numéro 3', 'Les noues du toit et le môle');
  assert.equal(controlerRedaction({ ...BON, corps }).ok, true);
});

test('remplace remarquable et exceptionnel, en gardant l’accord et la majuscule', () => {
  assert.equal(
    neutraliserAffects('Un résumé des styles les plus remarquables de la ville. Exceptionnelle, la crue de 1910.'),
    'Un résumé des styles les plus notables de la ville. Hors norme, la crue de 1910.'
  );
});

test('ne touche ni aux citations ni aux labels officiels', () => {
  const texte = 'Le parc, classé Jardin remarquable en 2004, est dit « exceptionnel » par le préfet.';
  assert.equal(neutraliserAffects(texte), texte);
});

test('un label officiel n’est pas un adjectif d’affect', () => {
  const corps = BON.corps.replace('Le môle numéro 0', 'Le site patrimonial remarquable numéro 0');
  assert.deepEqual(controlerRedaction({ ...BON, corps }).problemes, []);
});
