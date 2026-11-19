#!/usr/bin/env node
// Gérer le volet Communauté : idées des lecteurs, campagnes de vote.
//
//   node scripts/communaute.mjs idees [statut]
//   node scripts/communaute.mjs statut <id-idee> <envoyee|retenue|au_vote|livree|ecartee>
//   node scripts/communaute.mjs campagne <numero> <AAAA-MM-JJ> "<question>" "Libellé|Description" ...
//   node scripts/communaute.mjs resultats [numero]
//   node scripts/communaute.mjs livree <id-option>
//
// Variables d'environnement : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
//
// Une campagne dure 14 jours : elle ouvre le jour donné à 9 h (Paris) et
// ferme à minuit à la fin du 14e jour. Le push et l'email partent tout seuls
// à l'ouverture (pg_cron). Pour promouvoir une idée au vote, ajoute
// « |Description|id-idee » à l'option : l'idée passe au statut « au_vote ».

const URL_BASE = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATUTS = ['envoyee', 'retenue', 'au_vote', 'livree', 'ecartee'];

async function api(chemin, options = {}) {
  if (!URL_BASE || !CLE) {
    console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
    process.exit(1);
  }
  const res = await fetch(`${URL_BASE}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const texte = await res.text();
  return texte ? JSON.parse(texte) : null;
}

function plusJours(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function idees(statut) {
  const filtre = statut ? `&statut=eq.${statut}` : '';
  const lignes = await api(`idees?select=id,categorie,texte,statut,cree_at&order=cree_at.desc${filtre}`);
  if (lignes.length === 0) return console.log('Aucune idée.');
  for (const i of lignes) {
    console.log(`${i.id}  [${i.statut}] (${i.categorie}) ${i.cree_at.slice(0, 10)}\n  ${i.texte}\n`);
  }
}

async function changerStatut(id, statut) {
  if (!STATUTS.includes(statut)) throw new Error(`Statut inconnu. Choix : ${STATUTS.join(', ')}`);
  const [i] = await api(`idees?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) });
  console.log(i ? `Idée passée à « ${statut} ».` : 'Idée introuvable.');
}

async function campagne(numero, debut, titre, options) {
  if (!/^\d+$/.test(numero) || !/^\d{4}-\d{2}-\d{2}$/.test(debut) || !titre || options.length < 2) {
    throw new Error('Usage : campagne <numero> <AAAA-MM-JJ> "<question>" "Libellé|Description" (2 options au moins)');
  }
  // Postgres lit le fuseau dans la chaîne : pas de calcul d'heure d'été ici.
  const [c] = await api('campagnes_vote', {
    method: 'POST',
    body: JSON.stringify({
      numero: Number(numero),
      titre,
      debut: `${debut} 09:00:00 Europe/Paris`,
      fin: `${plusJours(debut, 14)} 00:00:00 Europe/Paris`,
    }),
  });
  const lignes = options.map((o, index) => {
    const [libelle, description, idee] = o.split('|').map((x) => x?.trim());
    return { campagne_id: c.id, libelle, description: description || null, idee_id: idee || null, ordre: index + 1 };
  });
  await api('options_vote', { method: 'POST', body: JSON.stringify(lignes) });
  for (const idee of lignes.map((l) => l.idee_id).filter(Boolean)) {
    await api(`idees?id=eq.${idee}`, { method: 'PATCH', body: JSON.stringify({ statut: 'au_vote' }) });
  }
  console.log(`Vote n°${numero} créé : du ${debut} au ${plusJours(debut, 13)} inclus, ${lignes.length} options.`);
}

async function resultats(numero) {
  const filtre = numero ? `numero=eq.${numero}` : 'order=debut.desc&limit=1';
  const [c] = await api(`campagnes_vote?select=id,numero,titre,debut,fin&${filtre}`);
  if (!c) return console.log('Aucune campagne.');
  const options = await api(`options_vote?select=id,libelle,livree_at&campagne_id=eq.${c.id}&order=ordre`);
  const votes = await api(`votes?select=option_id&campagne_id=eq.${c.id}`);
  const total = votes.length;
  console.log(`Vote n°${c.numero} : ${c.titre} (${total} votant${total > 1 ? 's' : ''})`);
  for (const o of options) {
    const n = votes.filter((v) => v.option_id === o.id).length;
    const pct = total ? Math.round((100 * n) / total) : 0;
    console.log(`  ${String(pct).padStart(3)} %  ${String(n).padStart(4)}  ${o.libelle}${o.livree_at ? ' (livrée)' : ''}  ${o.id}`);
  }
}

async function livree(id) {
  const [o] = await api(`options_vote?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ livree_at: new Date().toISOString() }),
  });
  if (!o) return console.log('Option introuvable.');
  if (o.idee_id) {
    await api(`idees?id=eq.${o.idee_id}`, { method: 'PATCH', body: JSON.stringify({ statut: 'livree' }) });
  }
  console.log(`« ${o.libelle} » apparaît dans « Vous l'avez demandé ».`);
}

const [commande, ...args] = process.argv.slice(2);
const commandes = {
  idees: () => idees(args[0]),
  statut: () => changerStatut(args[0], args[1]),
  campagne: () => campagne(args[0], args[1], args[2], args.slice(3)),
  resultats: () => resultats(args[0]),
  livree: () => livree(args[0]),
};

if (!commandes[commande]) {
  console.error('Commandes : idees, statut, campagne, resultats, livree. Détail en tête du fichier.');
  process.exit(1);
}
commandes[commande]().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
