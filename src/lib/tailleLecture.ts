/**
 * Taille de lecture de l'anecdote.
 *
 * Cinq paliers, de la taille actuelle (le défaut) jusqu'à +60 %. Seuls le
 * titre, l'accroche et le corps suivent : le reste de l'interface garde
 * sa taille. La police choisie dans le téléphone s'ajoute ensuite, via
 * `allowFontScaling` — iOS et Android (RN 0.81) multiplient déjà fontSize
 * et lineHeight ensemble. On ne multiplie pas une seconde fois ici.
 */

export const PALIERS = [1, 1.15, 1.3, 1.45, 1.6] as const;

export const INDICE_DEFAUT = 0;

/** Clé AsyncStorage. L'appareil s'en souvient, pas le profil Supabase. */
export const CLE_TAILLE_LECTURE = 'anecto.tailleLecture';

/**
 * La police système reste active. Posé en constante pour que les écrans
 * ne puissent pas la couper sans que le test le voie.
 */
export const AUTORISER_POLICE_SYSTEME = true;

/**
 * Padding horizontal des écrans de lecture. Le quiz s'en sert pour savoir
 * si « Vrai » et « Faux » tiennent encore côte à côte.
 */
export const PADDING_LECTURE = 20;

/**
 * Taille actuelle, avant tout palier.
 *
 * Le titre affiché est l'accroche, ou l'étiquette courte quand l'anecdote
 * n'en a pas. 21 pt plutôt que 24 : une accroche tient en deux lignes.
 * L'interligne du corps est large, le récit fait plusieurs paragraphes.
 */
export const TAILLE_TITRE = 21;
export const INTERLIGNE_TITRE = 28;
export const TAILLE_CORPS = 16;
export const INTERLIGNE_CORPS = 26;

export const PADDING_HORIZONTAL_BOUTON_QUIZ = 16;
export const ECART_BOUTONS_QUIZ = 12;

/**
 * Textes du quiz qui fixent à la fois une taille et un interligne.
 * Le rapport doit rester assez haut pour que le glyphe ne soit pas coupé
 * quand la police système agrandit les deux.
 */
export const TEXTES_QUIZ = {
  etiquette: { fontSize: 15, lineHeight: 21 },
  consigne: { fontSize: 16, lineHeight: 22 },
  affirmation: { fontSize: 24, lineHeight: 33 },
  bouton: { fontSize: 22, lineHeight: 30 },
  passer: { fontSize: 15, lineHeight: 21 },
  resultatTitre: { fontSize: 22, lineHeight: 30 },
  resultatAffirmation: { fontSize: 16, lineHeight: 23 },
  resultatTexte: { fontSize: 16, lineHeight: 23 },
  resultatScore: { fontSize: 15, lineHeight: 21 },
  partageTitre: { fontSize: 18, lineHeight: 24 },
  partageBouton: { fontSize: 17, lineHeight: 23 },
} as const;

/** « Vrai » / « Faux » : la taille dont on estime la largeur pour les empiler. */
export const TAILLE_BOUTON_QUIZ = TEXTES_QUIZ.bouton.fontSize;

/** Largeur estimée d'un caractère en gras, en fraction de la taille. */
const RATIO_LARGEUR_GLYPH = 0.7;

export type MesureTexte = { fontSize: number; lineHeight: number };

function normaliser(indice: number): number {
  if (!Number.isInteger(indice)) return INDICE_DEFAUT;
  if (indice < 0) return 0;
  if (indice >= PALIERS.length) return PALIERS.length - 1;
  return indice;
}

export function facteur(indice: number): number {
  return PALIERS[normaliser(indice)];
}

export function peutReduire(indice: number): boolean {
  return normaliser(indice) > 0;
}

export function peutAgrandir(indice: number): boolean {
  return normaliser(indice) < PALIERS.length - 1;
}

export function reduire(indice: number): number {
  return Math.max(0, normaliser(indice) - 1);
}

export function agrandir(indice: number): number {
  return Math.min(PALIERS.length - 1, normaliser(indice) + 1);
}

function mesure(taille: number, interligne: number, indice: number): MesureTexte {
  const f = facteur(indice);
  return { fontSize: taille * f, lineHeight: interligne * f };
}

/** Titre à l'écran : l'accroche et, à défaut, le titre court. Même mesure. */
export function mesureTitre(indice: number): MesureTexte {
  return mesure(TAILLE_TITRE, INTERLIGNE_TITRE, indice);
}

export function mesureCorps(indice: number): MesureTexte {
  return mesure(TAILLE_CORPS, INTERLIGNE_CORPS, indice);
}

/** Ce qui s'affiche en titre : l'accroche, sinon l'étiquette courte. */
export function texteDuTitre(anecdote: { hook?: string | null; title: string }): string {
  return anecdote.hook || anecdote.title;
}

/**
 * Une valeur illisible ou hors paliers revient au défaut : un stockage
 * corrompu ne doit pas ouvrir l'app sur le plus grand texte.
 */
export function indiceDepuisStockage(brut: string | null): number {
  if (brut == null) return INDICE_DEFAUT;
  const texte = brut.trim();
  if (!/^\d+$/.test(texte)) return INDICE_DEFAUT;
  const n = Number(texte);
  if (n < 0 || n >= PALIERS.length) return INDICE_DEFAUT;
  return n;
}

/** L'interligne couvre le glyphe : au moins 1,25 fois la taille. */
export function interligneSuffisant(fontSize: number, lineHeight: number): boolean {
  return lineHeight >= fontSize * 1.25;
}

export function largeurLibelle(texte: string, fontSize: number): number {
  return texte.length * fontSize * RATIO_LARGEUR_GLYPH;
}

/**
 * « Vrai » et « Faux » côte à côte débordent d'un téléphone étroit dès que
 * la police système grandit. On les empile alors, chacun sur sa ligne.
 */
export function empilerBoutonsQuiz(
  largeurContenu: number,
  facteurSysteme: number,
  libelles: readonly string[]
): boolean {
  if (!(largeurContenu > 0)) return true;
  const echelle = facteurSysteme > 0 ? facteurSysteme : 1;
  const font = TAILLE_BOUTON_QUIZ * echelle;
  const plusLong = libelles.reduce((max, mot) => Math.max(max, largeurLibelle(mot, font)), 0);
  const besoin = plusLong + PADDING_HORIZONTAL_BOUTON_QUIZ * 2;
  const colonne = (largeurContenu - ECART_BOUTONS_QUIZ) / 2;
  return besoin > colonne;
}
