// Envoi quotidien. Appelée toutes les 15 minutes par pg_cron, via
// declencher_envoi_notifications() qui lit les secrets dans Vault.
//
// La notification ne porte pas l'anecdote : elle l'annonce. Le texte entier
// tenait dans un push, mais il fallait déplier la notification pour le lire,
// et une fois lu il n'y avait plus aucune raison d'ouvrir l'app — donc plus
// d'historique, plus de source à vérifier, plus de retours. L'amorce nomme la
// ville et le titre du jour, et s'arrête là.
//
// Chaque exécution laisse une trace dans `notification_runs` — sinon un cron
// en panne est invisible jusqu'au premier désabonnement.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100; // limite de l'API Expo
const FENETRE_MINUTES = 15; // doit correspondre au pas du cron

// Quatre ouvertures en rotation : la même phrase tous les soirs finirait par
// ne plus être lue. L'index vient du quantième, donc tout le monde reçoit la
// même formulation le même jour.
const OUVERTURES = [
  (ville: string) => `C'est l'heure de ton anecdote sur ${ville}`,
  (ville: string) => `Ton anecdote du jour sur ${ville}`,
  (ville: string) => `${ville} comme tu ne la connais pas`,
  (ville: string) => `Une histoire de ${ville} t'attend`,
];

function amorce(ville: string, titre: string): { title: string; body: string } {
  const jour = Math.floor(Date.now() / 86_400_000);
  return {
    title: OUVERTURES[jour % OUVERTURES.length](ville),
    body: `Aujourd'hui, on découvre « ${titre} ».`,
  };
}

interface Cible {
  user_id: string;
  expo_push_token: string;
}

interface Message {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { anecdoteId: string };
}

interface Ticket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function envoyerLot(messages: Message[]): Promise<Ticket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Expo ${res.status} : ${(await res.text()).slice(0, 300)}`);
  }

  const payload = await res.json();
  return (payload?.data ?? []) as Ticket[];
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: cibles, error: ciblesError } = await supabase.rpc('profiles_a_notifier', {
    p_window_minutes: FENETRE_MINUTES,
  });

  if (ciblesError) {
    console.error('profiles_a_notifier', ciblesError);
    return json({ error: ciblesError.message }, 500);
  }

  const dus = (cibles ?? []) as Cible[];
  const messages: Message[] = [];
  const problemes: string[] = [];

  for (const cible of dus) {
    // Réserve l'anecdote du jour et incrémente le compteur, dans la même
    // transaction que l'écriture d'historique.
    const { data, error } = await supabase.rpc('get_daily_anecdote_for', {
      p_user: cible.user_id,
    });

    if (error) {
      problemes.push(`${cible.user_id} : ${error.message}`);
      continue;
    }
    if (!data) {
      // Stock épuisé pour sa ville : ce n'est pas une erreur, c'est un
      // manque de contenu. On le compte pour pouvoir le voir venir.
      problemes.push(`${cible.user_id} : aucune anecdote disponible`);
      continue;
    }

    const { title, body } = amorce(data.city, data.title);

    messages.push({
      to: cible.expo_push_token,
      title,
      body,
      sound: 'default',
      data: { anecdoteId: data.id },
    });
  }

  let envoyes = 0;
  const jetonsMorts: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const lot = messages.slice(i, i + EXPO_BATCH_SIZE);
    let tickets: Ticket[];

    try {
      tickets = await envoyerLot(lot);
    } catch (err) {
      problemes.push(`Lot ${i / EXPO_BATCH_SIZE} : ${err}`);
      continue;
    }

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        envoyes++;
        return;
      }
      problemes.push(`${lot[index].to} : ${ticket.message ?? 'erreur Expo'}`);
      // Appareil désinstallé ou jeton révoqué : le garder ferait échouer
      // chaque envoi suivant.
      if (ticket.details?.error === 'DeviceNotRegistered') {
        jetonsMorts.push(lot[index].to);
      }
    });
  }

  if (jetonsMorts.length > 0) {
    await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .in('expo_push_token', jetonsMorts);
  }

  const bilan = {
    due_count: dus.length,
    sent_count: envoyes,
    error_count: problemes.length,
    details: problemes.length > 0 ? { problemes: problemes.slice(0, 50) } : null,
  };

  await supabase.from('notification_runs').insert(bilan);

  return json({ ...bilan, jetons_nettoyes: jetonsMorts.length });
});
