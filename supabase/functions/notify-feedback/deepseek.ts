// Brouillon de réponse au lecteur, via DeepSeek (déjà utilisé par
// generate-anecdote, avec la même clé).
//
// Un brouillon, jamais un envoi : cette fonction ne parle jamais au lecteur.
// Seul un clic humain sur le lien de feedback-envoyer, dans le mail d'alerte,
// déclenche l'envoi réel.

const BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(
  /\/+$/,
  ''
);
const MODELE = Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-chat';
const MAX_TENTATIVES = 3;

export interface ContexteRetour {
  libelle: string;
  comment: string | null;
  anecdote_titre: string | null;
  anecdote_ville: string | null;
}

export async function genererBrouillon(apiKey: string, retour: ContexteRetour): Promise<string> {
  const contexte = retour.anecdote_titre
    ? `à propos de l'anecdote « ${retour.anecdote_titre} » (${retour.anecdote_ville ?? 'ville inconnue'})`
    : 'sans anecdote associée';

  const prompt = `Un lecteur de l'application Anecto a laissé ${retour.libelle} ${contexte}.

Message du lecteur :
"""
${retour.comment ?? '(sans commentaire)'}
"""

Rédige une courte réponse en français, à la première personne du pluriel ("nous"), qui :
- remercie le lecteur pour sa contribution
- répond concrètement à sa demande si elle est actionnable (sinon, accuse réception avec sincérité)
- tient en 4 phrases maximum, ton chaleureux et direct, sans formule de politesse finale ni signature

Réponds uniquement avec le texte de la réponse, sans guillemets ni préambule.`;

  let dernierDetail = '';

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELE,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
        stream: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const texte = data?.choices?.[0]?.message?.content?.trim();
      if (!texte) throw new Error('Réponse DeepSeek vide.');
      return texte;
    }

    dernierDetail = `${res.status} ${await res.text()}`;

    // 429 et 5xx sont transitoires ; le reste (401 clé invalide, 402 solde
    // épuisé, 400 requête malformée) ne s'arrangera pas en réessayant.
    const reessayable = res.status === 429 || res.status >= 500;
    if (!reessayable || tentative === MAX_TENTATIVES) {
      throw new Error(`Appel DeepSeek en échec : ${dernierDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (tentative - 1)));
  }

  throw new Error(`Appel DeepSeek en échec : ${dernierDetail}`);
}
