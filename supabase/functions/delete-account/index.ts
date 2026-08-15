// Suppression de compte, exigée par l'App Store dès qu'une app permet d'en
// créer un. Supprimer l'utilisateur dans auth.users suffit : les clés
// étrangères de profiles, user_anecdote_history et feedback sont en CASCADE.
//
// La suppression de l'utilisateur relève de l'API admin, donc de la clé de
// service — d'où cette fonction plutôt qu'un appel direct depuis l'app.
// L'identité vient du JWT porté par la requête : on ne supprime jamais un
// compte sur la foi d'un identifiant passé dans le corps.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return fail('Non autorisé.', 401);
  }

  // Client porteur du jeton de l'appelant : il ne peut parler que de lui-même.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) {
    return fail('Session invalide.', 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin.auth.admin.deleteUser(userData.user.id);

  if (error) {
    console.error('Suppression de compte', error);
    return fail('Suppression impossible pour le moment.', 500);
  }

  return json({ deleted: true });
});
