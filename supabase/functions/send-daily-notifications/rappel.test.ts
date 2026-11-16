import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texteRappel, NOMBRE_DE_VARIANTES } from './rappel.ts';

test('cinq variantes distinctes sur cinq jours consécutifs', () => {
  const titres = new Set<string>();
  for (let j = 10; j < 15; j++) titres.add(texteRappel('Bayonne', 'u', `2026-11-${j}`).title);
  assert.equal(titres.size, NOMBRE_DE_VARIANTES);
});

test('nomme la ville sans rien dévoiler et reste court', () => {
  for (let j = 10; j < 15; j++) {
    const { title, body } = texteRappel('Saint-Jean-de-Luz', 'u', `2026-11-${j}`);
    assert.ok(title.includes('Saint-Jean-de-Luz'));
    assert.ok(title.length <= 65, title);
    assert.ok(body.length <= 60, body);
  }
});

test('jour illisible : pas de plantage', () => {
  assert.ok(texteRappel('Lyon', 'u', 'n/a').title.includes('Lyon'));
});
