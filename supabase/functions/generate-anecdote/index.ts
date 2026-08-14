// Génère une anecdote pour une ville et l'enregistre en `draft`.
//
// Deux passes DeepSeek, avec des contextes séparés :
//   1. rédaction    — le modèle propose une anecdote et liste les faits
//                     précis sur lesquels elle repose ;
//   2. vérification — un second appel, qui ne sait pas qu'il relit sa propre
//                     production, examine chaque fait et rend un verdict.
//
// ⚠️ Limite assumée : l'API DeepSeek n'expose pas d'outil de recherche web.
// La passe 2 est donc une auto-vérification de mémoire, pas un sourçage. Elle
// rattrape une bonne part des dates inventées avec aplomb, mais elle ne
// prouve rien. C'est pourquoi :
//   - on n'écrit jamais autre chose que status = 'draft' ;
//   - on ne demande jamais d'URL au modèle (il en inventerait), seulement des
//     pistes de vérification que le relecteur humain ira contrôler.
// Brancher une vraie API de recherche (Tavily, Brave) plus tard consiste à
// injecter les extraits trouvés dans le prompt de la passe 1.
//
// Appel protégé par un secret partagé (en-tête x-anecto-admin-secret) :
// la fonction coûte de l'argent à chaque exécution et n'est pas destinée à
// être appelée depuis l'app.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, DEEPSEEK_MODEL, DeepSeekError } from './deepseek.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_COUNT = 5;
const MIN_BODY_CHARS = 50; // contrainte de la table `anecdotes`
const MAX_BODY_CHARS = 3000;

// ---------------------------------------------------------------- passe 1

const REDACTION_SYSTEM = `Tu écris des anecdotes d'histoire locale pour une application qui promet à ses lecteurs des faits vrais. Une anecdote inventée est le pire résultat possible : quand tu n'es pas sûr, tu le dis plutôt que de combler les trous.

Ce qui fait une bonne anecdote : une coutume disparue, un épisode historique daté, l'origine d'un toponyme, un usage oublié d'un bâtiment, une particularité locale documentée. Pas de généralité sur la région, pas de guide touristique.

Règles absolues :
- N'invente jamais d'URL, de lien, ni de titre d'article. Tu ne consultes rien : tu écris de mémoire.
- Ne cite une date, un chiffre ou un nom propre que si tu en es réellement sûr. Sinon reformule sans, ou choisis un autre sujet.
- Si tu ne connais rien de solide sur cette ville, renvoie trouve = false. C'est une réponse acceptable et attendue.

Style : titre de 2 à 6 mots sans point final ; corps de 60 à 110 mots, au présent, une seule idée, sans morale ni « saviez-vous que » ni question rhétorique.

Réponds uniquement par un objet json de cette forme :
{
  "trouve": true,
  "titre": "Les chiens du guet",
  "corps": "…",
  "periode": "XIIe–XVIIIe siècle",
  "faits_verifiables": ["fait précis 1", "fait précis 2"],
  "pistes_de_verification": [
    {"type": "archives", "reference": "Archives municipales de la ville, fonds X"},
    {"type": "encyclopedie", "reference": "Wikipédia — article Y"}
  ],
  "raison": ""
}

Les types de piste autorisés : archives, ouvrage, presse, musee, encyclopedie. Si trouve vaut false, renseigne raison et laisse les autres champs vides.`;

interface Piste {
  type: string;
  reference: string;
}

interface Redaction {
  trouve: boolean;
  titre: string;
  corps: string;
  periode: string;
  faits_verifiables: string[];
  pistes_de_verification: Piste[];
  raison: string;
}

// ---------------------------------------------------------------- passe 2

const VERIFICATION_SYSTEM = `Tu es vérificateur de faits pour une publication d'histoire locale. On te soumet une anecdote rédigée par quelqu'un d'autre ; ton travail est de la contester, pas de la valider par politesse.

Pour chaque fait, demande-toi : est-ce que je connais réellement cet élément, ou est-ce qu'il me semble seulement plausible ? Un fait plausible mais inconnu de toi est un doute, pas une confirmation. Une date précise que tu ne peux pas rattacher à un souvenir net est un doute.

Verdicts :
- "confirme" : tu reconnais ces faits et ils sont exacts tels qu'écrits.
- "doute" : le fond te paraît réel mais un détail (date, chiffre, nom) est incertain ou invérifiable pour toi.
- "refute" : au moins un élément est faux, ou l'anecdote ne correspond pas à cette ville.

Réponds uniquement par un objet json de cette forme :
{
  "verdict": "doute",
  "confiance": "moyenne",
  "problemes": ["la date de 1770 ne m'est pas confirmée"],
  "notes": "Le fond est documenté ; le détail chiffré est à contrôler aux archives."
}

confiance vaut haute, moyenne ou faible.`;

interface Verification {
  verdict: 'confirme' | 'doute' | 'refute';
  confiance: 'haute' | 'moyenne' | 'faible';
  problemes: string[];
  notes: string;
}

// ----------------------------------------------------------------- helpers

const TYPES_PISTE = ['archives', 'ouvrage', 'presse', 'musee', 'encyclopedie'];

function cleanPistes(pistes: unknown): Piste[] {
  if (!Array.isArray(pistes)) return [];
  return pistes
    .filter(
      (p): p is Piste =>
        !!p && typeof p.type === 'string' && typeof p.reference === 'string' && !!p.reference.trim()
    )
    .map((p) => ({
      type: TYPES_PISTE.includes(p.type.toLowerCase()) ? p.type.toLowerCase() : 'ouvrage',
      reference: p.reference.trim(),
    }));
}

/** Le modèle glisse parfois une URL malgré la consigne : on la retire. */
function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function redactionPrompt(city: string, existingTitles: string[]): string {
  const dejaVues =
    existingTitles.length > 0
      ? `\n\nAnecdotes déjà enregistrées pour cette ville — trouve un autre sujet :\n${existingTitles
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  return `Écris une anecdote d'histoire locale sur ${city}. Réponds en json.${dejaVues}`;
}

function verificationPrompt(city: string, redaction: Redaction): string {
  return `Ville : ${city}
Titre : ${redaction.titre}
Période annoncée : ${redaction.periode}

Texte :
${redaction.corps}

Faits sur lesquels le texte repose :
${redaction.faits_verifiables.map((f) => `- ${f}`).join('\n')}

Vérifie et réponds en json.`;
}

async function generateOne(
  apiKey: string,
  city: string,
  existingTitles: string[]
): Promise<
  | { ok: true; redaction: Redaction; verification: Verification }
  | { ok: false; reason: string }
> {
  const redaction = await chatJSON<Redaction>({
    apiKey,
    system: REDACTION_SYSTEM,
    user: redactionPrompt(city, existingTitles),
    // Assez de liberté pour ne pas ressortir toujours le même sujet, pas assez
    // pour partir dans l'invention.
    temperature: 0.8,
    maxTokens: 1500,
  });

  if (!redaction?.trouve) {
    return { ok: false, reason: redaction?.raison || 'Le modèle ne connaît rien de solide ici.' };
  }

  const titre = stripUrls(String(redaction.titre ?? '')).trim();
  const corps = stripUrls(String(redaction.corps ?? '')).trim();

  if (!titre || corps.length < MIN_BODY_CHARS || corps.length > MAX_BODY_CHARS) {
    return { ok: false, reason: `Texte hors format (${corps.length} caractères).` };
  }

  const faits = Array.isArray(redaction.faits_verifiables)
    ? redaction.faits_verifiables.filter((f) => typeof f === 'string' && f.trim())
    : [];

  const clean: Redaction = {
    ...redaction,
    titre,
    corps,
    periode: stripUrls(String(redaction.periode ?? '')).trim(),
    faits_verifiables: faits,
    pistes_de_verification: cleanPistes(redaction.pistes_de_verification),
  };

  // Contexte neuf : le vérificateur ne sait pas qu'il relit sa propre copie.
  const verification = await chatJSON<Verification>({
    apiKey,
    system: VERIFICATION_SYSTEM,
    user: verificationPrompt(city, clean),
    temperature: 0,
    maxTokens: 800,
  });

  if (verification?.verdict === 'refute') {
    return {
      ok: false,
      reason: `Rejetée à la vérification : ${(verification.problemes ?? []).join(' ; ') || verification.notes || 'faits contestés'}`,
    };
  }

  return { ok: true, redaction: clean, verification };
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const existingQuery = supabase.from('anecdotes').select('title').limit(60);
  const { data: existing } = cityPlaceId
    ? await existingQuery.eq('city_place_id', cityPlaceId)
    : await existingQuery.eq('city', city);

  const titles: string[] = (existing ?? []).map((row) => row.title);
  const created: unknown[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    let result;
    try {
      result = await generateOne(DEEPSEEK_API_KEY, city, titles);
    } catch (err) {
      const message = err instanceof DeepSeekError ? err.message : String(err);
      console.error('DeepSeek', message);
      return json({ created, skipped, error: message }, 502);
    }

    if (!result.ok) {
      skipped.push(result.reason);
      continue;
    }

    const { redaction, verification } = result;
    const pistes = redaction.pistes_de_verification;

    const notes = [
      `Verdict auto-vérification : ${verification.verdict} (confiance ${verification.confiance}).`,
      ...(verification.problemes ?? []),
      verification.notes ?? '',
      'Généré sans accès web : les pistes ci-dessus sont à contrôler avant validation.',
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
        // `source` est NOT NULL en base : on y met les pistes, en assumant
        // qu'elles ne sont pas encore vérifiées.
        source:
          pistes.length > 0
            ? pistes.map((p) => `${p.type} — ${p.reference}`).join(' ; ')
            : 'À sourcer — généré sans accès web',
        source_url: null,
        sources: pistes,
        confidence: verification.confiance ?? 'faible',
        verification_notes: notes,
        generated_by: `deepseek:${DEEPSEEK_MODEL}`,
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
        return json({ created, skipped, error: error.message }, 500);
      }
    } else {
      created.push(inserted);
      titles.push(redaction.titre);
    }
  }

  return json({ created: created.length, skipped, anecdotes: created });
});
