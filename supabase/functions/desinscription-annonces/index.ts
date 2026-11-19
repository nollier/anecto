// Lien « Ne plus recevoir les annonces de vote » des emails.
//
// GET ?u=<user_id>&t=<jeton>. Le jeton est un HMAC du compte (voir
// annonce-vote/contenu.ts) : sans le secret, impossible de désinscrire un
// autre compte. Répond par une page HTML courte, lisible sur téléphone.

import { createClient } from 'npm:@supabase/supabase-js@^2';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function hex(octets: ArrayBuffer): string {
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function jeton(userId: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`annonces:${userId}`));
  return hex(sig).slice(0, 32);
}

function page(titre: string, texte: string, status = 200): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Anecto</title></head>
<body style="margin:0;background:#f3efeb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a">
<div style="max-width:440px;margin:48px auto;background:#fff;border-radius:12px;padding:28px 24px">
<div style="font-family:Georgia,serif;font-size:24px;color:#a8402f;margin-bottom:14px">Anecto</div>
<h1 style="font-size:20px;margin:0 0 10px">${titre}</h1>
<p style="font-size:15px;line-height:1.55;color:#444;margin:0">${texte}</p>
</div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';

  if (!ADMIN_SECRET || !userId || t.length !== 32 || t !== (await jeton(userId, ADMIN_SECRET))) {
    return page('Lien invalide', "Ce lien de désinscription n'est pas valide.", 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from('profiles').update({ annonces_email: false }).eq('id', userId);
  if (error) {
    console.error('Désinscription', error);
    return page('Oups', 'La désinscription a échoué. Réessaie dans quelques minutes.', 500);
  }

  return page(
    "C'est noté",
    "Tu ne recevras plus d'email à l'ouverture des votes. Le vote reste accessible dans l'onglet Communauté de l'app."
  );
});
