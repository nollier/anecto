// Annonce l'ouverture d'un vote : un push et un email par lecteur.
//
// Appelée par pg_cron (`declencher_annonces_vote`) toutes les 10 minutes en
// journée, tant qu'il reste des lecteurs à prévenir. `annonces_vote_a_envoyer`
// décide qui ; la ligne d'`annonces_vote` n'est écrite qu'après un envoi
// réussi, donc un lot interrompu repart au passage suivant sans doublon pour
// ceux déjà servis.
//
// Les comptes créés après l'ouverture ne sont pas prévenus : ils voient le
// vote dans l'onglet Communauté.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';
import { lienDesinscription, messageEmail, messagePush, type CampagneAnnonce } from './contenu.ts';
import { ouvrirEnvoi } from './mail.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const MAX_PUSH_PAR_PASSAGE = 1000;
// Au-delà, la connexion SMTP reste ouverte trop longtemps pour une Edge
// Function, et Gmail se méfie.
const MAX_EMAILS_PAR_PASSAGE = 100;

interface Cible {
  campagne_id: string;
  user_id: string;
  destination: string;
}

interface Ticket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

async function lireCampagne(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<CampagneAnnonce> {
  const { data, error } = await supabase
    .from('campagnes_vote')
    .select('numero, fin, options_vote (libelle, description, ordre)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const options = [...((data as any).options_vote ?? [])].sort((a, b) => a.ordre - b.ordre);
  return { numero: (data as any).numero, fin: (data as any).fin, options };
}

async function marquer(
  supabase: ReturnType<typeof createClient>,
  cibles: Cible[],
  canal: 'push' | 'email'
) {
  if (cibles.length === 0) return;
  const { error } = await supabase.from('annonces_vote').upsert(
    cibles.map((c) => ({ campagne_id: c.campagne_id, user_id: c.user_id, canal })),
    { onConflict: 'campagne_id,user_id,canal', ignoreDuplicates: true }
  );
  if (error) throw new Error(`Marquage ${canal} : ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non supportée.', 405);
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const problemes: string[] = [];
  let pushOk = 0;
  let emailsOk = 0;

  // 1. Push --------------------------------------------------------------
  const { data: pushs, error: erreurPush } = await supabase.rpc('annonces_vote_a_envoyer', {
    p_canal: 'push',
    p_limit: MAX_PUSH_PAR_PASSAGE,
  });
  if (erreurPush) problemes.push(`push : ${erreurPush.message}`);

  const ciblesPush = (pushs ?? []) as Cible[];
  if (ciblesPush.length > 0) {
    const { title, body } = messagePush(await lireCampagne(supabase, ciblesPush[0].campagne_id));
    const jetonsMorts: string[] = [];

    for (let i = 0; i < ciblesPush.length; i += EXPO_BATCH_SIZE) {
      const lot = ciblesPush.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(
            lot.map((c) => ({ to: c.destination, title, body, sound: 'default', data: { type: 'vote' } }))
          ),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`Expo ${res.status} : ${(await res.text()).slice(0, 200)}`);
        const tickets = ((await res.json())?.data ?? []) as Ticket[];

        // Un jeton mort est aussi marqué : le réessayer ne servirait à rien.
        const traites: Cible[] = [];
        tickets.forEach((ticket, index) => {
          const cible = lot[index];
          if (ticket.status === 'ok') {
            pushOk++;
            traites.push(cible);
          } else if (ticket.details?.error === 'DeviceNotRegistered') {
            jetonsMorts.push(cible.destination);
            traites.push(cible);
          } else {
            problemes.push(`push ${cible.user_id} : ${ticket.message ?? 'erreur Expo'}`);
          }
        });
        await marquer(supabase, traites, 'push');
      } catch (err) {
        problemes.push(`lot push ${i / EXPO_BATCH_SIZE} : ${err}`);
      }
    }

    if (jetonsMorts.length > 0) {
      await supabase.from('profiles').update({ expo_push_token: null }).in('expo_push_token', jetonsMorts);
    }
  }

  // 2. Emails ------------------------------------------------------------
  const { data: mails, error: erreurMail } = await supabase.rpc('annonces_vote_a_envoyer', {
    p_canal: 'email',
    p_limit: MAX_EMAILS_PAR_PASSAGE,
  });
  if (erreurMail) problemes.push(`email : ${erreurMail.message}`);

  const ciblesMail = (mails ?? []) as Cible[];
  if (ciblesMail.length > 0) {
    const envoi = await ouvrirEnvoi();
    if (!envoi) {
      problemes.push('email : ni BREVO_API_KEY ni SMTP configuré (ANECTO_FROM_EMAIL ou SMTP_USER requis)');
    } else {
      const campagne = await lireCampagne(supabase, ciblesMail[0].campagne_id);
      const base = `${SUPABASE_URL}/functions/v1`;
      try {
        for (const cible of ciblesMail) {
          try {
            const lien = await lienDesinscription(base, cible.user_id, ADMIN_SECRET);
            const { sujet, texte, html } = messageEmail(campagne, lien);
            await envoi.envoyer(cible.destination, sujet, texte, html, lien);
            await marquer(supabase, [cible], 'email');
            emailsOk++;
          } catch (err) {
            problemes.push(`email ${cible.user_id} : ${err}`);
          }
        }
      } finally {
        await envoi.fermer().catch((err) => console.error('Fermeture envoi', err));
      }
    }
  }

  if (problemes.length > 0) console.error('annonce-vote', problemes.slice(0, 20));
  return json({ push: pushOk, emails: emailsOk, problemes: problemes.length });
});
