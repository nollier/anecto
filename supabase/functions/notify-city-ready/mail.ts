// Envoi SMTP vers les lecteurs.
//
// Distinct du `mail.ts` de notify-feedback : celui-là écrit à une seule boîte,
// la nôtre. Ici le destinataire change à chaque message, et le contenu part
// vers des inconnus — d'où un expéditeur explicite plutôt qu'un compte
// technique, et un texte qui rappelle pourquoi ils reçoivent ce message.

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

/**
 * Ouvre une connexion et rend une fonction d'envoi réutilisable.
 *
 * Une seule connexion pour tout le lot : rouvrir une session TLS par
 * destinataire ferait passer un envoi de cinquante messages pour une attaque
 * aux yeux de la plupart des serveurs.
 */
export async function ouvrirEnvoi(reglages: Reglages) {
  const client = new SMTPClient({
    connection: {
      hostname: reglages.hote,
      port: reglages.port,
      tls: reglages.port === 465,
      auth: { username: reglages.utilisateur, password: reglages.motDePasse },
    },
  });

  return {
    async envoyer(destinataire: string, sujet: string, texte: string, html: string) {
      await client.send({
        from: `Anecto <${reglages.expediteur}>`,
        replyTo: reglages.expediteur,
        to: destinataire,
        subject: sujet,
        content: texte,
        html,
      });
    },
    async fermer() {
      await client.close();
    },
  };
}
