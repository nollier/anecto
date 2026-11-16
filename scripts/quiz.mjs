#!/usr/bin/env node
// Remplir les affirmations « Vrai ou faux ? » des anecdotes.
//
//   node scripts/quiz.mjs export [ville] > quiz.csv
//   node scripts/quiz.mjs import quiz.csv [--appliquer]
//
// Variables d'environnement : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
// Sans --appliquer, l'import vérifie seulement le fichier. Mode d'emploi
// complet : scripts/QUIZ.md.

import { readFileSync } from 'node:fs';
import { ecrireCsv, extrait, lireCsv, valider } from './quiz-csv.mjs';

const URL_BASE = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function api(chemin, options = {}) {
  if (!URL_BASE || !CLE) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
    process.exit(1);
  }
  return fetch(`${URL_BASE}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

async function exporter(ville) {
  const filtres = ['status=eq.validated', 'quiz_affirmation=is.null', 'order=city,created_at'];
  if (ville) filtres.push(`city=eq.${encodeURIComponent(ville)}`);
  const res = await api(`anecdotes?select=id,city,hook,title,body&${filtres.join('&')}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const anecdotes = await res.json();
  process.stdout.write(
    ecrireCsv(
      anecdotes.map((a) => ({
        id: a.id,
        ville: a.city,
        accroche: a.hook || a.title,
        extrait: extrait(a.body),
        affirmation: '',
        reponse: '',
      }))
    )
  );
  console.error(`${anecdotes.length} anecdote(s) sans affirmation exportée(s).`);
}

async function importer(fichier, appliquer) {
  const { pretes, erreurs } = valider(lireCsv(readFileSync(fichier, 'utf8')));
  erreurs.forEach((e) => console.error(`✗ ${e}`));
  console.error(`${pretes.length} affirmation(s) valide(s), ${erreurs.length} erreur(s).`);
  if (!appliquer) {
    console.error('Vérification seule. Ajoute --appliquer pour enregistrer.');
    return;
  }
  if (erreurs.length > 0) {
    console.error('Rien n\'est enregistré tant qu\'il reste des erreurs.');
    process.exit(1);
  }
  let ok = 0;
  for (const p of pretes) {
    const res = await api(`anecdotes?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ quiz_affirmation: p.quiz_affirmation, quiz_reponse: p.quiz_reponse }),
    });
    if (res.ok) ok++;
    else console.error(`✗ ${p.id} : ${res.status} ${await res.text()}`);
  }
  console.error(`${ok} affirmation(s) enregistrée(s).`);
}

const [commande, arg, option] = process.argv.slice(2);
if (commande === 'export') await exporter(arg);
else if (commande === 'import' && arg) await importer(arg, option === '--appliquer');
else {
  console.error('Usage : node scripts/quiz.mjs export [ville] > quiz.csv');
  console.error('        node scripts/quiz.mjs import quiz.csv [--appliquer]');
  process.exit(1);
}
