// Le lien de relecture du rapport : une anecdote, une date d'expiration, une
// signature. Le même fichier vit dans `rapport-quotidien` (qui signe) et dans
// `relecture` (qui vérifie) : chaque fonction est autonome.
//
// La clé dérive d'ANECTO_ADMIN_SECRET, qui ne quitte jamais les fonctions.
// Un lien ne vaut que pour une anecdote, et sept jours : transféré par
// erreur, il ne donne pas la main sur le reste.

export const DUREE_LIEN_MS = 7 * 24 * 3600 * 1000;

async function cle(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${secret}:relecture`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function signer(secret: string, id: string, exp: number): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await cle(secret), new TextEncoder().encode(`${id}.${exp}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparaison à temps constant : la durée ne trahit pas le préfixe juste. */
export async function verifierSignature(secret: string, id: string, exp: number, sig: string): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const attendue = await signer(secret, id, exp);
  if (attendue.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < attendue.length; i++) diff |= attendue.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
