// La rédaction, contrôlée comme les sources : par des règles, pas par un avis.
//
// `verification.ts` répond à « est-ce vrai ? ». Ce fichier répond à « est-ce
// écrit comme on l'a demandé ? » — la forme que le prompt de rédaction impose
// (longueur, paragraphes, voix impersonnelle, zéro affect) et que le modèle
// oublie une fois sur cinq. Une anecdote qui échoue ici n'est pas publiée : elle
// repart en correction avec la liste exacte de ce qui ne va pas.
//
// L'orthographe n'est pas contrôlable par des règles : c'est le vérificateur
// qui la relève (champ `fautes`), et la publication exige qu'il n'en trouve
// aucune.
//
// Aucune API Deno ici : les tests tournent sous Node, comme `verification.ts`.

export const MIN_MOTS = 300;
export const MAX_MOTS = 430;
export const MIN_PARAGRAPHES = 4;
export const MAX_PARAGRAPHES = 5;
export const MIN_MOTS_ACCROCHE = 10;
export const MAX_MOTS_ACCROCHE = 28;
export const MAX_TITRE_CHARS = 140;

// Formes fléchies comprises : « remarquables », « étonnante ».
const AFFECT =
  /(?<![\p{L}])(incroyables?|fascinant(?:e|s|es)?|étonnant(?:e|s|es)?|tragiques?|remarquables?|exceptionnel(?:le|s|les)?)(?![\p{L}])/giu;

const PRONOMS = /(?<![\p{L}])(je|j'|j’|nous|vous)(?![\p{L}])/giu;

const OUVERTURES_BANNIES = [/^au c(œ|oe)ur d/i, /^situé(e)? (en|à|au|dans)/i, /^dans le centre/i];

export interface ARediger {
  titre: string;
  accroche: string;
  corps: string;
}

export interface Qualite {
  ok: boolean;
  problemes: string[];
}

function mots(texte: string): number {
  const t = texte.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Le texte de l'auteur, sans ce qu'il cite. Un « nous » ou un point
 * d'interrogation entre guillemets appartient à la personne citée — le
 * récit, lui, reste impersonnel.
 */
export function horsCitations(texte: string): string {
  return texte.replace(/«[^»]*»/g, ' ').replace(/“[^”]*”/g, ' ').replace(/"[^"]*"/g, ' ');
}

export function controlerRedaction(r: ARediger): Qualite {
  const problemes: string[] = [];
  const titre = r.titre.trim();
  const accroche = r.accroche.trim();
  const corps = r.corps.trim();

  if (!titre) problemes.push('Titre absent.');
  if (titre.length > MAX_TITRE_CHARS) {
    problemes.push(`Titre trop long (${titre.length} caractères, maximum ${MAX_TITRE_CHARS}).`);
  }
  if (/[.]$/.test(titre)) problemes.push('Le titre se termine par un point.');

  const motsAccroche = mots(accroche);
  if (motsAccroche < MIN_MOTS_ACCROCHE || motsAccroche > MAX_MOTS_ACCROCHE) {
    problemes.push(
      `Accroche de ${motsAccroche} mots, attendu entre ${MIN_MOTS_ACCROCHE} et ${MAX_MOTS_ACCROCHE}.`
    );
  }
  if (/[.]$/.test(accroche)) problemes.push("L'accroche se termine par un point.");

  const motsCorps = mots(corps);
  if (motsCorps < MIN_MOTS || motsCorps > MAX_MOTS) {
    problemes.push(`Corps de ${motsCorps} mots, attendu entre ${MIN_MOTS} et ${MAX_MOTS}.`);
  }

  const paragraphes = corps.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (paragraphes < MIN_PARAGRAPHES || paragraphes > MAX_PARAGRAPHES) {
    problemes.push(
      `${paragraphes} paragraphe(s), attendu ${MIN_PARAGRAPHES} ou ${MAX_PARAGRAPHES}, séparés par une ligne vide.`
    );
  }

  if (/\*\*|__|^#|^\s*[-*] /m.test(corps)) {
    problemes.push('Mise en forme Markdown dans le corps (gras, titre ou liste).');
  }

  if (OUVERTURES_BANNIES.some((re) => re.test(corps))) {
    problemes.push(`Ouverture par une situation géographique générique : « ${corps.slice(0, 40)}… ».`);
  }

  const texteAuteur = horsCitations(`${accroche}\n${corps}`);

  const affects = [...new Set([...texteAuteur.matchAll(AFFECT)].map((m) => m[1].toLowerCase()))];
  if (affects.length > 0) {
    problemes.push(`Adjectif(s) d'affect interdit(s) : ${affects.join(', ')}.`);
  }

  const pronoms = [...new Set([...texteAuteur.matchAll(PRONOMS)].map((m) => m[1].toLowerCase()))];
  if (pronoms.length > 0) {
    problemes.push(`Voix personnelle (${pronoms.join(', ')}) : le récit doit rester impersonnel.`);
  }

  if (texteAuteur.includes('?')) {
    problemes.push('Question posée au lecteur : aucune question rhétorique.');
  }
  if (/saviez-vous/i.test(texteAuteur)) {
    problemes.push('Formule « saviez-vous » interdite.');
  }

  return { ok: problemes.length === 0, problemes };
}
