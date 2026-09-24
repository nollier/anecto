// Envoi SMTP vers l'auteur d'un retour.
//
// Distinct du `mail.ts` de notify-feedback : celui-là écrit à une seule
// boîte, la nôtre. Ici le destinataire est l'auteur du retour, un inconnu du
// serveur SMTP — d'où un expéditeur explicite plutôt qu'un compte technique.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export interface Reglages {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  expediteur: string;
}

export function lireReglages(): Reglages | null {
  const hote = Deno.env.get('SMTP_HOST');
  const utilisateur = Deno.env.get('SMTP_USER');
  const motDePasse = Deno.env.get('SMTP_PASS');

  if (!hote || !utilisateur || !motDePasse) return null;

  return {
    hote,
    utilisateur,
    motDePasse,
    expediteur: Deno.env.get('ANECTO_FROM_EMAIL') ?? utilisateur,
    port: Number(Deno.env.get('SMTP_PORT') ?? '465'),
  };
}

export async function envoyer(
  reglages: Reglages,
  destinataire: string,
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
      replyTo: reglages.expediteur,
      to: destinataire,
      subject: sujet,
      content: texte,
      html,
    });
  } finally {
    await client.close();
  }
}
