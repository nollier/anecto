// node --experimental-strip-types --test \
//   supabase/functions/generate-anecdote/qualite.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlerRedaction, couperAuFormat, horsCitations, neutraliserAffects, phrases } from './qualite.ts';

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

test('ne coupe pas une phrase après une initiale ou une abréviation', () => {
  assert.deepEqual(phrases('M. Dupont arrive en 1890. Il repart au XIXe s. vers Paris. Fin.'), [
    'M. Dupont arrive en 1890.',
    'Il repart au XIXe s. vers Paris.',
    'Fin.',
  ]);
});

const mot = (n: number) => Array.from({ length: n }, () => 'mot').join(' ');

test('coupe les phrases sans date du milieu, garde l’attaque, la chute et les dates', () => {
  const attaque = `En 1758, les Anglais débarquent. ${mot(60)}.`;
  const milieu = (k: number) =>
    `Puis vint la guerre, en ${1800 + k}. Le guet compte ${k + 20} chiens. ${mot(40)}. ${mot(35)}.`;
  const chute = `Aujourd'hui, une rue porte leur nom depuis 1902. ${mot(50)}.`;
  const corps = [attaque, milieu(1), milieu(2), milieu(3), chute].join('\n\n');
  const coupe = couperAuFormat(corps, 400)!;
  assert.ok(coupe);
  const n = coupe.split(/\s+/).length;
  assert.ok(n <= 400 && n >= 220, `${n} mots`);
  const [p1, , , , p5] = coupe.split('\n\n');
  assert.equal(p1, attaque);
  assert.equal(p5, chute);
  for (const k of [1, 2, 3]) {
    assert.ok(coupe.includes(`en ${1800 + k}`));
    assert.ok(coupe.includes(`${k + 20} chiens`));
  }
});

test('ne touche pas un corps déjà au format', () => {
  const corps = [mot(80), mot(80), mot(80), mot(80)].join('\n\n');
  assert.equal(couperAuFormat(corps), corps);
});

test('renonce plutôt que de vider les paragraphes', () => {
  const corps = [mot(200), mot(150), mot(150)].join('\n\n');
  assert.equal(couperAuFormat(corps, 300), null);
});
