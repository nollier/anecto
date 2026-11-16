// Lecture et écriture du CSV des affirmations « Vrai ou faux ? ».
// Séparateur « ; » (celui d'Excel et de LibreOffice en français), champs
// entre guillemets dès qu'ils contiennent « ; », un guillemet ou un retour.

export const ENTETES = ['id', 'ville', 'accroche', 'extrait', 'affirmation', 'reponse'];

function champ(v) {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ecrireCsv(lignes) {
  return [ENTETES.join(';'), ...lignes.map((l) => ENTETES.map((e) => champ(l[e])).join(';'))].join('\n') + '\n';
}

export function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let cellule = '';
  let guillemets = false;
  const t = texte.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') guillemets = false;
      else cellule += c;
    } else if (c === '"') guillemets = true;
    else if (c === ';') { ligne.push(cellule); cellule = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cellule); cellule = '';
      if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);
      ligne = [];
    } else cellule += c;
  }
  ligne.push(cellule);
  if (ligne.some((x) => x.trim() !== '')) lignes.push(ligne);

  const [entete, ...corps] = lignes;
  if (!entete) return [];
  const index = Object.fromEntries(entete.map((e, i) => [e.trim().toLowerCase(), i]));
  return corps.map((l) => Object.fromEntries(ENTETES.map((e) => [e, (l[index[e]] ?? '').trim()])));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Les lignes prêtes à importer, et les erreurs. Une ligne sans affirmation
 * est ignorée (pas encore rédigée). La réponse s'écrit VRAI ou FAUX.
 */
export function valider(lignes) {
  const pretes = [];
  const erreurs = [];
  lignes.forEach((l, i) => {
    const n = i + 2; // numéro de ligne dans le tableur, en-tête comprise
    if (!l.affirmation) return;
    if (!UUID.test(l.id)) return erreurs.push(`ligne ${n} : identifiant invalide`);
    const longueur = l.affirmation.length;
    if (longueur < 10 || longueur > 200) {
      return erreurs.push(`ligne ${n} : affirmation de ${longueur} caractères (10 à 200)`);
    }
    const r = l.reponse.toUpperCase();
    if (r !== 'VRAI' && r !== 'FAUX') return erreurs.push(`ligne ${n} : réponse « ${l.reponse} », attendu VRAI ou FAUX`);
    pretes.push({ id: l.id, quiz_affirmation: l.affirmation, quiz_reponse: r === 'VRAI' });
  });
  return { pretes, erreurs };
}

/** Le début du récit, pour rédiger sans ouvrir l'app. */
export function extrait(corps, max = 280) {
  const s = (corps ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max)) + '…';
}
