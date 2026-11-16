import textes from '../../locales/textes.fr.json';

export type CleTexte = keyof typeof textes;

/**
 * Les textes ajoutés pour la rétention et le partage, rangés dans
 * `locales/textes.fr.json`. `{nom}` est remplacé par la variable du même nom.
 *
 * `locales/fr.json` n'est pas utilisé ici : Expo le copie dans l'InfoPlist
 * iOS, où des clés d'interface n'ont rien à faire.
 */
export function t(cle: CleTexte, variables: Record<string, string | number> = {}): string {
  return textes[cle].replace(/\{(\w+)\}/g, (_, nom) => String(variables[nom] ?? ''));
}
