// Idées déposées dans la boîte à idées (onglet Communauté).
//
// Même circuit que les retours, mais un email à part : une idée produit ne se
// traite pas comme une correction d'anecdote, et elle n'appelle pas de
// brouillon de réponse.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { envoyer, Reglages } from './mail.ts';

const MAX_PAR_ENVOI = 25;

const CATEGORIES: Record<string, string> = {
  anecdotes: 'Anecdotes',
  villes: 'Villes',
  notifications: 'Notifications',
  partage: 'Partage',
  autre: 'Autre',
};

interface Idee {
  id: string;
  categorie: string;
  texte: string;
  cree_at: string;
  auteur: string | null;
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function date(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

function corps(idees: Idee[]): { texte: string; html: string } {
  const texte = idees
    .map((i) =>
      [
        `Idée — ${CATEGORIES[i.categorie] ?? i.categorie}`,
        `De : ${i.auteur ?? 'auteur inconnu'}`,
        `Le : ${date(i.cree_at)}`,
        '',
        i.texte,
      ].join('\n')
    )
    .join('\n\n———\n\n');

  const blocs = idees
    .map(
      (i) => `<div style="margin:0 0 28px;padding:0 0 24px;border-bottom:1px solid #eee">
  <div style="font-size:13px;color:#888">${echapper(CATEGORIES[i.categorie] ?? i.categorie)}</div>
  <div style="font-size:17px;font-weight:600;margin:4px 0 10px">Idée</div>
  <div style="font-size:15px;line-height:1.5;white-space:pre-wrap">${echapper(i.texte)}</div>
  <div style="font-size:12px;color:#999;margin-top:10px">${echapper(i.auteur ?? 'auteur inconnu')} · ${echapper(date(i.cree_at))}</div>
</div>`
    )
    .join('\n');

  return {
    texte,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
${blocs}
<p style="font-size:12px;color:#999">Envoyé par Anecto. Les idées sont dans la table <code>idees</code>.</p>
</div>`,
  };
}

/** Signale les idées en attente. Renvoie le nombre envoyé, ou lève une erreur. */
export async function signalerIdees(
  supabase: ReturnType<typeof createClient>,
  reglages: Reglages
): Promise<number> {
  const { data, error } = await supabase.rpc('idees_a_signaler', { p_limit: MAX_PAR_ENVOI });
  if (error) throw new Error(`Lecture des idées : ${error.message}`);

  const idees = (data ?? []) as Idee[];
  if (idees.length === 0) return 0;

  const { texte, html } = corps(idees);
  const sujet =
    idees.length === 1
      ? `Anecto — Nouvelle idée (${CATEGORIES[idees[0].categorie] ?? idees[0].categorie})`
      : `Anecto — ${idees.length} nouvelles idées`;

  // En cas d'échec SMTP, rien n'est marqué : le cron réessaiera.
  await envoyer(reglages, sujet, texte, html);

  const { error: erreurMarquage } = await supabase
    .from('idees')
    .update({ notified_at: new Date().toISOString() })
    .in(
      'id',
      idees.map((i) => i.id)
    );
  if (erreurMarquage) throw new Error(`Marquage des idées échoué : ${erreurMarquage.message}`);

  return idees.length;
}
