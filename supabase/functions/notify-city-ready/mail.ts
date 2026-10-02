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
/**
 * Sujet encodé selon la RFC 2047, en mots base64 de 75 caractères au plus.
 *
 * Laissé à denomailer, un sujet accentué et long était encodé en un seul mot
 * quoted-printable, coupé au milieu d'un caractère (le « ⚠ » tenait sur deux
 * lignes) : la coupure terminait les en-têtes, et le message arrivait sans
 * sujet lisible, source brute affichée.
 *
 * denomailer transmet tel quel un sujet en ASCII pur, sauf s'il commence par
 * `=?` : on laisse donc en clair le début ASCII (« Anecto ») devant les mots
 * encodés, ou à défaut une espace, ignorée à la lecture.
 */
function encoderSujet(sujet: string): string {
  if (/^[\x20-\x7e]*$/.test(sujet)) return sujet;
  const debut = sujet.match(/^[\x20-\x7e]* /)?.[0] ?? ' ';
  const reste = sujet.slice(debut.trim() === '' ? 0 : debut.length);
  // `=?utf-8?B?` + `?=` laissent 63 caractères, soit 45 octets en base64 :
  // on remplit chaque mot sans jamais séparer les octets d'un caractère.
  const mots: string[] = [];
  let octets: number[] = [];
  const vider = () => {
    mots.push(`=?utf-8?B?${btoa(String.fromCharCode(...octets))}?=`);
    octets = [];
  };
  for (const caractere of reste) {
    const code = [...new TextEncoder().encode(caractere)];
    if (octets.length + code.length > 45) vider();
    octets.push(...code);
  }
  if (octets.length > 0) vider();
  // Sur une seule ligne : denomailer écrit l'en-tête sans le replier, et
  // l'espace entre deux mots encodés est ignorée à la lecture.
  return (debut.trim() === '' ? ' ' : debut) + mots.join(' ');
}

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
        subject: encoderSujet(sujet),
        content: texte,
        html,
      });
    },
    async fermer() {
      await client.close();
    },
  };
}
