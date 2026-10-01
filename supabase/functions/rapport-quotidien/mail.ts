// Envoi SMTP.
//
// On réutilise le compte Gmail déjà employé pour les emails d'authentification
// plutôt que d'ajouter un service tiers : c'est une alerte interne, à
// destination d'une seule boîte, pas un envoi de masse. Le jour où le volume
// le justifiera, seule cette fonction sera à remplacer par un appel HTTP à un
// service d'emailing.
//
// Gmail exige un mot de passe d'application, pas le mot de passe du compte.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export interface Reglages {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  destinataire: string;
  /** Adresse affichée comme expéditeur. Distincte du compte SMTP. */
  expediteur: string;
}

export function lireReglages(): Reglages | null {
  const hote = Deno.env.get('SMTP_HOST');
  const utilisateur = Deno.env.get('SMTP_USER');
  const motDePasse = Deno.env.get('SMTP_PASS');
  const destinataire = Deno.env.get('ANECTO_ALERT_EMAIL');

  if (!hote || !utilisateur || !motDePasse || !destinataire) return null;

  return {
    hote,
    utilisateur,
    motDePasse,
    destinataire,
    // L'adresse affichée n'est pas forcément le compte qui s'authentifie :
    // on peut expédier depuis anecto@mail.fr en se connectant avec un autre
    // compte, à condition que le serveur SMTP autorise cette adresse — chez
    // Gmail, elle doit être déclarée en alias vérifié, sinon l'expéditeur est
    // silencieusement réécrit.
    expediteur: Deno.env.get('ANECTO_FROM_EMAIL') ?? utilisateur,
    // 465 impose TLS dès la connexion, ce que gère `tls: true` ci-dessous.
    port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
  };
}

/** Base64 en lignes de 76 caractères, comme l'exige la RFC 2045. */
function base64(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return (btoa(binaire).match(/.{1,76}/g) ?? []).join('\r\n');
}

export async function envoyer(
  reglages: Reglages,
  sujet: string,
  texte: string,
  html: string
): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: reglages.hote,
      port: reglages.port,
      tls: reglages.port === 465,
      auth: { username: reglages.utilisateur, password: reglages.motDePasse },
    },
  });

  try {
    await client.send({
      from: `Anecto <${reglages.expediteur}>`,
      // Répondre à l'alerte doit écrire à Anecto, pas au compte technique.
      replyTo: reglages.expediteur,
      to: reglages.destinataire,
      subject: sujet,
      // Encodé ici en base64 plutôt que confié à denomailer : son
      // quoted-printable s'appliquait deux fois sur le HTML long du rapport
      // (`style=3d"`), et le message arrivait illisible, source brute affichée.
      mimeContent: [
        { mimeType: 'text/plain; charset="utf-8"', content: base64(texte), transferEncoding: 'base64' },
        { mimeType: 'text/html; charset="utf-8"', content: base64(html), transferEncoding: 'base64' },
      ],
    });
  } finally {
    await client.close();
  }
}
