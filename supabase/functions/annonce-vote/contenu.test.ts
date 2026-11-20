import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dernierJour,
  jetonDesinscription,
  messageEmail,
  messagePush,
} from './contenu.ts';

const campagne = {
  numero: 1,
  // Minuit le 15 décembre à Paris = 23 h UTC le 14.
  fin: '2026-12-14T23:00:00Z',
  options: [
    { libelle: 'Suivre 2 villes', description: 'Ta ville et une autre' },
    { libelle: 'Des images dans les anecdotes', description: null },
    { libelle: 'Sauvegarder mes favorites', description: 'Pour les relire' },
  ],
};

test('le dernier jour de vote est la veille de la fin exclusive', () => {
  assert.equal(dernierJour(campagne.fin), '14 décembre');
  assert.equal(dernierJour('2027-01-01T23:00:00Z'), '1er janvier');
});

test('le push énumère les options et la date', () => {
  const { title, body } = messagePush(campagne);
  assert.equal(title, "Anecto évolue, et c'est toi qui choisis");
  assert.match(body, /^Mets à jour l'app/);
  assert.match(body, /suivre 2 villes, des images dans les anecdotes ou sauvegarder mes favorites \? Jusqu'au 14 décembre\.$/);
  const suivant = messagePush({ ...campagne, numero: 2 });
  assert.equal(
    suivant.body,
    "Suivre 2 villes, des images dans les anecdotes ou sauvegarder mes favorites ? Le vote est ouvert jusqu'au 14 décembre."
  );
});

test("l'email liste les options et porte le lien de désinscription", () => {
  const { texte, html } = messageEmail(campagne, 'https://x/desinscription-annonces?u=a&t=b');
  assert.match(texte, /Anecto évolue/);
  assert.match(texte, /version 1\.2\.1/);
  assert.match(texte, /- Suivre 2 villes : Ta ville et une autre/);
  assert.match(texte, /- Des images dans les anecdotes\n/);
  assert.match(html, /u=a&amp;t=b/);
  assert.doesNotMatch(texte + html, /—/);
});

test('le jeton dépend du compte et du secret', async () => {
  const a = await jetonDesinscription('compte-a', 'secret');
  assert.equal(a.length, 32);
  assert.equal(a, await jetonDesinscription('compte-a', 'secret'));
  assert.notEqual(a, await jetonDesinscription('compte-b', 'secret'));
  assert.notEqual(a, await jetonDesinscription('compte-a', 'autre'));
});
