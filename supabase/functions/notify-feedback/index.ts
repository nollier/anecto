// Prévient par email des retours laissés dans l'app.
//
// La table `feedback` recueille les corrections et les propositions depuis le
// premier jour, mais rien ne la lisait : les contributions s'y accumulaient
// sans que personne en soit averti. C'est le pire cas de figure pour un
// produit qui demande à ses lecteurs de contribuer.
//
// Le déclenchement est double, et c'est voulu :
//   - un trigger sur `feedback` appelle cette fonction dès l'insertion, pour
//     que l'alerte parte tout de suite ;
//   - un cron repasse toutes les quinze minutes.
// La colonne `notified_at` rend les deux chemins idempotents : ce qui a déjà
// été signalé ne l'est pas deux fois, et ce qui a échoué — fonction en panne,
// SMTP indisponible — repart au passage suivant plutôt que d'être perdu.
//
// Protégée par le même secret partagé que les autres fonctions d'exploitation.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { envoyer, lireReglages } from './mail.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Au-delà, l'email devient illisible ; le reste part au passage suivant.
const MAX_PAR_ENVOI = 25;

const LIBELLES: Record<string, string> = {
  propose: 'Proposition',
  incomplete: 'Correction',
  adore: "J'adore",
};

interface Retour {
  id: string;
  type: string;
  comment: string | null;
  created_at: string;
  auteur: string | null;
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

function corps(retours: Retour[]): { texte: string; html: string } {
  const blocs = retours.map((r) => {
    const quoi = LIBELLES[r.type] ?? r.type;
    const contexte = r.anecdote_titre
      ? `${r.anecdote_ville ?? ''} — « ${r.anecdote_titre} »`
      : 'sans anecdote associée';

    return {
      texte: [
        `${quoi} — ${contexte}`,
        `De : ${r.auteur ?? 'auteur inconnu'}`,
        `Le : ${new Date(r.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
        '',
        r.comment ?? '(sans commentaire)',
      ].join('\n'),
      html: `<div style="margin:0 0 28px;padding:0 0 24px;border-bottom:1px solid #eee">
  <div style="font-size:13px;color:#888">${echapper(contexte)}</div>
  <div style="font-size:17px;font-weight:600;margin:4px 0 10px">${echapper(quoi)}</div>
  <div style="font-size:15px;line-height:1.5;white-space:pre-wrap">${echapper(r.comment ?? '(sans commentaire)')}</div>
  <div style="font-size:12px;color:#999;margin-top:10px">${echapper(r.auteur ?? 'auteur inconnu')} · ${echapper(
        new Date(r.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
      )}</div>
</div>`,
    };
  });

  return {
    texte: blocs.map((b) => b.texte).join('\n\n———\n\n'),
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
${blocs.map((b) => b.html).join('\n')}
<p style="font-size:12px;color:#999">Envoyé par Anecto. Les retours sont dans la table <code>feedback</code>.</p>
</div>`,
  };
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
    return fail(
      'Configuration SMTP incomplète : SMTP_HOST, SMTP_USER, SMTP_PASS et ANECTO_ALERT_EMAIL sont requis.',
      500
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('retours_a_signaler', {
    p_limit: MAX_PAR_ENVOI,
  });

  if (error) {
    console.error('Lecture des retours', error);
    return json({ error: error.message }, 500);
  }

  const retours = (data ?? []) as Retour[];
  if (retours.length === 0) {
    return json({ envoyes: 0 });
  }

  const { texte, html } = corps(retours);
  const pluriel = retours.length > 1 ? 's' : '';
  const sujet =
    retours.length === 1
      ? `Anecto — ${LIBELLES[retours[0].type] ?? retours[0].type} sur ${retours[0].anecdote_ville ?? 'ta ville'}`
      : `Anecto — ${retours.length} nouveau${pluriel} retour${pluriel}`;

  try {
    await envoyer(reglages, sujet, texte, html);
  } catch (err) {
    // On ne marque rien : les retours repartiront au prochain passage du cron.
    console.error('Envoi SMTP', err);
    return json({ envoyes: 0, error: `Envoi impossible : ${err}` }, 502);
  }

  const { error: erreurMarquage } = await supabase
    .from('feedback')
    .update({ notified_at: new Date().toISOString() })
    .in(
      'id',
      retours.map((r) => r.id)
    );

  if (erreurMarquage) {
    // L'email est parti : le signaler franchement plutôt que de le taire, sinon
    // le prochain passage renverra les mêmes retours sans qu'on comprenne.
    console.error('Marquage échoué', erreurMarquage);
    return json({ envoyes: retours.length, error: `Marquage échoué : ${erreurMarquage.message}` }, 500);
  }

  return json({ envoyes: retours.length });
});
