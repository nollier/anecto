// Prévient les lecteurs que la ville qu'ils ont demandée est ouverte.
//
// C'est la contrepartie du formulaire de demande : sans cet envoi, promettre
// « on te préviendra dès que ses anecdotes seront prêtes » serait mentir. La
// promesse est faite dans l'app, elle se tient ici.
//
// Une demande devient signalable dès que sa ville a des anecdotes validées —
// c'est `demandes_a_prevenir()` qui le décide, pas cette fonction. Elle peut
// donc être appelée aussi souvent qu'on veut : tant qu'aucune ville n'a été
// ouverte, elle ne fait rien.
//
// `notified_at` n'est écrit qu'après un envoi réussi, et par groupe : si le
// serveur SMTP coupe au milieu du lot, les destinataires déjà servis sont
// marqués et les autres repartent au passage suivant. L'ordre inverse
// perdrait silencieusement des messages.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { lireReglages, ouvrirEnvoi } from './mail.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Un lot par appel. Au-delà, la connexion SMTP reste ouverte trop longtemps
// pour le temps d'exécution d'une Edge Function.
const MAX_PAR_PASSAGE = 100;

interface Demande {
  id: string;
  email: string | null;
  ville: string;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** « Bayonne », « Bayonne et Biarritz », « Bayonne, Biarritz et Dax ». */
function enumerer(villes: string[]): string {
  if (villes.length === 1) return villes[0];
  return `${villes.slice(0, -1).join(', ')} et ${villes[villes.length - 1]}`;
}

function message(villes: string[]): { sujet: string; texte: string; html: string } {
  const liste = enumerer(villes);
  const plusieurs = villes.length > 1;

  const sujet = plusieurs
    ? `Anecto — ${liste} sont prêtes`
    : `Anecto — ${liste} est prête`;

  const texte = [
    plusieurs ? `${liste} rejoignent Anecto.` : `${liste} rejoint Anecto.`,
    '',
    plusieurs
      ? "Tu avais demandé ces villes : leurs premières anecdotes sont validées. Ouvre l'app, va dans Réglages, et choisis celle que tu veux suivre."
      : "Tu avais demandé cette ville : ses premières anecdotes sont validées. Ouvre l'app, va dans Réglages, et choisis-la pour recevoir l'anecdote du jour.",
    '',
    '—',
    "Tu reçois ce message parce que tu as demandé l'ouverture de cette ville depuis l'application Anecto. C'est le seul message envoyé à ce titre.",
  ].join('\n');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <div style="font-size:24px;font-weight:700;color:#b3402f;margin-bottom:16px">${echapper(
    plusieurs ? `${liste} sont prêtes` : `${liste} est prête`
  )}</div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 16px">${
    plusieurs
      ? "Tu avais demandé ces villes : leurs premières anecdotes sont validées."
      : "Tu avais demandé cette ville : ses premières anecdotes sont validées."
  }</p>
  <p style="font-size:16px;line-height:1.6;margin:0 0 28px">Ouvre Anecto, va dans <strong>Réglages</strong>, et ${
    plusieurs ? 'choisis celle que tu veux suivre' : 'choisis-la'
  } pour recevoir l'anecdote du jour.</p>
  <p style="font-size:12px;line-height:1.6;color:#999;border-top:1px solid #eee;padding-top:16px;margin:0">
    Tu reçois ce message parce que tu as demandé l'ouverture de ${
      plusieurs ? 'ces villes' : 'cette ville'
    } depuis l'application Anecto. C'est le seul message envoyé à ce titre.
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('demandes_a_prevenir', {
    p_limit: MAX_PAR_PASSAGE,
  });

  if (error) {
    console.error('Lecture des demandes', error);
    return json({ error: error.message }, 500);
  }

  const demandes = (data ?? []) as Demande[];
  if (demandes.length === 0) {
    return json({ prevenus: 0, demandes: 0 });
  }

  // Un compte sans adresse ne peut pas être prévenu. Le laisser en attente
  // indéfiniment ferait grossir le lot à chaque passage, sans jamais aboutir.
  const sansEmail = demandes.filter((d) => !d.email);
  const aEnvoyer = demandes.filter((d) => !!d.email);

  // Une personne qui a demandé trois villes ouvertes le même jour reçoit un
  // message, pas trois.
  const parEmail = new Map<string, Demande[]>();
  for (const d of aEnvoyer) {
    const lot = parEmail.get(d.email!) ?? [];
    lot.push(d);
    parEmail.set(d.email!, lot);
  }

  const envoi = await ouvrirEnvoi(reglages);
  const marquer: string[] = [];
  const echecs: string[] = [];

  try {
    for (const [destinataire, lot] of parEmail) {
      // Deux demandes peuvent porter le même nom de ville avec deux place_id
      // distincts (communes homonymes) : ne l'écrire qu'une fois.
      const villes = [...new Set(lot.map((d) => d.ville))];
      const { sujet, texte, html } = message(villes);

      try {
        await envoi.envoyer(destinataire, sujet, texte, html);
        marquer.push(...lot.map((d) => d.id));
      } catch (err) {
        // Ce destinataire repartira au passage suivant ; les autres continuent.
        console.error(`Envoi vers ${destinataire}`, err);
        echecs.push(destinataire);
      }
    }
  } finally {
    await envoi.fermer().catch((err) => console.error('Fermeture SMTP', err));
  }

  if (marquer.length > 0) {
    const { error: erreurMarquage } = await supabase
      .from('demandes_ville')
      .update({ notified_at: new Date().toISOString() })
      .in('id', marquer);

    if (erreurMarquage) {
      // Les emails sont partis. Le taire ferait renvoyer les mêmes messages au
      // passage suivant sans qu'on comprenne pourquoi.
      console.error('Marquage échoué', erreurMarquage);
      return json(
        { prevenus: marquer.length, error: `Marquage échoué : ${erreurMarquage.message}` },
        500
      );
    }
  }

  return json({
    prevenus: marquer.length,
    destinataires: parEmail.size - echecs.length,
    echecs: echecs.length,
    sans_email: sansEmail.length,
  });
});
