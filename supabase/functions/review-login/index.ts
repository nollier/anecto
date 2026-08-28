// Connexion du compte de revue, sans passer par la boîte mail.
//
// Les examinateurs d'Apple et de Google doivent pouvoir ouvrir l'application.
// Or la connexion repose sur un code envoyé par e-mail, et ils n'ont pas accès
// à la boîte qui le reçoit. Supabase hébergé ne permet pas de figer un code
// pour une adresse donnée — l'option existe pour le téléphone, en
// auto-hébergement seulement. D'où cette fonction.
//
// Elle ne contourne pas l'authentification : elle demande à Supabase un jeton
// de connexion valide pour ce compte précis, et c'est l'application qui
// l'échange ensuite contre une session par la voie normale. Aucun droit
// particulier n'est accordé — le compte de revue est un compte de lecteur
// ordinaire, soumis aux mêmes politiques RLS que les autres.
//
// L'adresse et le code vivent dans les secrets de la fonction, jamais dans le
// dépôt, qui est public. La comparaison est à temps constant, et tout échec
// coûte une seconde : à ce rythme, deviner huit chiffres au hasard demanderait
// des années.
//
// À SUPPRIMER une fois les deux magasins ayant approuvé l'application :
//   supabase functions delete review-login

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVIEW_EMAIL = Deno.env.get('ANECTO_REVIEW_EMAIL');
const REVIEW_CODE = Deno.env.get('ANECTO_REVIEW_CODE');

/** Comparaison à temps constant : sa durée ne dit rien du nombre de caractères justes. */
function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }

  // Sans secrets configurés, la fonction est inerte plutôt que permissive.
  if (!REVIEW_EMAIL || !REVIEW_CODE) {
    return fail('Compte de revue non configuré.', 503);
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return fail('Corps de requête invalide.');
  }

  const email = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
  const code = typeof corps.code === 'string' ? corps.code.trim() : '';

  if (!egal(email, REVIEW_EMAIL.trim().toLowerCase()) || !egal(code, REVIEW_CODE.trim())) {
    // Le même message et le même délai dans les deux cas : rien ne permet de
    // distinguer une adresse inconnue d'un code faux.
    await attendre(1000);
    return fail('Identifiants refusés.', 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // `generateLink` fabrique un jeton sans envoyer le moindre message : c'est
  // exactement ce qu'on veut, la boîte de contact ne doit pas être encombrée
  // à chaque connexion d'un examinateur.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: REVIEW_EMAIL,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error('Génération du jeton de revue', error);
    return fail('Connexion impossible pour le moment.', 500);
  }

  return json({ token_hash: data.properties.hashed_token });
});
