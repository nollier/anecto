/** Un document du dossier soumis au modèle. Tout ce qu'il écrit doit s'y trouver. */
export interface SourceDoc {
  /** D'où vient le document — sert au suivi et à l'attribution en base. */
  origine: 'wikipedia' | 'merimee';
  title: string;
  url: string;
  editeur: string;
  extract: string;
}

/** Retire le balisage résiduel et resserre les blancs d'un texte de notice. */
export function toPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Mélange une liste sur place (Fisher-Yates), puis la rend. Sans mélange, une
 * source rend toujours la même tranche — ordre alphabétique d'une catégorie,
 * notices triées par longueur — et le dossier relit indéfiniment les mêmes
 * documents. `hasard` est injectable pour les tests.
 */
export function melanger<T>(liste: T[], hasard: () => number = Math.random): T[] {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}
