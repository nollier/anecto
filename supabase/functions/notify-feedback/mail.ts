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
    // 465 impose TLS dès la connexion, ce que gère `tls: true` ci-dessous.
    port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
  };
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
      from: `Anecto <${reglages.utilisateur}>`,
      to: reglages.destinataire,
      // Répondre à l'alerte écrit directement à la personne qui a proposé.
      subject: sujet,
      content: texte,
      html,
    });
  } finally {
    await client.close();
  }
}
