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
