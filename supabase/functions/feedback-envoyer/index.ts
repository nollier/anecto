// Envoie au lecteur la réponse à son retour, sur validation humaine.
//
// Deux jetons dans l'URL, jamais un formulaire (Supabase ne sert pas de HTML
// interactif depuis une fonction Edge, voir http.ts) :
//   - `token` seul affiche le brouillon, sans effet de bord. Les messageries
//     visitent automatiquement les liens d'un email pour les vérifier ; un
//     GET qui enverrait la réponse serait déclenché par cette vérification,
//     pas par une décision humaine.
//   - `token` + `confirmer=oui` envoie réellement. Ce second lien n'apparaît
//     que sur la page affichée par le premier, jamais dans l'email d'origine :
//     aucun scanner ne peut donc le visiter tout seul.
//
// Le jeton est à usage unique : une fois `reponse_envoyee_at` posé, plus rien
// ne repart.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { envoyer, lireReglages } from './mail.ts';
import { corsHeaders, texte } from './http.ts';

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

function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return texte('Méthode non supportée.', 405);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const confirme = url.searchParams.get('confirmer') === 'oui';

  if (!token) {
    return texte('Lien invalide : aucun jeton fourni.', 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc('feedback_par_token', { p_token: token });

  if (error) {
    console.error('Lecture par jeton', error);
    return texte('Erreur : impossible de lire ce retour.', 500);
  }
  if (!data || data.length === 0) {
    return texte('Lien invalide : ce lien ne correspond à aucun retour.', 404);
  }

  const retour = data[0] as Retour;

  if (retour.reponse_envoyee_at) {
    return texte(
      `Déjà envoyée le ${new Date(retour.reponse_envoyee_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`
    );
  }
  if (!retour.auteur) {
    return texte("Envoi impossible : ce lecteur n'a plus de compte associé.", 410);
  }
  if (!retour.reponse_brouillon) {
    return texte("Pas de brouillon disponible pour ce retour.", 404);
  }

  if (!confirme) {
    const lienConfirmation = `${SUPABASE_URL}/functions/v1/feedback-envoyer?token=${token}&confirmer=oui`;
    return texte(
      [
        `Réponse à ${retour.auteur}`,
        retour.anecdote_ville
          ? `${retour.anecdote_ville}${retour.anecdote_titre ? ' — « ' + retour.anecdote_titre + ' »' : ''}`
          : null,
        '',
        'Message reçu :',
        retour.comment ?? '(sans commentaire)',
        '',
        'Brouillon :',
        retour.reponse_brouillon,
        '',
        'Pour envoyer cette réponse au lecteur, ouvrez ce lien :',
        lienConfirmation,
      ]
        .filter((ligne) => ligne !== null)
        .join('\n')
    );
  }

  // confirmer=oui : le clic humain sur le second lien est acquis, l'envoi
  // réel a lieu ici.
  const reglages = lireReglages();
  if (!reglages) {
    return texte('Configuration manquante : SMTP_HOST, SMTP_USER et SMTP_PASS sont requis.', 500);
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
    return texte(`Échec de l'envoi : ${err}`, 502);
  }

  const { error: erreurMarquage } = await supabase
    .from('feedback')
    .update({ reponse_envoyee_at: new Date().toISOString() })
    .eq('id', retour.id);

  if (erreurMarquage) {
    // L'email est parti : le signaler franchement plutôt que de laisser croire
    // que le lien reste utilisable.
    console.error('Marquage échoué', erreurMarquage);
    return texte('Le message est parti, mais le marquage a échoué. Évite de rouvrir ce lien.');
  }

  return texte(`Réponse envoyée à ${retour.auteur}.`);
});
