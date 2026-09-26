// Génère la vitrine web : une page par ville, une page par anecdote publiée
// en entier, un index des villes et le plan du site pour les moteurs.
//
//   node scripts/generer-vitrine.mjs                  lit la base (clé publique)
//   node scripts/generer-vitrine.mjs --fichier x.json lit un export local
//   node scripts/generer-vitrine.mjs --sortie /tmp/v   écrit ailleurs
//
// Tout vient de `vitrine_anecdotes()`, qui décide seule de ce qui est public :
// trois anecdotes entières par ville, les autres réduites à leur accroche. Le
// script ne voit jamais davantage, il ne peut donc pas en publier davantage.
//
// Les pages sont écrites dans `villes/` et servies par GitHub Pages depuis la
// branche principale, comme `telecharger/` et `legal/`. Le workflow
// `vitrine.yml` les régénère chaque semaine ; une ville ouverte entre-temps
// apparaît donc d'elle-même.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEUILLE = join(RACINE, 'villes', 'vitrine.css');

function option(nom) {
  const i = process.argv.indexOf(nom);
  return i === -1 ? null : process.argv[i + 1];
}

// `--sortie` sert aux essais : générer ailleurs sans toucher aux pages
// publiées.
const SORTIE = option('--sortie') ?? join(RACINE, 'villes');
const SITE = 'https://nollier.github.io/anecto';

// La clé publique, la même qu'embarque l'app (eas.json) : elle ne donne que
// ce que la base accorde au rôle `anon`, ici la seule fonction de vitrine.
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://swvhclxwchrhyhtrvmhb.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dmhjbHh3Y2hyaHlodHJ2bWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MzIzMzksImV4cCI6MjEwMjIwODMzOX0.ym_dMS-lZicochqxlZRqdPR8eK2oOx139pTnKdyutms';

async function lireAnecdotes() {
  const fichier = option('--fichier');
  if (fichier) return JSON.parse(await readFile(fichier, 'utf8'));

  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vitrine_anecdotes`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!reponse.ok) throw new Error(`vitrine_anecdotes : ${reponse.status} ${await reponse.text()}`);
  return reponse.json();
}

// --- Outils ---------------------------------------------------------------

export function slug(texte) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function echapper(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Une description de moteur de recherche : ~155 caractères, mot entier. */
function resume(texte, max = 155) {
  const plat = texte.replace(/\s+/g, ' ').trim();
  if (plat.length <= max) return plat;
  return plat.slice(0, plat.lastIndexOf(' ', max - 1)) + '…';
}

/**
 * Le canal de la page de téléchargement pour une ville, au format que la
 * base accepte (`^[a-z0-9_-]{1,32}$`). On sait ainsi quelle ville amène des
 * lecteurs, pas seulement que Google en amène.
 */
function lienTelechargement(villeSlug, profondeur) {
  const src = `seo-${villeSlug}`.slice(0, 32).replace(/-+$/, '');
  return `${'../'.repeat(profondeur)}telecharger/?src=${src}`;
}

// --- Gabarit --------------------------------------------------------------

function page({ titre, description, canonique, profondeur, jsonLd, corps }) {
  const css = `${'../'.repeat(profondeur - 1)}vitrine.css`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)}</title>
<meta name="description" content="${echapper(description)}">
<link rel="canonical" href="${canonique}">
<meta property="og:title" content="${echapper(titre)}">
<meta property="og:description" content="${echapper(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonique}">
<meta property="og:locale" content="fr_FR">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Public+Sans:wght@400;500;700&display=swap">
<link rel="stylesheet" href="${css}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<div class="page">
${corps}
<footer>
  <p>Anecto — édité par Nicolas Ollier. Gratuit, sans publicité. <a href="${'../'.repeat(profondeur)}legal/politique-confidentialite.html">Confidentialité</a> · <a href="${'../'.repeat(profondeur - 1)}">Toutes les villes</a>.</p>
</footer>
</div>
</body>
</html>
`;
}

function appel(villeSlug, profondeur, ville) {
  return `<aside class="appel">
  <p class="appel-titre">Une anecdote sur ${echapper(ville)}, chaque jour</p>
  <p>Anecto vous envoie chaque jour une anecdote vraie et vérifiée sur votre ville, à l'heure que vous choisissez. Gratuit, sans publicité.</p>
  <a class="bouton" href="${lienTelechargement(villeSlug, profondeur)}">Télécharger Anecto</a>
</aside>`;
}

function paragraphes(corps) {
  return corps
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${echapper(p)}</p>`)
    .join('\n');
}

// --- Pages ----------------------------------------------------------------

function pageAnecdote(ville, a, autres) {
  const titre = a.hook || a.title;
  const canonique = `${SITE}/villes/${ville.slug}/${a.slug}/`;

  return page({
    // L'accroche est une phrase entière, trop longue pour un titre de
    // résultat de recherche : l'étiquette courte y suffit, l'accroche reste
    // en tête de page.
    titre: `${a.title} · Histoire de ${ville.nom} | Anecto`,
    description: resume(a.body),
    canonique,
    profondeur: 3,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: titre.slice(0, 110),
      inLanguage: 'fr',
      datePublished: a.created_at,
      about: { '@type': 'City', name: ville.nom },
      isBasedOn: a.source_url || undefined,
      publisher: { '@type': 'Organization', name: 'Anecto' },
      mainEntityOfPage: canonique,
    },
    corps: `<header>
  <p class="eyebrow"><a href="../">${echapper(ville.nom)}</a>${a.period ? ` · ${echapper(a.period)}` : ''}</p>
  <h1>${echapper(titre)}</h1>
</header>
<article class="texte">
${paragraphes(a.body)}
<p class="source">Source : ${
      a.source_url
        ? `<a href="${echapper(a.source_url)}" rel="nofollow noopener">${echapper(a.source)}</a>`
        : echapper(a.source)
    }</p>
</article>
${appel(ville.slug, 3, ville.nom)}
${
  autres.length
    ? `<section>
  <h2 class="titre">À lire aussi sur ${echapper(ville.nom)}</h2>
  <ul class="liste">
${autres.map((o) => `    <li><a href="../${o.slug}/">${echapper(o.hook || o.title)}</a></li>`).join('\n')}
  </ul>
  <p><a href="../">Toutes les anecdotes de ${echapper(ville.nom)}</a></p>
</section>`
    : ''
}`,
  });
}

function pageVille(ville) {
  const canonique = `${SITE}/villes/${ville.slug}/`;
  const integrales = ville.anecdotes.filter((a) => a.integrale);
  const accroches = ville.anecdotes.filter((a) => !a.integrale);

  return page({
    titre: `Histoire de ${ville.nom} : anecdotes vraies et vérifiées | Anecto`,
    description: resume(
      `Anecdotes sur l'histoire de ${ville.nom}, rédigées à partir de sources vérifiables : ${integrales
        .map((a) => a.title)
        .join(', ')}.`
    ),
    canonique,
    profondeur: 2,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Anecdotes sur ${ville.nom}`,
      inLanguage: 'fr',
      about: { '@type': 'City', name: ville.nom },
      url: canonique,
    },
    corps: `<header>
  <p class="eyebrow"><a href="../">Anecto</a> · Villes</p>
  <h1>Anecdotes sur l'histoire de ${echapper(ville.nom)}</h1>
  <p class="chapo">Des histoires vraies sur ${echapper(ville.nom)}, chacune tirée d'une source publique et citée sous le texte : encyclopédies, archives, base Mérimée du ministère de la Culture.</p>
</header>
<section>
  <h2 class="titre">À lire en entier</h2>
  <ul class="cartes">
${integrales
  .map(
    (a) => `    <li><a href="${a.slug}/">
      ${a.period ? `<span class="quand">${echapper(a.period)}</span>` : ''}
      <span class="accroche">${echapper(a.hook || a.title)}</span>
      <span class="debut">${echapper(resume(a.body, 180))}</span>
    </a></li>`
  )
  .join('\n')}
  </ul>
</section>
${appel(ville.slug, 2, ville.nom)}
${
  accroches.length
    ? `<section>
  <h2 class="titre">Et dans l'application</h2>
  <p>Ces anecdotes-là se lisent dans Anecto, une par jour.</p>
  <ul class="liste accroches">
${accroches.map((a) => `    <li>${echapper(a.hook || a.title)}${a.period ? ` <span class="quand">${echapper(a.period)}</span>` : ''}</li>`).join('\n')}
  </ul>
</section>`
    : ''
}`,
  });
}

function pageIndex(villes) {
  const canonique = `${SITE}/villes/`;
  return page({
    titre: "Anecdotes d'histoire locale, ville par ville | Anecto",
    description: resume(
      `Des anecdotes vraies et vérifiées sur ${villes.length} villes : ${villes.map((v) => v.nom).join(', ')}.`
    ),
    canonique,
    profondeur: 1,
    corps: `<header>
  <p class="eyebrow">Anecto</p>
  <h1>Une anecdote vraie sur ta ville</h1>
  <p class="chapo">Chaque anecdote est rédigée à partir d'une source publique, et la source est citée sous le texte. Choisissez une ville.</p>
</header>
<ul class="villes">
${villes.map((v) => `  <li><a href="${v.slug}/">${echapper(v.nom)}</a></li>`).join('\n')}
</ul>
<aside class="appel">
  <p class="appel-titre">Une anecdote par jour, à l'heure que vous choisissez</p>
  <p>Gratuit, sans publicité, sans mot de passe.</p>
  <a class="bouton" href="../telecharger/?src=seo">Télécharger Anecto</a>
</aside>`,
  });
}

function planDuSite(villes) {
  const urls = [`${SITE}/villes/`];
  for (const v of villes) {
    urls.push(`${SITE}/villes/${v.slug}/`);
    for (const a of v.anecdotes.filter((x) => x.integrale)) urls.push(`${SITE}/villes/${v.slug}/${a.slug}/`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
}

// --- Assemblage -----------------------------------------------------------

export function regrouper(lignes) {
  const parLieu = new Map();
  for (const l of lignes) {
    if (!parLieu.has(l.place_id)) parLieu.set(l.place_id, { nom: l.ville, anecdotes: [] });
    parLieu.get(l.place_id).anecdotes.push(l);
  }

  const villes = [...parLieu.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  // Deux lieux au même nom (Saint-Paul de La Réunion et une autre) : le
  // second prend un suffixe plutôt que d'écraser la page du premier.
  const pris = new Set();
  for (const v of villes) {
    let s = slug(v.nom) || 'ville';
    for (let n = 2; pris.has(s); n++) s = `${slug(v.nom)}-${n}`;
    pris.add(s);
    v.slug = s;

    const prisA = new Set();
    for (const a of v.anecdotes.filter((x) => x.integrale)) {
      let sa = slug(a.title) || 'anecdote';
      for (let n = 2; prisA.has(sa); n++) sa = `${slug(a.title)}-${n}`;
      prisA.add(sa);
      a.slug = sa;
    }
  }
  return villes;
}

async function ecrire(chemin, contenu) {
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, contenu);
}

async function main() {
  const villes = regrouper(await lireAnecdotes());
  if (!villes.length) throw new Error('Aucune anecdote publique : génération annulée.');

  // Repartir de zéro, sauf la feuille de style : une ville dont les
  // anecdotes ont été retirées ne doit pas laisser de page orpheline.
  const css = await readFile(FEUILLE, 'utf8');
  await rm(SORTIE, { recursive: true, force: true });
  await ecrire(join(SORTIE, 'vitrine.css'), css);

  await ecrire(join(SORTIE, 'index.html'), pageIndex(villes));
  await ecrire(join(SORTIE, 'sitemap.xml'), planDuSite(villes));

  let pages = 0;
  for (const v of villes) {
    await ecrire(join(SORTIE, v.slug, 'index.html'), pageVille(v));
    const integrales = v.anecdotes.filter((a) => a.integrale);
    for (const a of integrales) {
      const autres = integrales.filter((o) => o !== a);
      await ecrire(join(SORTIE, v.slug, a.slug, 'index.html'), pageAnecdote(v, a, autres));
      pages++;
    }
  }

  console.log(`${villes.length} villes, ${pages} anecdotes entières.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  });
}
