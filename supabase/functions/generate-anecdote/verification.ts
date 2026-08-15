// Le garde-fou du produit : c'est ici qu'on décide si une anecdote est
// soutenue par la source ou inventée. Aucun modèle n'intervient — que de la
// comparaison de chaînes, donc du déterministe et du testable.
//
// Ce fichier n'utilise aucune API Deno, exprès : les tests tournent aussi bien
// sous `deno test` que sous `node --experimental-strip-types --test`.

export const MIN_CITATIONS = 2;
export const MIN_CITATION_CHARS = 30;

export interface Controle {
  ok: boolean;
  reason?: string;
  citationsValides: string[];
}

export interface ARelire {
  corps: string;
  citations: unknown;
}

/**
 * Rend deux textes comparables : minuscules, accents retirés, apostrophes et
 * tirets typographiques uniformisés, espaces réduits. Le modèle recopie
 * rarement au caractère près, mais il ne peut pas inventer une phrase entière
 * qui survive à cette normalisation.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function controler(redaction: ARelire, sourceText: string): Controle {
  const source = normalize(sourceText);

  const citations = Array.isArray(redaction.citations)
    ? (redaction.citations as unknown[]).filter(
        (c): c is string => typeof c === 'string' && c.trim().length >= MIN_CITATION_CHARS
      )
    : [];

  const valides = citations.filter((c) => source.includes(normalize(c)));

  if (valides.length < MIN_CITATIONS) {
    return {
      ok: false,
      citationsValides: valides,
      reason: `${valides.length}/${citations.length} citation(s) retrouvée(s) dans la source, minimum ${MIN_CITATIONS}. Le modèle a probablement inventé.`,
    };
  }

  // Un millésime absent de la source est le symptôme le plus fréquent de
  // l'hallucination : le récit est plausible, la date est fabriquée.
  const millesimes = redaction.corps.match(/\b(?:1\d{3}|20\d{2})\b/g) ?? [];
  const inconnus = [...new Set(millesimes)].filter((annee) => !source.includes(annee));

  if (inconnus.length > 0) {
    return {
      ok: false,
      citationsValides: valides,
      reason: `Millésime(s) absent(s) de la source : ${inconnus.join(', ')}.`,
    };
  }

  return { ok: true, citationsValides: valides };
}
