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
