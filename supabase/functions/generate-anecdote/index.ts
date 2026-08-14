// Génère une anecdote vérifiée pour une ville, et l'enregistre en `draft`.
//
// Claude fait la recherche web côté serveur Anthropic (outil `web_search`),
// puis appelle l'outil `enregistrer_anecdote` avec un schéma strict — donc
// pas de JSON à parser à la main, pas de format qui dérive.
//
// Rien n'est publié automatiquement : le statut reste `draft` jusqu'à
// validation humaine. C'est ce qui tient la promesse « vraie et vérifiée ».
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// cette fonction coûte de l'argent à chaque exécution, elle n'est pas
// destinée à être appelée depuis l'app.

import Anthropic from 'npm:@anthropic-ai/sdk@^0.110.0';
import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from '../_shared/cors.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANECTO_ANTHROPIC_MODEL') ?? 'claude-opus-5';
const EFFORT = Deno.env.get('ANECTO_ANTHROPIC_EFFORT') ?? 'high';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TOOL_NAME = 'enregistrer_anecdote';
const MAX_TURNS = 12;
const MIN_SOURCES = 2;

const SYSTEM_PROMPT = `Tu documentes des anecdotes historiques locales pour une application qui promet à ses lecteurs des faits vrais et vérifiés. Une anecdote inventée ou approximative est le pire résultat possible : mieux vaut ne rien rendre.

Méthode :
1. Cherche sur le web des faits précis et datés liés à la ville demandée : coutumes disparues, épisodes historiques, origines de toponymes, personnages locaux, particularités architecturales.
2. Écarte tout ce que tu ne peux pas rattacher à au moins deux sources indépendantes et sérieuses (archives, musées, sites municipaux, presse établie, ouvrages universitaires). Les blogs, forums, contenus générés par IA et sites de listes ne comptent pas comme sources.
3. Vérifie chaque date, chiffre et nom propre directement dans les sources. Si une source contredit l'autre sur un détail, écris la version la plus prudente ou abandonne le détail.
4. Appelle l'outil ${TOOL_NAME} une fois le fait établi.

Si après recherche tu n'as rien qui tienne ce niveau d'exigence, ne remplis pas l'outil : réponds simplement par un court texte expliquant ce qui bloque.

Style attendu :
- Titre de 2 à 6 mots, concret, sans point final.
- Corps de 60 à 110 mots, au présent de narration, une seule idée. Pas de morale, pas de « saviez-vous que », pas de question rhétorique.
- Chaque date ou chiffre cité doit apparaître tel quel dans une des sources.`;

const tools = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 10 },
  {
    name: TOOL_NAME,
    description:
      "Enregistre l'anecdote vérifiée. À n'appeler qu'une fois les faits confirmés par au moins deux sources indépendantes.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        titre: { type: 'string', description: 'Titre court, 2 à 6 mots, sans point final.' },
        corps: { type: 'string', description: "Le texte de l'anecdote, 60 à 110 mots." },
        periode: {
          type: 'string',
          description: 'Époque ou date du fait, par exemple "1770" ou "XIIe–XVIIIe siècle".',
        },
        sources: {
          type: 'array',
          description: 'Les sources consultées qui établissent le fait.',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL consultée.' },
              titre: { type: 'string', description: 'Titre de la page ou du document.' },
              editeur: {
                type: 'string',
                description: "Organisme responsable : archives, musée, presse, éditeur.",
              },
            },
            required: ['url', 'titre', 'editeur'],
            additionalProperties: false,
          },
        },
        confiance: {
          type: 'string',
          enum: ['haute', 'moyenne', 'faible'],
          description: 'Ton niveau de certitude sur le fait tel que tu le formules.',
        },
        notes_verification: {
          type: 'string',
          description:
            "Ce que tu as vérifié et ce qui reste incertain. Lu par le relecteur humain, pas par l'utilisateur final.",
        },
      },
      required: ['titre', 'corps', 'periode', 'sources', 'confiance', 'notes_verification'],
      additionalProperties: false,
    },
  },
];

interface Source {
  url: string;
  titre: string;
  editeur: string;
}

interface AnecdoteDraft {
  titre: string;
  corps: string;
  periode: string;
  sources: Source[];
  confiance: 'haute' | 'moyenne' | 'faible';
  notes_verification: string;
}

function buildPrompt(city: string, existingTitles: string[]): string {
  const dejaVues =
    existingTitles.length > 0
      ? `\n\nAnecdotes déjà publiées pour cette ville — trouve autre chose, y compris un autre angle sur le même lieu :\n${existingTitles
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  return `Trouve une anecdote vraie et vérifiable sur ${city}.${dejaVues}`;
}

async function generate(
  anthropic: Anthropic,
  city: string,
  existingTitles: string[]
): Promise<{ draft: AnecdoteDraft } | { error: string }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: buildPrompt(city, existingTitles) },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      // Les classificateurs de sûreté peuvent refuser une requête ; `fallbacks`
      // la rejoue côté serveur sur le modèle de repli recommandé.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };

    const response = (await anthropic.beta.messages.create(
      params
    )) as Anthropic.Beta.BetaMessage;

    if (response.stop_reason === 'refusal') {
      return {
        error: `Requête refusée par les classificateurs (${response.stop_details?.category ?? 'sans catégorie'}).`,
      };
    }

    // L'outil de recherche web a atteint sa limite d'itérations serveur :
    // on renvoie le tour tel quel pour que Claude reprenne où il s'est arrêté.
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUse = response.content.find(
      (block) => block.type === 'tool_use' && block.name === TOOL_NAME
    );

    if (toolUse && toolUse.type === 'tool_use') {
      return { draft: toolUse.input as AnecdoteDraft };
    }

    // Pas d'appel d'outil et pas de pause : Claude explique pourquoi il n'a
    // rien trouvé de suffisamment solide.
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim();

    return { error: text || "Aucune anecdote vérifiable trouvée pour cette ville." };
  }

  return { error: `Abandon après ${MAX_TURNS} tours sans anecdote finalisée.` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }
  if (!ANTHROPIC_API_KEY) {
    return fail("ANTHROPIC_API_KEY n'est pas configurée sur la fonction.", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Corps de requête JSON invalide.');
  }

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const cityPlaceId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  if (!city) {
    return fail('Paramètre `city` manquant.');
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // On donne à Claude ce qui existe déjà pour éviter les doublons d'angle.
  const existingQuery = supabase.from('anecdotes').select('title').limit(60);
  const { data: existing } = cityPlaceId
    ? await existingQuery.eq('city_place_id', cityPlaceId)
    : await existingQuery.eq('city', city);

  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    timeout: 10 * 60 * 1000,
  });

  const result = await generate(anthropic, city, (existing ?? []).map((row) => row.title));

  if ('error' in result) {
    console.error('Génération abandonnée', { city, reason: result.error });
    return json({ generated: false, reason: result.error }, 200);
  }

  const draft = result.draft;
  const sources = Array.isArray(draft.sources) ? draft.sources : [];

  if (sources.length < MIN_SOURCES) {
    return json(
      { generated: false, reason: `Seulement ${sources.length} source(s), minimum ${MIN_SOURCES}.` },
      200
    );
  }

  const { data: inserted, error } = await supabase
    .from('anecdotes')
    .insert({
      city,
      city_place_id: cityPlaceId,
      title: draft.titre,
      body: draft.corps,
      period: draft.periode,
      source: sources.map((s) => `${s.titre} — ${s.editeur}`).join(' ; '),
      source_url: sources[0].url,
      sources,
      confidence: draft.confiance,
      verification_notes: draft.notes_verification,
      generated_by: MODEL,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    // 23505 = violation d'index unique : l'anecdote existe déjà.
    const duplicate = error.code === '23505';
    console.error('Insertion échouée', error);
    return json(
      { generated: false, reason: duplicate ? 'Anecdote déjà présente.' : error.message },
      duplicate ? 200 : 500
    );
  }

  return json({ generated: true, anecdote: inserted });
});
