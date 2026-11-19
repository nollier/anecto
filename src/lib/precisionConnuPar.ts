/** Longueur max du texte libre « Autre », en caractères Unicode. */
export const PRECISION_CONNU_PAR_MAX = 200;

/**
 * Texte libre à enregistrer avec la réponse « autre ».
 *
 * Null si la réponse n'est pas « autre », ou si le texte est vide une fois
 * trimmé. Au plus 200 caractères, sans espace en bord : c'est la forme que
 * la contrainte `profiles_connu_par_precision_ok` accepte.
 */
export function precisionConnuPar(reponse: string | null, texte: string): string | null {
  if (reponse !== 'autre') return null;
  // `Array.from` compte les caractères Unicode, comme `char_length` en base,
  // et ne coupe pas un emoji au milieu.
  const propre = Array.from(texte.trim()).slice(0, PRECISION_CONNU_PAR_MAX).join('').trim();
  return propre.length > 0 ? propre : null;
}
