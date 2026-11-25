// Petit client DeepSeek (API compatible OpenAI).
//
// On n'utilise pas le SDK openai : un seul endpoint est nécessaire, et un
// `fetch` direct évite d'embarquer une dépendance npm dans le bundle Deno.

const BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(
  /\/+$/,
  ''
);

export const DEEPSEEK_MODEL = Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-chat';

const MAX_ATTEMPTS = 3;

export class DeepSeekError extends Error {}

interface ChatOptions {
  apiKey: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
  /** Ce que l'appel sert à faire (plan, rédaction, vérification…) : pour le suivi. */
  etape?: string;
  ville?: string;
}

/** Ce qu'un appel a consommé, tel que DeepSeek le facture. */
export interface Consommation {
  etape: string;
  ville: string | null;
  modele: string;
  jetons_entree: number;
  jetons_cache: number;
  jetons_sortie: number;
}

// Le 10 octobre, on ne savait pas ce que coûtait une journée : aucun appel
// n'était compté. Chaque réponse porte pourtant son décompte (`usage`).
// `index.ts` branche ici l'écriture en base ; sans branchement, rien n'est
// compté et rien ne casse.
let journal: ((c: Consommation) => Promise<void>) | null = null;

export function compterAvec(fn: (c: Consommation) => Promise<void>): void {
  journal = fn;
}

async function chat(opts: ChatOptions): Promise<string> {
  let lastDetail = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        // DeepSeek exige que le mot « json » apparaisse dans le prompt pour
        // activer ce mode — les prompts d'appel le contiennent.
        response_format: { type: 'json_object' },
        temperature: opts.temperature,
        max_tokens: opts.maxTokens ?? 2000,
        stream: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const usage = data?.usage;
      if (usage && journal) {
        // Le suivi ne doit jamais faire échouer l'appel qu'il décrit.
        try {
          await journal({
            etape: opts.etape ?? 'autre',
            ville: opts.ville ?? null,
            modele: DEEPSEEK_MODEL,
            jetons_entree: Number(usage.prompt_tokens) || 0,
            jetons_cache: Number(usage.prompt_cache_hit_tokens) || 0,
            jetons_sortie: Number(usage.completion_tokens) || 0,
          });
        } catch (err) {
          console.error('Suivi DeepSeek', err);
        }
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new DeepSeekError('Réponse DeepSeek vide.');
      }
      return content;
    }

    lastDetail = `${res.status} ${await res.text()}`;

    // 429 et 5xx sont transitoires ; le reste (401 clé invalide,
    // 402 solde épuisé, 400 requête malformée) ne s'arrangera pas en réessayant.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new DeepSeekError(`Appel DeepSeek en échec : ${lastDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  }

  throw new DeepSeekError(`Appel DeepSeek en échec : ${lastDetail}`);
}

/**
 * Comme `chat`, mais garantit un objet JSON en retour. Le modèle glisse parfois
 * un bloc ```json autour de sa réponse : on le retire avant de parser, et on
 * relance une fois si le JSON reste invalide.
 */
export async function chatJSON<T>(opts: ChatOptions): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await chat(opts);
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      if (attempt === 2) {
        throw new DeepSeekError(`JSON invalide renvoyé par DeepSeek : ${raw.slice(0, 300)}`);
      }
    }
  }

  throw new DeepSeekError('JSON invalide renvoyé par DeepSeek.');
}
