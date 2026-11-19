// Envoi des emails d'annonce.
//
// Brevo (API HTTP) si BREVO_API_KEY est défini : c'est le bon outil pour
// écrire à tous les lecteurs (limites d'envoi, délivrabilité, conformité).
// Sinon, repli sur le SMTP déjà utilisé par notify-city-ready : suffisant
// tant que la base reste de quelques centaines de comptes, mais Gmail plafonne
// les envois quotidiens.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export interface Envoi {
  envoyer(destinataire: string, sujet: string, texte: string, html: string, desinscription: string): Promise<void>;
  fermer(): Promise<void>;
}

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function encoderSujet(sujet: string): string {
  // Même logique que notify-city-ready/mail.ts : RFC 2047 en base64, sans
  // couper un caractère entre deux mots encodés.
  if (/^[\x20-\x7e]*$/.test(sujet)) return sujet;
  const debut = sujet.match(/^[\x20-\x7e]* /)?.[0] ?? ' ';
  const reste = sujet.slice(debut.trim() === '' ? 0 : debut.length);
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
  return (debut.trim() === '' ? ' ' : debut) + mots.join(' ');
}

export function expediteur(): string | null {
  return Deno.env.get('ANECTO_FROM_EMAIL') ?? Deno.env.get('SMTP_USER') ?? null;
}

export async function ouvrirEnvoi(): Promise<Envoi | null> {
  const de = expediteur();
  if (!de) return null;

  const cleBrevo = Deno.env.get('BREVO_API_KEY');
  if (cleBrevo) {
    return {
      async envoyer(destinataire, sujet, texte, html, desinscription) {
        const res = await fetch(BREVO_URL, {
          method: 'POST',
          headers: { 'api-key': cleBrevo, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Anecto', email: de },
            to: [{ email: destinataire }],
            subject: sujet,
            textContent: texte,
            htmlContent: html,
            headers: { 'List-Unsubscribe': `<${desinscription}>` },
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Brevo ${res.status} : ${(await res.text()).slice(0, 200)}`);
      },
      async fermer() {},
    };
  }

  const hote = Deno.env.get('SMTP_HOST');
  const utilisateur = Deno.env.get('SMTP_USER');
  const motDePasse = Deno.env.get('SMTP_PASS');
  if (!hote || !utilisateur || !motDePasse) return null;
  const port = Number(Deno.env.get('SMTP_PORT') ?? '465');

  const client = new SMTPClient({
    connection: { hostname: hote, port, tls: port === 465, auth: { username: utilisateur, password: motDePasse } },
  });

  return {
    async envoyer(destinataire, sujet, texte, html, desinscription) {
      await client.send({
        from: `Anecto <${de}>`,
        replyTo: de,
        to: destinataire,
        subject: encoderSujet(sujet),
        content: texte,
        html,
        headers: { 'List-Unsubscribe': `<${desinscription}>` },
      });
    },
    async fermer() {
      await client.close();
    },
  };
}
