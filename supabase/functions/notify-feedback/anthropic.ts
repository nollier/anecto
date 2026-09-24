// Brouillon de réponse au lecteur, via l'API Anthropic.
//
// Un brouillon, jamais un envoi : cette fonction ne parle jamais au lecteur.
// Seul un clic humain sur le lien de feedback-envoyer, dans le mail d'alerte,
// déclenche l'envoi réel.

const MODELE = 'claude-haiku-4-5-20251001';

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELE,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status} : ${await res.text()}`);
  }

  const data = await res.json();
  const texte = data.content?.[0]?.text?.trim();
  if (!texte) throw new Error('Réponse Anthropic vide');
  return texte;
}
