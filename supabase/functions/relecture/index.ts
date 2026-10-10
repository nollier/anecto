// La relecture humaine des anecdotes que le vérificateur n'a pas su trancher.
//
// Après trois corrections, une anecdote dont la rédaction est conforme, sans
// faute, aux citations retrouvées dans la source, mais que le vérificateur
// juge « douteuse », ne part plus au rejet : elle attend ici (`a_relire`).
// Le rapport du matin en donne la liste, avec un lien signé par anecdote vers
// la page `relecture/` du site, qui appelle cette fonction.
//
// Trois actions, toutes en POST : `lire` rend le texte, la source et ce que
// le vérificateur reproche ; `valider` la publie ; `rejeter` l'écarte avec un
// motif. Pas de GET qui agisse : les messageries ouvrent les liens d'un email
// pour les analyser, et un clic fantôme ne doit rien publier.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';
import { verifierSignature } from './signature.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail('Méthode non supportée.', 405);
  }
  if (!ADMIN_SECRET) {
    return fail('ANECTO_ADMIN_SECRET absent.', 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Corps de requête JSON invalide.');
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const exp = Number(body.exp);
  const sig = typeof body.sig === 'string' ? body.sig : '';
  const action = body.action;

  if (!UUID.test(id) || !(await verifierSignature(ADMIN_SECRET, id, exp, sig))) {
    // Une seconde par échec : deviner une signature reste hors de portée.
    await new Promise((r) => setTimeout(r, 1000));
    return fail('Lien invalide ou expiré.', 403);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: a, error } = await supabase
    .from('anecdotes')
    .select('id, city, city_place_id, title, hook, body, period, sources, status, a_relire, problemes, verification_notes')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!a) return fail('Anecdote introuvable.', 404);

  if (action === 'lire') {
    return json({ anecdote: a });
  }

  // Une seule décision par anecdote : un second clic, ou un lien rejoué après
  // une autre décision, ne change plus rien.
  if (a.status !== 'draft' || !a.a_relire) {
    return json({ deja: true, status: a.status }, 409);
  }

  if (action === 'valider') {
    const { error: e } = await supabase
      .from('anecdotes')
      .update({ status: 'validated', a_relire: false })
      .eq('id', id)
      .eq('status', 'draft');
    if (e) return fail(e.message, 500);
    return json({ status: 'validated' });
  }

  if (action === 'rejeter') {
    const { error: e } = await supabase
      .from('anecdotes')
      .update({ status: 'rejected', a_relire: false })
      .eq('id', id)
      .eq('status', 'draft');
    if (e) return fail(e.message, 500);
    await supabase.from('rejets_anecdote').insert({
      city: a.city,
      city_place_id: a.city_place_id,
      titre: a.title,
      motif: 'Rejetée en relecture humaine.',
    });
    return json({ status: 'rejected' });
  }

  return fail('Action inconnue.');
});
