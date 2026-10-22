// Relance par email d'un lecteur qui ne lit plus.
//
// Cinq anecdotes servies d'affilée sans être ouvertes : la notification ne
// suffit plus, elle est balayée avec les autres. Un email, un seul, le ramène
// vers l'app avant qu'il ne l'oublie tout à fait.
//
// Qui relancer, c'est `relances_a_envoyer()` qui le décide : jamais deux fois
// pour le même retard. Il faut une lecture après la relance pour qu'un nouveau
// retard de cinq en déclenche une autre.
//
// `relance_retard_at` n'est écrit qu'après un envoi réussi, comme
// `notified_at` dans notify-city-ready : un échec SMTP repart au passage
// suivant au lieu de se perdre.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { lireReglages, ouvrirEnvoi } from './mail.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// La page qui mène aux deux magasins : si l'app est installée, la fiche
// propose de l'ouvrir. Un lien `anecto://` serait bloqué par la plupart des
// messageries.
const LIEN_APP = 'https://nollier.github.io/anecto/telecharger/';

const MAX_PAR_PASSAGE = 100;

interface Relance {
  user_id: string;
  email: string;
  ville: string;
  en_attente: number;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function message(r: Relance): { sujet: string; texte: string; html: string } {
  const n = r.en_attente;
  const sujet = `${n} anecdotes sur ${r.ville} t'attendent`;
  const pied =
    "Tu reçois ce message parce que tu as un compte Anecto. Si tu ne veux plus recevoir l'anecdote du jour, tu peux changer l'heure ou te désinscrire dans les Réglages de l'app.";

  const texte = [
    `Tu as ${n} anecdotes en attente`,
    '',
    `Depuis ta dernière visite, Anecto t'a gardé ${n} histoires sur ${r.ville}.`,
    '',
    "Elles restent dans ton historique : ouvre l'app pour les lire, dans l'ordre que tu veux.",
    '',
    `Ouvrir Anecto : ${LIEN_APP}`,
    '',
    '---',
    pied,
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <div style="font-size:24px;font-weight:700;color:#b3402f;margin-bottom:16px">Tu as ${n} anecdotes en attente</div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Depuis ta dernière visite, Anecto t'a gardé ${n} histoires sur ${echapper(
    r.ville
  )}.</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 28px">Elles restent dans ton historique : ouvre l'app pour les lire, dans l'ordre que tu veux.</p>
  <p style="margin:0 0 32px"><a href="${LIEN_APP}" style="display:inline-block;background:#b3402f;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:8px">Ouvrir Anecto</a></p>
  <p style="font-size:12px;line-height:1.6;color:#999;border-top:1px solid #eee;padding-top:16px;margin:0">${pied}</p>
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('relances_a_envoyer', { p_limit: MAX_PAR_PASSAGE });
  if (error) {
    console.error('Lecture des relances', error);
    return json({ error: error.message }, 500);
  }

  const relances = (data ?? []) as Relance[];
  if (relances.length === 0) {
    return json({ relances: 0 });
  }

  const envoi = await ouvrirEnvoi(reglages);
  const marquer: string[] = [];
  const echecs: string[] = [];

  try {
    for (const r of relances) {
      const { sujet, texte, html } = message(r);
      try {
        await envoi.envoyer(r.email, sujet, texte, html);
        marquer.push(r.user_id);
      } catch (err) {
        console.error(`Envoi vers ${r.email}`, err);
        echecs.push(r.email);
      }
    }
  } finally {
    await envoi.fermer().catch((err) => console.error('Fermeture SMTP', err));
  }

  if (marquer.length > 0) {
    const { error: erreurMarquage } = await supabase
      .from('profiles')
      .update({ relance_retard_at: new Date().toISOString() })
      .in('id', marquer);

    if (erreurMarquage) {
      // Les emails sont partis : sans marquage, ils repartiraient demain.
      console.error('Marquage échoué', erreurMarquage);
      return json({ relances: marquer.length, error: `Marquage échoué : ${erreurMarquage.message}` }, 500);
    }
  }

  return json({ relances: marquer.length, echecs: echecs.length });
});
