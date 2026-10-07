// Le rapport du matin, par email.
//
// Deux questions, tous les jours, auxquelles rien ne répondait sans ouvrir le
// tableau de bord : combien de gens ont lu leur anecdote hier, et qui est sur
// le point de manquer de matière.
//
// La seconde est celle qui coûte des lecteurs. Un profil qui épuise sa ville
// tombe sur « Rien à lire aujourd'hui », et ne revient pas le lendemain.
// Signalé trois anecdotes à l'avance, il reste le temps d'en produire — ce
// que le réassort de 5 h fait tout seul (`reassortir_stock_bas`).
//
// Une troisième question depuis le 30 septembre : la production a-t-elle
// fait son travail ? Demandé, obtenu, publiable, et pourquoi le reste a été
// écarté (`controle_production`).
//
// Les listes du rapport sont lues avec prudence (`?? []`) : la fonction SQL
// `rapport_quotidien` a longtemps différé entre la base et le dépôt
// (« J'adore » d'un côté, demandes et villes prêtes de l'autre), jusqu'à
// `rapport_quotidien_complet` qui les réunit. Si elles divergent de nouveau,
// le rapport part quand même, avec ce qu'il reçoit.
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

interface NouvelleDemande {
  ville: string;
  email: string | null;
}

interface VillePrete {
  ville: string;
  anecdotes: number;
  prevenus: number;
}

interface Adore {
  ville: string;
  titre: string;
  combien: number;
}

interface Lot {
  ville: string;
  demandees: number;
  creees: number;
  publiables: number;
  /** Sujets choisis et sourcés, pas encore rédigés : le lot est en cours. */
  en_attente?: number;
  erreur: string | null;
  sautees: string[];
}

interface Controle {
  lots: Lot[];
  corrigees: number;
  abandonnees: Array<{ ville: string; titre: string; motif: string }>;
  en_correction: number;
}

// Un « J'adore » par anecdote et par lecteur : la liste d'une journée tient en
// quelques lignes. Le plafond est là pour le jour où ce ne sera plus vrai —
// un rapport de deux cents lignes ne se lit pas.
const MAX_ADORES_LISTES = 10;

// Le rapport ne donne que les comptes de la production : le détail des
// brouillons (raisons, motifs de rejet) est dans `lots_generation` et
// `anecdotes_a_valider`, pas dans un email.

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
  nouvelles_demandes?: NouvelleDemande[];
  villes_pretes?: VillePrete[];
  adores?: number;
  adores_detail?: Adore[];
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

/** Un lot est en défaut s'il a rendu moins que demandé, ou moins de publiables que de créées. */
function enDefaut(l: Lot): boolean {
  return !!l.erreur || l.creees < l.demandees || l.publiables < l.creees;
}

/** Le symbole d'un lot : en cours tant que des sujets attendent d'être rédigés. */
function etat(l: Lot): string {
  if ((l.en_attente ?? 0) > 0 && !l.erreur) return '⏳';
  return enDefaut(l) ? '⚠' : '✓';
}

function suiteLot(l: Lot): string {
  const n = l.en_attente ?? 0;
  return n > 0 ? `, ${n} en rédaction` : '';
}

function corps(r: Rapport, c: Controle | null): { texte: string; html: string } {
  const date = jourLisible(r.jour);
  const nouvellesDemandesListe = r.nouvelles_demandes ?? [];
  const villesPretesListe = r.villes_pretes ?? [];
  const adores = r.adores ?? 0;
  const adoresDetail = r.adores_detail ?? [];

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

  // Le seul signal positif que le lecteur sache émettre. L'alerte retours
  // l'écarte volontairement, faute de commentaire à traiter : sans cette
  // ligne, il ne se lit nulle part.
  if (adores > 0) {
    lignes.push(
      '',
      `${adores} « J'adore » sur ${adoresDetail.length} ${accord(adoresDetail.length, 'anecdote', 'anecdotes')} :`,
      ...adoresDetail
        .slice(0, MAX_ADORES_LISTES)
        .map((a) => `  ${a.ville} — ${a.titre}${a.combien > 1 ? ` (${a.combien})` : ''}`)
    );
    if (adoresDetail.length > MAX_ADORES_LISTES) {
      lignes.push(`  et ${adoresDetail.length - MAX_ADORES_LISTES} autres.`);
    }
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

  if (nouvellesDemandesListe.length > 0) {
    lignes.push(
      '',
      `${nouvellesDemandesListe.length} ${accord(nouvellesDemandesListe.length, 'nouvelle demande de ville', 'nouvelles demandes de ville')} hier :`,
      ...nouvellesDemandesListe.map((d) => `  ${d.ville} (${d.email ?? 'compte sans adresse'})`),
      'Production automatique lancée.'
    );
  }

  if (villesPretesListe.length > 0) {
    lignes.push(
      '',
      `${villesPretesListe.length} ${accord(villesPretesListe.length, 'ville prête', 'villes prêtes')} hier, lecteur(s) prévenu(s) :`,
      ...villesPretesListe.map(
        (v) =>
          `  ${v.ville} — ${v.anecdotes} ${accord(v.anecdotes, 'anecdote validée', 'anecdotes validées')}, ${v.prevenus} ${accord(v.prevenus, 'lecteur prévenu', 'lecteurs prévenus')}`
      )
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
      'Réassort automatique à 5 h, dès que les brouillons de la ville sont corrigés ou rejetés.'
    );
  } else {
    lignes.push('', 'Aucun lecteur à moins de quatre anecdotes de la fin de sa ville.');
  }

  if (c) {
    lignes.push('', 'Contrôle production (24 h) :');
    if (c.lots.length === 0) {
      lignes.push('  Aucun lot lancé.');
    }
    for (const l of c.lots) {
      lignes.push(
        `  ${etat(l)} ${l.ville} — ${l.demandees} demandées, ${l.creees} créées, ${l.publiables} publiables d'emblée${suiteLot(l)}`
      );
    }
    lignes.push(
      `  ${c.corrigees} ${accord(c.corrigees, 'anecdote corrigée puis publiable', 'anecdotes corrigées puis publiables')}, ${c.en_correction} en cours de correction.`
    );
    if (c.abandonnees.length > 0) {
      lignes.push(`  ✗ ${c.abandonnees.length} ${accord(c.abandonnees.length, 'rejetée', 'rejetées')} après 3 corrections.`);
    }
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
    <div style="font-size:13px;color:#666;margin-top:12px">Réassort automatique à 5 h, dès que les brouillons de la ville sont corrigés ou rejetés.</div>
  </div>`
      : `<p style="font-size:14px;color:#666;margin:24px 0">Aucun lecteur à moins de quatre anecdotes de la fin de sa ville.</p>`;

  const nouvellesDemandes =
    nouvellesDemandesListe.length > 0
      ? `<div style="background:#faf6f2;border-left:3px solid #b3402f;padding:16px 18px;margin:24px 0">
    <div style="font-size:13px;font-weight:700;color:#b3402f;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Nouvelle${
      nouvellesDemandesListe.length > 1 ? 's' : ''
    } demande${nouvellesDemandesListe.length > 1 ? 's' : ''} de ville</div>
    ${nouvellesDemandesListe
      .map(
        (d) =>
          `<div style="font-size:15px;color:#1a1a1a;margin-bottom:6px"><strong>${echapper(
            d.ville
          )}</strong> <span style="color:#888">(${echapper(d.email ?? 'compte sans adresse')})</span></div>`
      )
      .join('')}
    <div style="font-size:13px;color:#666;margin-top:12px">Production automatique lancée.</div>
  </div>`
      : '';

  const villesPretes =
    villesPretesListe.length > 0
      ? `<div style="background:#f0f7f0;border-left:3px solid #3f8f4f;padding:16px 18px;margin:24px 0">
    <div style="font-size:13px;font-weight:700;color:#3f8f4f;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Ville${
      villesPretesListe.length > 1 ? 's' : ''
    } prête${villesPretesListe.length > 1 ? 's' : ''}</div>
    ${villesPretesListe
      .map(
        (v) =>
          `<div style="font-size:15px;color:#1a1a1a;margin-bottom:6px"><strong>${echapper(
            v.ville
          )}</strong> — ${v.anecdotes} ${accord(
            v.anecdotes,
            'anecdote validée',
            'anecdotes validées'
          )}, ${v.prevenus} ${accord(v.prevenus, 'lecteur prévenu', 'lecteurs prévenus')}</div>`
      )
      .join('')}
  </div>`
      : '';

  const reactions =
    adores > 0
      ? `<div style="background:#f7f5f2;padding:14px 16px;margin:20px 0">
    <div style="font-size:13px;font-weight:700;color:#7a6a5d;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Réactions</div>
    ${adoresDetail
      .slice(0, MAX_ADORES_LISTES)
      .map(
        (a) =>
          `<div style="font-size:15px;color:#1a1a1a;margin-bottom:6px"><strong>${echapper(
            a.titre
          )}</strong> <span style="color:#888">— ${echapper(a.ville)}</span>${
            a.combien > 1 ? ` <span style="color:#7a6a5d">×${a.combien}</span>` : ''
          }</div>`
      )
      .join('')}
    ${
      adoresDetail.length > MAX_ADORES_LISTES
        ? `<div style="font-size:13px;color:#888;margin-top:8px">et ${
            adoresDetail.length - MAX_ADORES_LISTES
          } autres.</div>`
        : ''
    }
  </div>`
      : '';

  const production = c
    ? `<div style="background:#f7f7f7;border-left:3px solid ${
        c.lots.some((l) => etat(l) === '⚠') || c.abandonnees.length > 0 ? '#b3402f' : '#3f8f4f'
      };padding:16px 18px;margin:24px 0">
    <div style="font-size:13px;font-weight:700;color:#444;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Contrôle production (24 h)</div>
    ${
      c.lots.length === 0
        ? '<div style="font-size:14px;color:#666">Aucun lot lancé.</div>'
        : c.lots
            .map(
              (l) =>
                `<div style="font-size:15px;color:#1a1a1a;margin-bottom:4px">${etat(l)} <strong>${echapper(
                  l.ville
                )}</strong> — ${l.demandees} demandées, ${l.creees} créées, ${l.publiables} publiables d'emblée${suiteLot(l)}</div>`
            )
            .join('')
    }
    <div style="font-size:14px;color:#666;margin-top:10px">${c.corrigees} ${accord(
      c.corrigees,
      'anecdote corrigée puis publiable',
      'anecdotes corrigées puis publiables'
    )}, ${c.en_correction} en cours de correction.</div>
    ${
      c.abandonnees.length > 0
        ? `<div style="font-size:13px;color:#b3402f;margin-top:6px">✗ ${c.abandonnees.length} ${accord(
            c.abandonnees.length,
            'rejetée',
            'rejetées'
          )} après 3 corrections.</div>`
        : ''
    }
  </div>`
    : '';

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
    ${
      adores > 0
        ? ligneStat(
            String(adores),
            `« J'adore » sur ${adoresDetail.length} ${accord(adoresDetail.length, 'anecdote', 'anecdotes')}`
          )
        : ''
    }
  </table>

  ${reactions}

  ${nouvellesDemandes}

  ${villesPretes}

  ${alerte}

  ${production}

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

  // Le contrôle est un complément : s'il échoue, le rapport part sans lui.
  const { data: controle, error: controleError } = await supabase.rpc('controle_production');
  if (controleError) console.error('Contrôle production', controleError);

  const { texte, html } = corps(rapport, controleError ? null : (controle as Controle));

  // Le sujet porte l'essentiel : la plupart des matins, il suffira à lui seul.
  const alerte = rapport.stocks_bas.length > 0 ? ` · ⚠ ${rapport.stocks_bas.length} stock bas` : '';
  const lotsEnDefaut = controleError ? 0 : ((controle as Controle).lots ?? []).filter((l) => etat(l) === '⚠').length;
  const defaut = lotsEnDefaut > 0 ? ` · ⚠ ${lotsEnDefaut} ${accord(lotsEnDefaut, 'lot incomplet', 'lots incomplets')}` : '';
  const sujet = `Anecto — ${rapport.lecteurs}/${rapport.profils} ${accord(
    rapport.lecteurs,
    'lecteur',
    'lecteurs'
  )} hier${alerte}${defaut}`;

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
