// Base Mérimée, via la Plateforme ouverte du patrimoine (ministère de la
// Culture). Une notice par monument protégé, avec un champ historique qui est
// exactement la matière qu'on cherche : dates de construction, commanditaires,
// remaniements, usages successifs.
//
// Gratuite, sans clé. L'API expose une recherche de type Elasticsearch.
//
// ⚠️ Contrat d'API non vérifié en conditions réelles depuis cet environnement
// (accès réseau restreint). Le code est donc défensif : toute anomalie
// renvoie un dossier vide et laisse Wikipédia faire le travail, plutôt que de
// faire échouer la génération. La réponse de la fonction indique quelles
// sources ont réellement contribué — c'est là qu'on verra si Mérimée répond.

import { SourceDoc, toPlainText } from './sources.ts';

const ENDPOINT = 'https://api.pop.culture.gouv.fr/search/merimee/_msearch';
const NOTICE_URL = 'https://www.pop.culture.gouv.fr/notice/merimee/';

const MAX_NOTICES = 8;
const MIN_CHARS = 300;
const MAX_CHARS_PER_DOC = 4000;
const TIMEOUT_MS = 15000;

// Les notices n'utilisent pas toutes les mêmes champs selon leur ancienneté.
const CHAMPS_TEXTE = ['HIST', 'HISTORIQUE', 'DESC', 'DESCR', 'PRESENT', 'REMPLOI'];
const CHAMPS_TITRE = ['TICO', 'TITRE', 'DENO', 'APPL'];

// deno-lint-ignore no-explicit-any
function firstString(source: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0].trim();
    }
  }
  return '';
}

export async function fetchPatrimoineDocs(city: string): Promise<SourceDoc[]> {
  // _msearch attend du NDJSON : une ligne d'en-tête, une ligne de requête.
  const body =
    JSON.stringify({ preference: 'anecto' }) +
    '\n' +
    JSON.stringify({
      size: MAX_NOTICES,
      query: {
        bool: {
          must: [{ match: { COM: city } }],
        },
      },
    }) +
    '\n';

  let payload: unknown;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error('Mérimée', res.status, (await res.text()).slice(0, 300));
      return [];
    }
    payload = await res.json();
  } catch (err) {
    console.error('Mérimée injoignable', err);
    return [];
  }

  // deno-lint-ignore no-explicit-any
  const hits: any[] = (payload as any)?.responses?.[0]?.hits?.hits ?? [];
  if (!Array.isArray(hits) || hits.length === 0) return [];

  const docs: SourceDoc[] = [];

  for (const hit of hits) {
    const source = hit?._source;
    if (!source || typeof source !== 'object') continue;

    // On ne garde que la commune demandée : `match` est tolérant et ramène
    // volontiers les communes voisines au nom proche.
    const commune = firstString(source, ['COM']);
    if (commune && commune.toLowerCase() !== city.toLowerCase()) continue;

    const texte = toPlainText(
      CHAMPS_TEXTE.map((champ) => firstString(source, [champ]))
        .filter(Boolean)
        .join('\n\n')
    );
    if (texte.length < MIN_CHARS) continue;

    const ref = firstString(source, ['REF']);
    const titre = firstString(source, CHAMPS_TITRE) || `Notice Mérimée ${ref}`;

    docs.push({
      origine: 'merimee',
      title: titre,
      url: ref ? `${NOTICE_URL}${encodeURIComponent(ref)}` : NOTICE_URL,
      editeur: 'Base Mérimée — ministère de la Culture',
      extract: texte.slice(0, MAX_CHARS_PER_DOC),
    });
  }

  return docs;
}
