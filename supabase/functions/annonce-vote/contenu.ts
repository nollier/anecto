// Contenu de l'annonce d'un vote (push et email) et lien de désinscription.
//
// Sans dépendance Deno : testé sous Node (`npm test`).

export interface OptionAnnonce {
  libelle: string;
  description: string | null;
}

export interface CampagneAnnonce {
  numero: number;
  fin: string; // ISO
  options: OptionAnnonce[];
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * Dernier jour de vote, en heure de Paris. `fin` est exclusive (minuit le
 * lendemain) : on recule d'une seconde avant de lire la date.
 */
export function dernierJour(finIso: string): string {
  const jour = new Date(new Date(finIso).getTime() - 1000);
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(jour);
  const j = Number(parties.find((p) => p.type === 'day')?.value);
  const m = Number(parties.find((p) => p.type === 'month')?.value);
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]}`;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** « A, B ou C ». */
function enumererOu(mots: string[]): string {
  if (mots.length <= 1) return mots.join('');
  return `${mots.slice(0, -1).join(', ')} ou ${mots[mots.length - 1]}`;
}

export function messagePush(c: CampagneAnnonce): { title: string; body: string } {
  const choix = enumererOu(c.options.map((o) => o.libelle.toLowerCase()));
  // Premier vote : l'onglet n'existe qu'à partir de la version 1.2.1.
  if (c.numero === 1) {
    return {
      title: 'Anecto évolue, et c\'est toi qui choisis',
      body: `Mets à jour l'app et vote dans le nouvel onglet Communauté : ${choix} ? Jusqu'au ${dernierJour(c.fin)}.`,
    };
  }
  return {
    title: 'À toi de choisir la prochaine nouveauté',
    body: `${choix.charAt(0).toUpperCase()}${choix.slice(1)} ? Le vote est ouvert jusqu'au ${dernierJour(c.fin)}.`,
  };
}

export function messageEmail(
  c: CampagneAnnonce,
  lienDesinscription: string
): { sujet: string; texte: string; html: string } {
  const jusquau = dernierJour(c.fin);
  const premier = c.numero === 1;
  const sujet = premier
    ? 'Anecto évolue : à toi de choisir la suite'
    : 'Anecto : à toi de choisir la prochaine nouveauté';
  const titre = premier ? "Anecto évolue, et c'est toi qui choisis" : 'Un nouveau vote est ouvert';
  const intro = premier
    ? "Merci de lire Anecto chaque jour. L'application s'enrichit d'un nouvel onglet, Communauté : tous les 14 jours, tu votes pour la prochaine fonctionnalité, et celle qui arrive en tête est développée en priorité. Le premier vote est ouvert."
    : 'Anecto grandit grâce à vous. Tous les 14 jours, vous choisissez la prochaine fonctionnalité. Celle qui arrive en tête est développée en priorité.';
  const miseAJour =
    "Pour voir l'onglet, mets d'abord Anecto à jour depuis l'App Store ou Google Play.";

  const texte = [
    titre,
    '',
    intro,
    '',
    ...c.options.map((o) => `- ${o.libelle}${o.description ? ` : ${o.description}` : ''}`),
    '',
    ...(premier ? [miseAJour] : []),
    "Pour voter, ouvre Anecto et va dans l'onglet Communauté.",
    "Une autre idée ? Propose-la dans l'app, elle pourra figurer au prochain vote.",
    '',
    `Vote ouvert jusqu'au ${jusquau}.`,
    '',
    '--',
    "Tu reçois cet email car tu as un compte Anecto.",
    `Ne plus recevoir les annonces de vote : ${lienDesinscription}`,
  ].join('\n');

  const options = c.options
    .map(
      (o) => `<tr><td style="padding:12px 14px;border:1px solid #e2ddd8;border-radius:10px">
      <div style="font-size:15px;font-weight:600;color:#1a1a1a">${echapper(o.libelle)}</div>${
        o.description
          ? `<div style="font-size:13px;color:#555;margin-top:2px">${echapper(o.description)}</div>`
          : ''
      }</td></tr><tr><td style="height:8px"></td></tr>`
    )
    .join('\n');

  const html = `<div style="background:#f3efeb;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#a8402f;margin-bottom:16px">Anecto</div>
  <div style="font-size:22px;font-weight:700;margin-bottom:12px">${titre}</div>
  <p style="font-size:15px;line-height:1.55;color:#333;margin:0 0 18px">${intro}</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate">${options}</table>
  ${premier ? `<p style="font-size:15px;line-height:1.55;color:#1a1a1a;margin:10px 0 6px;padding:12px 14px;background:#faf6f2;border-radius:10px"><strong>Important :</strong> ${miseAJour}</p>` : ''}
  <p style="font-size:15px;line-height:1.55;color:#333;margin:10px 0 6px">Pour voter, ouvre Anecto et va dans l'onglet <strong>Communauté</strong>.</p>
  <p style="font-size:14px;line-height:1.55;color:#444;margin:0 0 18px">Une autre idée ? Propose-la dans l'app, elle pourra figurer au prochain vote.</p>
  <p style="font-size:13px;color:#555;margin:0">Vote ouvert jusqu'au ${jusquau}.</p>
</div>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#666;text-align:center">
  Tu reçois cet email car tu as un compte Anecto.
  <a href="${echapper(lienDesinscription)}" style="color:#b3402f">Ne plus recevoir les annonces de vote</a>
</p>
</div>`;

  return { sujet, texte, html };
}

// Lien de désinscription ---------------------------------------------------
//
// HMAC-SHA256 de l'identifiant du compte : le lien ne peut pas être fabriqué
// pour un autre compte sans le secret. Le même code vit dans
// `desinscription-annonces/index.ts` (pas d'import partagé entre fonctions).

function hex(octets: ArrayBuffer): string {
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function jetonDesinscription(userId: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cle,
    new TextEncoder().encode(`annonces:${userId}`)
  );
  return hex(signature).slice(0, 32);
}

export async function lienDesinscription(
  baseFonctions: string,
  userId: string,
  secret: string
): Promise<string> {
  const t = await jetonDesinscription(userId, secret);
  return `${baseFonctions}/desinscription-annonces?u=${encodeURIComponent(userId)}&t=${t}`;
}
