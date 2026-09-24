// Envoie au lecteur la réponse à son retour, sur validation humaine.
//
// Le lien part par email depuis notify-feedback, mais l'ouvrir (GET) ne
// déclenche rien : les messageries et leurs filtres anti-hameçonnage visitent
// les liens automatiquement pour les vérifier, et un GET qui enverrait
// l'email serait déclenché par une prévisualisation, pas par une décision
// humaine. Le GET ne fait qu'afficher le brouillon ; seul le clic sur le
// bouton (POST) envoie réellement la réponse.
//
// Le jeton est à usage unique : une fois `reponse_envoyee_at` posé, le même
// lien ne renvoie plus rien.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { envoyer, lireReglages } from './mail.ts';
import { corsHeaders, html } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Retour {
  id: string;
  auteur: string | null;
  type: string;
  comment: string | null;
  reponse_brouillon: string | null;
  reponse_envoyee_at: string | null;
  anecdote_titre: string | null;
  anecdote_ville: string | null;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let token: string | null = null;

  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token');
  } else if (req.method === 'POST') {
    const form = await req.formData();
    token = form.get('token')?.toString() ?? null;
  } else {
    return html('<h1>Méthode non supportée</h1>', 405);
  }

  if (!token) {
    return html('<h1>Lien invalide</h1><p>Aucun jeton fourni.</p>', 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc('feedback_par_token', { p_token: token });

  if (error) {
    console.error('Lecture par jeton', error);
    return html('<h1>Erreur</h1><p>Impossible de lire ce retour.</p>', 500);
  }
  if (!data || data.length === 0) {
    return html('<h1>Lien invalide</h1><p>Ce lien ne correspond à aucun retour.</p>', 404);
  }

  const retour = data[0] as Retour;

  if (retour.reponse_envoyee_at) {
    return html(
      `<h1>Déjà envoyée</h1><p>Cette réponse a déjà été envoyée le ${echapper(
        new Date(retour.reponse_envoyee_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
      )}.</p>`
    );
  }
  if (!retour.auteur) {
    return html("<h1>Envoi impossible</h1><p>Ce lecteur n'a plus de compte associé.</p>", 410);
  }
  if (!retour.reponse_brouillon) {
    return html("<h1>Pas de brouillon</h1><p>Aucun brouillon n'a été généré pour ce retour.</p>", 404);
  }

  if (req.method === 'GET') {
    return html(`
      <h1>Réponse à ${echapper(retour.auteur)}</h1>
      <p class="contexte">${echapper(retour.anecdote_ville ?? '')}${
      retour.anecdote_titre ? ' — « ' + echapper(retour.anecdote_titre) + ' »' : ''
    }</p>
      <h2>Message reçu</h2>
      <blockquote>${echapper(retour.comment ?? '(sans commentaire)')}</blockquote>
      <h2>Brouillon</h2>
      <blockquote>${echapper(retour.reponse_brouillon)}</blockquote>
      <form method="POST">
        <input type="hidden" name="token" value="${echapper(token)}" />
        <button type="submit">Envoyer cette réponse</button>
      </form>
    `);
  }

  // POST : le clic humain est acquis, l'envoi réel a lieu ici.
  const reglages = lireReglages();
  if (!reglages) {
    return html('<h1>Configuration manquante</h1><p>SMTP_HOST, SMTP_USER et SMTP_PASS sont requis.</p>', 500);
  }

  try {
    await envoyer(
      reglages,
      retour.auteur,
      'Anecto — Réponse à votre message',
      retour.reponse_brouillon,
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
        <p style="font-size:16px;line-height:1.6;white-space:pre-wrap">${echapper(retour.reponse_brouillon)}</p>
      </div>`
    );
  } catch (err) {
    console.error('Envoi réponse', err);
    return html(`<h1>Échec de l'envoi</h1><p>${echapper(String(err))}</p>`, 502);
  }

  const { error: erreurMarquage } = await supabase
    .from('feedback')
    .update({ reponse_envoyee_at: new Date().toISOString() })
    .eq('id', retour.id);

  if (erreurMarquage) {
    // L'email est parti : le signaler franchement plutôt que de laisser croire
    // que le lien reste utilisable.
    console.error('Marquage échoué', erreurMarquage);
    return html(
      "<h1>Envoyée, mais...</h1><p>Le message est parti, mais le marquage a échoué. Évite de recliquer ce lien.</p>"
    );
  }

  return html(`<h1>Envoyée</h1><p>La réponse a été envoyée à ${echapper(retour.auteur)}.</p>`);
});
