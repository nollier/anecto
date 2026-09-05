// Le rapport du matin, par email.
//
// Deux questions, tous les jours, auxquelles rien ne répondait sans ouvrir le
// tableau de bord : combien de gens ont lu leur anecdote hier, et qui est sur
// le point de manquer de matière.
//
// La seconde est celle qui coûte des lecteurs. Un profil qui épuise sa ville
// tombe sur « Rien à lire aujourd'hui », et ne revient pas le lendemain.
// Signalé trois anecdotes à l'avance, il reste le temps d'en produire — ce
// que `produire_lot` fait en un appel.
//
// Rien n'est marqué comme envoyé ici, contrairement aux autres alertes : un
// rapport quotidien se recalcule intégralement à chaque passage. S'il échoue,
// celui du lendemain le remplace, il n'y a rien à rattraper.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { envoyer, lireReglages } from './mail.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Le seuil d'alerte, en anecdotes jamais servies restant dans la ville. */
const STOCK_BAS = 3;

interface StockBas {
  email: string | null;
  ville: string;
  restantes: number;
}

interface Rapport {
  jour: string;
  lecteurs: number;
  anecdotes_lues: number;
  lecteurs_7j: number;
  profils: number;
  nouveaux_profils: number;
  villes_ouvertes: number;
  anecdotes_validees: number;
  brouillons: number;
  demandes_en_attente: number;
  stocks_bas: StockBas[];
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** « 4 septembre ». La date porte le rapport, l'année n'apporte rien. */
function jourLisible(jour: string): string {
  const [annee, mois, jourDuMois] = jour.split('-').map(Number);
  return new Date(Date.UTC(annee, mois - 1, jourDuMois)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function accord(n: number, singulier: string, pluriel: string): string {
  return n > 1 ? pluriel : singulier;
}

function corps(r: Rapport): { texte: string; html: string } {
  const date = jourLisible(r.jour);

  // Le taux dit ce que le compte brut cache : onze lecteurs sur douze profils
  // et onze sur deux cents ne se pilotent pas pareil.
  const taux = r.profils > 0 ? Math.round((r.lecteurs / r.profils) * 100) : 0;

  const lignes: string[] = [
    `Hier, ${date} :`,
    '',
    `${r.lecteurs} ${accord(r.lecteurs, 'lecteur a lu', 'lecteurs ont lu')} leur anecdote, sur ${r.profils} ${accord(r.profils, 'profil', 'profils')} (${taux} %).`,
    `${r.anecdotes_lues} ${accord(r.anecdotes_lues, 'anecdote lue', 'anecdotes lues')} en tout, rattrapages compris.`,
    `${r.lecteurs_7j} ${accord(r.lecteurs_7j, 'lecteur actif', 'lecteurs actifs')} sur sept jours.`,
  ];

  if (r.nouveaux_profils > 0) {
    lignes.push(
      `${r.nouveaux_profils} ${accord(r.nouveaux_profils, 'nouveau compte', 'nouveaux comptes')}.`
    );
  }

  lignes.push('', `Stock : ${r.anecdotes_validees} anecdotes validées sur ${r.villes_ouvertes} villes.`);

  if (r.brouillons > 0) {
    lignes.push(
      `${r.brouillons} ${accord(r.brouillons, 'brouillon attend', 'brouillons attendent')} une relecture : select * from anecdotes_a_valider;`
    );
  }
  if (r.demandes_en_attente > 0) {
    lignes.push(
      `${r.demandes_en_attente} ${accord(r.demandes_en_attente, 'demande de ville', 'demandes de ville')} en attente.`
    );
  }

  if (r.stocks_bas.length > 0) {
    lignes.push(
      '',
      `⚠ ${r.stocks_bas.length} ${accord(r.stocks_bas.length, 'lecteur arrive', 'lecteurs arrivent')} au bout de ${accord(r.stocks_bas.length, 'sa ville', 'leur ville')} :`,
      ...r.stocks_bas.map(
        (s) =>
          `  ${s.ville} — ${s.restantes} ${accord(s.restantes, 'anecdote', 'anecdotes')} non ${accord(s.restantes, 'servie', 'servies')} (${s.email ?? 'compte sans adresse'})`
      ),
      '',
      'select public.produire_lot(6, 30);'
    );
  } else {
    lignes.push('', 'Aucun lecteur à moins de quatre anecdotes de la fin de sa ville.');
  }

  const ligneStat = (valeur: string, libelle: string) =>
    `<tr><td style="padding:6px 16px 6px 0;font-size:22px;font-weight:700;color:#1a1a1a;white-space:nowrap">${valeur}</td><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5">${libelle}</td></tr>`;

  const alerte =
    r.stocks_bas.length > 0
      ? `<div style="background:#fbeeeb;border-left:3px solid #b3402f;padding:16px 18px;margin:24px 0">
    <div style="font-size:13px;font-weight:700;color:#b3402f;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Stock bas</div>
    ${r.stocks_bas
      .map(
        (s) =>
          `<div style="font-size:15px;color:#1a1a1a;margin-bottom:6px"><strong>${echapper(
            s.ville
          )}</strong> — ${s.restantes} ${accord(s.restantes, 'anecdote', 'anecdotes')} non ${accord(
            s.restantes,
            'servie',
            'servies'
          )} <span style="color:#888">(${echapper(s.email ?? 'compte sans adresse')})</span></div>`
      )
      .join('')}
    <div style="font-size:13px;color:#666;margin-top:12px;font-family:ui-monospace,Menlo,monospace">select public.produire_lot(6, 30);</div>
  </div>`
      : `<p style="font-size:14px;color:#666;margin:24px 0">Aucun lecteur à moins de quatre anecdotes de la fin de sa ville.</p>`;

  const relecture =
    r.brouillons > 0
      ? `<p style="font-size:14px;color:#666;margin:0 0 8px">${r.brouillons} ${accord(
          r.brouillons,
          'brouillon attend',
          'brouillons attendent'
        )} une relecture — <span style="font-family:ui-monospace,Menlo,monospace">select * from anecdotes_a_valider;</span></p>`
      : '';

  const demandes =
    r.demandes_en_attente > 0
      ? `<p style="font-size:14px;color:#666;margin:0">${r.demandes_en_attente} ${accord(
          r.demandes_en_attente,
          'demande de ville en attente',
          'demandes de ville en attente'
        )}.</p>`
      : '';

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#b3402f;margin-bottom:6px">Anecto — rapport quotidien</div>
  <div style="font-size:24px;font-weight:700;margin-bottom:20px">${echapper(date)}</div>

  <table style="border-collapse:collapse;width:100%">
    ${ligneStat(
      String(r.lecteurs),
      `${accord(r.lecteurs, 'lecteur a lu', 'lecteurs ont lu')} leur anecdote, sur ${r.profils} ${accord(
        r.profils,
        'profil',
        'profils'
      )} (${taux} %)`
    )}
    ${ligneStat(String(r.anecdotes_lues), 'anecdotes lues en tout, rattrapages compris')}
    ${ligneStat(String(r.lecteurs_7j), 'lecteurs actifs sur sept jours')}
    ${r.nouveaux_profils > 0 ? ligneStat(String(r.nouveaux_profils), 'nouveaux comptes') : ''}
  </table>

  ${alerte}

  <div style="border-top:1px solid #eee;padding-top:16px;margin-top:24px">
    <p style="font-size:14px;color:#666;margin:0 0 8px">${r.anecdotes_validees} anecdotes validées sur ${r.villes_ouvertes} villes.</p>
    ${relecture}
    ${demandes}
  </div>
</div>`;

  return { texte: lignes.join('\n'), html };
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

  const { data, error } = await supabase.rpc('rapport_quotidien');
  if (error) {
    console.error('Lecture du rapport', error);
    return json({ error: error.message }, 500);
  }

  const rapport = (Array.isArray(data) ? data[0] : data) as Rapport | undefined;
  if (!rapport) {
    return json({ error: 'Rapport vide' }, 500);
  }

  const { texte, html } = corps(rapport);

  // Le sujet porte l'essentiel : la plupart des matins, il suffira à lui seul.
  const alerte = rapport.stocks_bas.length > 0 ? ` · ⚠ ${rapport.stocks_bas.length} stock bas` : '';
  const sujet = `Anecto — ${rapport.lecteurs}/${rapport.profils} ${accord(
    rapport.lecteurs,
    'lecteur',
    'lecteurs'
  )} hier${alerte}`;

  try {
    await envoyer(reglages, sujet, texte, html);
  } catch (err) {
    console.error('Envoi SMTP', err);
    return json({ error: `Envoi impossible : ${err}` }, 502);
  }

  return json({
    jour: rapport.jour,
    lecteurs: rapport.lecteurs,
    stocks_bas: rapport.stocks_bas.length,
    seuil: STOCK_BAS,
  });
});
