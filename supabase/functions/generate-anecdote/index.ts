// Génère une anecdote pour une ville et l'enregistre en `draft`.
//
// Le principe : le modèle n'écrit jamais de mémoire. On lui donne d'abord des
// textes qui existent, il rédige à partir d'eux, et il doit recopier mot pour
// mot les phrases sur lesquelles il s'appuie. On vérifie ensuite ces citations
// par simple comparaison de chaînes — pas par jugement d'un modèle.
//
//   1. ancrage      — Wikipédia (article de la ville, son histoire, ses
//                     monuments liés) et base Mérimée (notices des monuments
//                     protégés, ministère de la Culture) ;
//   2. rédaction    — anecdote + citations verbatim tirées de ces articles ;
//   3. contrôle     — les citations existent-elles dans la source ? les
//                     millésimes du texte figurent-ils dans la source ?
//                     (déterministe, aucun modèle impliqué)
//   4. vérification — un second appel DeepSeek relit l'anecdote face à
//                     l'extrait et rend un verdict.
//
// Une anecdote dont les citations sont introuvables est rejetée : c'est le
// signe que le modèle a inventé. Ce qui survit reste malgré tout en `draft`,
// parce qu'un extrait Wikipédia n'est pas une validation éditoriale.
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// la fonction coûte de l'argent à chaque exécution et n'est pas destinée à
// être appelée depuis l'app.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, DEEPSEEK_MODEL, DeepSeekError } from './deepseek.ts';
import { fetchWikipediaDocs } from './wikipedia.ts';
import { fetchPatrimoineDocs } from './patrimoine.ts';
import type { SourceDoc } from './sources.ts';
import { controler } from './verification.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_COUNT = 5;
const MIN_BODY_CHARS = 50; // contrainte de la table `anecdotes`
const MAX_BODY_CHARS = 3000;

// Enveloppes de dossier, par origine : sans réservation, Wikipédia remplirait
// tout et les notices Mérimée n'atteindraient jamais le modèle.
const MAX_CHARS_WIKIPEDIA = 28000;
const MAX_CHARS_MERIMEE = 12000;

/** Tronque une liste de documents à un budget global de caractères. */
function budget(docs: SourceDoc[], max: number): SourceDoc[] {
  let total = 0;
  const retenus: SourceDoc[] = [];
  for (const doc of docs) {
    if (total >= max) break;
    const extract = doc.extract.slice(0, max - total);
    retenus.push({ ...doc, extract });
    total += extract.length;
  }
  return retenus;
}

/**
 * Le dossier soumis au modèle. Les deux sources sont interrogées en parallèle
 * et indépendamment : si l'une échoue, l'autre fait le travail.
 */
async function buildDossier(city: string): Promise<SourceDoc[]> {
  const [wiki, merimee] = await Promise.allSettled([
    fetchWikipediaDocs(city),
    fetchPatrimoineDocs(city),
  ]);

  if (wiki.status === 'rejected') console.error('Wikipédia', wiki.reason);
  if (merimee.status === 'rejected') console.error('Mérimée', merimee.reason);

  return [
    ...budget(wiki.status === 'fulfilled' ? wiki.value : [], MAX_CHARS_WIKIPEDIA),
    ...budget(merimee.status === 'fulfilled' ? merimee.value : [], MAX_CHARS_MERIMEE),
  ];
}

// ---------------------------------------------------------------- passe 1

const REDACTION_SYSTEM = `Tu écris des anecdotes d'histoire locale à partir d'un dossier documentaire qu'on te fournit. Tu ne disposes d'aucune autre source, et ta mémoire ne fait pas foi : tout ce que tu écris doit se trouver dans le dossier.

Ce qui fait une bonne anecdote : une coutume disparue, un épisode historique daté, l'origine d'un toponyme, un usage oublié d'un bâtiment. Pas de généralité géographique, pas de guide touristique, pas de démographie.

Règles absolues :
- N'écris aucune date, aucun chiffre, aucun nom propre qui ne figure pas dans le dossier.
- Pour chaque anecdote, recopie dans "citations" les phrases exactes du dossier qui l'établissent — caractère pour caractère, sans reformuler, sans couper un mot, sans corriger la ponctuation. Ces citations sont comparées automatiquement au dossier : une citation approximative fait rejeter tout le travail.
- Il te faut au moins deux citations distinctes.
- Si le dossier ne contient rien qui fasse une anecdote, renvoie trouve = false. C'est une réponse acceptable et attendue.

Style : titre de 2 à 6 mots sans point final ; corps de 60 à 110 mots, au présent, une seule idée, sans morale ni « saviez-vous que » ni question rhétorique.

Réponds uniquement par un objet json de cette forme :
{
  "trouve": true,
  "titre": "Les chiens du guet",
  "corps": "…",
  "periode": "XIIe–XVIIIe siècle",
  "citations": ["phrase exacte tirée du dossier", "autre phrase exacte"],
  "raison": ""
}

Si trouve vaut false, renseigne raison et laisse les autres champs vides.`;

interface Redaction {
  trouve: boolean;
  titre: string;
  corps: string;
  periode: string;
  citations: string[];
  raison: string;
}

// ---------------------------------------------------------------- passe 2

const VERIFICATION_SYSTEM = `Tu es vérificateur de faits. On te donne un dossier documentaire et une anecdote rédigée par quelqu'un d'autre. Ton travail est de contester l'anecdote, pas de la valider par politesse.

La seule question qui compte : chaque affirmation de l'anecdote est-elle soutenue par le dossier ? Ce que tu crois savoir par ailleurs ne compte pas. Une affirmation absente du dossier est un problème, même si elle te paraît vraie.

Vérifie en particulier les dates, les chiffres, les noms propres, et les liens de cause à effet — un texte peut n'utiliser que des éléments présents dans le dossier tout en affirmant entre eux un rapport que le dossier n'établit pas.

Verdicts :
- "confirme" : tout est soutenu par le dossier.
- "doute" : le fond est soutenu, mais un détail est absent du dossier ou déformé.
- "refute" : une affirmation contredit le dossier, ou l'essentiel n'y figure pas.

Réponds uniquement par un objet json de cette forme :
{
  "verdict": "doute",
  "confiance": "moyenne",
  "problemes": ["le lien entre X et Y n'est pas établi par le dossier"],
  "notes": "Bref commentaire pour le relecteur humain."
}

confiance vaut haute, moyenne ou faible.`;

interface Verification {
  verdict: 'confirme' | 'doute' | 'refute';
  confiance: 'haute' | 'moyenne' | 'faible';
  problemes: string[];
  notes: string;
}

// ----------------------------------------------------------------- prompts

function dossier(docs: SourceDoc[]): string {
  return docs
    .map((doc) => `=== ${doc.title} — ${doc.editeur} (${doc.url}) ===\n${doc.extract}`)
    .join('\n\n');
}

function redactionPrompt(city: string, docs: SourceDoc[], existingTitles: string[]): string {
  const dejaVues =
    existingTitles.length > 0
      ? `\n\nAnecdotes déjà enregistrées pour cette ville — trouve un autre sujet :\n${existingTitles
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

Écris une anecdote d'histoire locale sur ${city}, uniquement à partir du dossier ci-dessus. Réponds en json.${dejaVues}`;
}

function verificationPrompt(city: string, redaction: Redaction, docs: SourceDoc[]): string {
  return `DOSSIER DOCUMENTAIRE SUR ${city.toUpperCase()}
${dossier(docs)}

=== FIN DU DOSSIER ===

ANECDOTE À VÉRIFIER
Titre : ${redaction.titre}
Période annoncée : ${redaction.periode}

${redaction.corps}

Vérifie chaque affirmation contre le dossier et réponds en json.`;
}

// ------------------------------------------------------------- génération

type Resultat =
  | { ok: true; redaction: Redaction; verification: Verification; citations: string[] }
  | { ok: false; reason: string };

async function generateOne(
  apiKey: string,
  city: string,
  docs: SourceDoc[],
  existingTitles: string[]
): Promise<Resultat> {
  const redaction = await chatJSON<Redaction>({
    apiKey,
    system: REDACTION_SYSTEM,
    user: redactionPrompt(city, docs, existingTitles),
    // Le dossier borne déjà le contenu ; un peu de liberté sert seulement à
    // ne pas ressortir toujours le même passage.
    temperature: 0.7,
    maxTokens: 1500,
  });

  if (!redaction?.trouve) {
    return { ok: false, reason: redaction?.raison || "Rien d'exploitable dans le dossier." };
  }

  const titre = String(redaction.titre ?? '').trim();
  const corps = String(redaction.corps ?? '').trim();

  if (!titre || corps.length < MIN_BODY_CHARS || corps.length > MAX_BODY_CHARS) {
    return { ok: false, reason: `Texte hors format (${corps.length} caractères).` };
  }

  const clean: Redaction = {
    ...redaction,
    titre,
    corps,
    periode: String(redaction.periode ?? '').trim(),
  };

  const sourceText = docs.map((d) => d.extract).join('\n\n');
  const controle = controler(clean, sourceText);
  if (!controle.ok) {
    return { ok: false, reason: controle.reason! };
  }

  const verification = await chatJSON<Verification>({
    apiKey,
    system: VERIFICATION_SYSTEM,
    user: verificationPrompt(city, clean, docs),
    temperature: 0,
    maxTokens: 800,
  });

  if (verification?.verdict === 'refute') {
    return {
      ok: false,
      reason: `Rejetée à la vérification : ${(verification.problemes ?? []).join(' ; ') || verification.notes || 'contredit le dossier'}`,
    };
  }

  return { ok: true, redaction: clean, verification, citations: controle.citationsValides };
}

// -------------------------------------------------------------------- HTTP

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
  if (!DEEPSEEK_API_KEY) {
    return fail("DEEPSEEK_API_KEY n'est pas configurée sur la fonction.", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Corps de requête JSON invalide.');
  }

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const cityPlaceId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_COUNT);

  if (!city) {
    return fail('Paramètre `city` manquant.');
  }

  let docs: SourceDoc[];
  try {
    docs = await buildDossier(city);
  } catch (err) {
    console.error('Dossier', err);
    return json(
      { created: 0, skipped: [], error: `Ancrage documentaire indisponible : ${err}` },
      502
    );
  }

  // Pas de dossier, pas d'anecdote : on ne retombe jamais sur la mémoire du
  // modèle, c'est précisément ce qu'on cherche à éviter.
  if (docs.length === 0) {
    return json({
      created: 0,
      skipped: [`Aucune source exploitable pour « ${city} » (Wikipédia et Mérimée muets).`],
      anecdotes: [],
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const existingQuery = supabase.from('anecdotes').select('title').limit(60);
  const { data: existing } = cityPlaceId
    ? await existingQuery.eq('city_place_id', cityPlaceId)
    : await existingQuery.eq('city', city);

  const titles: string[] = (existing ?? []).map((row) => row.title);
  const created: unknown[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    let result: Resultat;
    try {
      result = await generateOne(DEEPSEEK_API_KEY, city, docs, titles);
    } catch (err) {
      const message = err instanceof DeepSeekError ? err.message : String(err);
      console.error('DeepSeek', message);
      return json({ created: created.length, skipped, error: message }, 502);
    }

    if (!result.ok) {
      skipped.push(result.reason);
      continue;
    }

    const { redaction, verification, citations } = result;

    const sources = docs.map((doc) => ({
      url: doc.url,
      titre: doc.title,
      editeur: doc.editeur,
    }));

    const notes = [
      `Verdict : ${verification.verdict} (confiance ${verification.confiance}).`,
      ...(verification.problemes ?? []),
      verification.notes ?? '',
      `Citations vérifiées automatiquement dans la source (${citations.length}) :`,
      ...citations.map((c) => `« ${c} »`),
    ]
      .filter(Boolean)
      .join('\n');

    const { data: inserted, error } = await supabase
      .from('anecdotes')
      .insert({
        city,
        city_place_id: cityPlaceId,
        title: redaction.titre,
        body: redaction.corps,
        period: redaction.periode || null,
        source: sources.map((s) => `${s.editeur} — ${s.titre}`).join(' ; '),
        source_url: sources[0].url,
        sources,
        confidence: verification.confiance ?? 'faible',
        verification_notes: notes,
        generated_by: `deepseek:${DEEPSEEK_MODEL} + ${[...new Set(docs.map((d) => d.origine))].join('+')}`,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      // 23505 = index unique (city_place_id, lower(title)) : déjà générée.
      if (error.code === '23505') {
        skipped.push(`Doublon : « ${redaction.titre} »`);
      } else {
        console.error('Insertion échouée', error);
        return json({ created: created.length, skipped, error: error.message }, 500);
      }
    } else {
      created.push(inserted);
      titles.push(redaction.titre);
    }
  }

  return json({
    created: created.length,
    // Rend visible ce qui a réellement nourri le modèle : c'est ici qu'on voit
    // si Mérimée a répondu, et avec quel volume.
    dossier: docs.map((d) => ({
      origine: d.origine,
      titre: d.title,
      url: d.url,
      caracteres: d.extract.length,
    })),
    skipped,
    anecdotes: created,
  });
});
