// Prévient un lecteur que les villes voisines prennent le relais de la sienne.
//
// Appelée à la main (secret admin) quand on active `villes_voisines` à la
// place du lecteur, sa ville étant épuisée : il ne l'a pas demandé, il doit
// donc l'apprendre, et savoir comment revenir en arrière. Même compte SMTP et
// même expéditeur que « ta ville est prête » (`notify-city-ready`).
//
// Corps : { "userId": "<uuid>" }.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { lireReglages, ouvrirEnvoi } from './mail.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function message(ville: string, voisine: string | null): { sujet: string; texte: string; html: string } {
  const sujet = `Anecto — de nouvelles anecdotes autour de ${ville}`;
  const relais = voisine
    ? `Pour que ton anecdote du jour continue, Anecto te propose maintenant aussi celles des villes voisines, en commençant par ${voisine}. Chaque anecdote indique sa ville et sa distance.`
    : "Pour que ton anecdote du jour continue, Anecto te propose maintenant aussi celles des villes voisines. Chaque anecdote indique sa ville et sa distance.";
  const priorite = `${ville} reste prioritaire : dès qu'une nouvelle anecdote de ta ville est prête, elle passe en premier.`;
  const retour = `Tu préfères t'en tenir à ${ville} ? Désactive les villes voisines dans les Réglages de l'app.`;

  const texte = [
    `Tu arrives au bout des anecdotes de ${ville}.`,
    '',
    relais,
    '',
    priorite,
    '',
    retour,
    '',
    '—',
    `Tu reçois ce message parce que tu lis Anecto à ${ville}. C'est le seul message envoyé à ce titre.`,
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <div style="font-size:24px;font-weight:700;color:#b3402f;margin-bottom:16px">De nouvelles anecdotes autour de ${echapper(ville)}</div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Tu arrives au bout des anecdotes de ${echapper(ville)}.</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px">${echapper(relais)}</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px">${echapper(priorite)}</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 28px">${echapper(retour)}</p>
  <p style="font-size:12px;line-height:1.6;color:#999;border-top:1px solid #eee;padding-top:16px;margin:0">
    Tu reçois ce message parce que tu lis Anecto à ${echapper(ville)}. C'est le seul message envoyé à ce titre.
  </p>
</div>`;

  return { sujet, texte, html };
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

  const reglages = lireReglages();
  if (!reglages) {
    return fail('Configuration SMTP incomplète : SMTP_HOST, SMTP_USER et SMTP_PASS sont requis.', 500);
  }

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return fail('userId requis.');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profil, error } = await supabase
    .from('profiles')
    .select('city, city_place_id, villes_voisines')
    .eq('id', userId)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!profil?.city) return fail('Profil sans ville.', 404);
  // Le message annonce un réglage actif : il serait faux autrement.
  if (!profil.villes_voisines) return fail('Villes voisines non activées pour ce lecteur.', 409);

  const { data: compte } = await supabase.auth.admin.getUserById(userId);
  const email = compte?.user?.email;
  if (!email) return fail('Compte sans adresse.', 404);

  const { data: voisines } = await supabase
    .from('villes_voisines')
    .select('voisin_ville')
    .eq('place_id', profil.city_place_id)
    .order('rang')
    .limit(1);

  const { sujet, texte, html } = message(profil.city, voisines?.[0]?.voisin_ville ?? null);

  const envoi = await ouvrirEnvoi(reglages);
  try {
    await envoi.envoyer(email, sujet, texte, html);
  } catch (err) {
    console.error(`Envoi vers ${email}`, err);
    return json({ error: `Envoi impossible : ${err}` }, 502);
  } finally {
    await envoi.fermer().catch((err) => console.error('Fermeture SMTP', err));
  }

  return json({ prevenu: email, ville: profil.city });
});
