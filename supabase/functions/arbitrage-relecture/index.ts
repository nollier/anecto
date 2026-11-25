// La relecture sans humain des anecdotes `a_relire` (voir `arbitrage.ts`).
//
// Appelée par pg_cron (`arbitrer_relectures`), une anecdote par passage.
// L'arbitre juge chaque reproche du vérificateur, puis :
// - aucun reproche fondé : publiée telle quelle ;
// - reproches fondés mais secondaires : ses consignes remplacent les
//   reproches, et `generate-anecdote` (mode `reecrire`, le même que le bouton
//   « Réécrire » de la relecture) réécrit et revérifie. Confirmée : publiée.
//   Encore un doute : l'arbitre relit la nouvelle version et publie ou
//   rejette. Réécriture ratée : rejetée ;
// - hors sujet, ou récit qui repose sur l'invérifiable : rejetée.
//
// Chaque décision laisse une ligne dans `arbitrages_relecture`, que le
// rapport du matin reprend. Une panne ne décide rien : l'anecdote reste
// dans « À relire », avec ses liens de relecture humaine.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, compterAvec } from './deepseek.ts';
import { ARBITRAGE_SYSTEM, type Arbitrage, arbitragePrompt, lireArbitrage, reprochesDe } from './arbitrage.ts';
import { corsHeaders, fail, json } from './http.ts';

const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const client = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
type Db = ReturnType<typeof client>;

const COLONNES = 'id, city, city_place_id, title, hook, body, period, problemes, status, a_relire';

interface Anecdote {
  id: string;
  city: string;
  city_place_id: string | null;
  title: string;
  hook: string | null;
  body: string;
  period: string | null;
  problemes: string[] | null;
  status: string;
  a_relire: boolean;
}

type Issue = 'publiee' | 'publiee_corrigee' | 'rejetee' | 'gardee' | 'deja';

const versRedaction = (a: Anecdote) => ({
  titre: a.title,
  accroche: a.hook ?? '',
  corps: a.body,
  periode: a.period ?? '',
});

async function arbitrerUne(apiKey: string, supabase: Db, a: Anecdote): Promise<{ id: string; issue: Issue; motif: string }> {
  let premier: Arbitrage | null = null;
  let consignes: string[] = [];

  const tracer = async (issue: Exclude<Issue, 'deja'>, motif: string, titreApres: string | null = null) => {
    await supabase.from('arbitrages_relecture').insert({
      anecdote_id: a.id,
      ville: a.city,
      titre_avant: a.title,
      titre_apres: titreApres,
      decision: issue,
      motif,
      consignes,
      reproches: premier?.reproches ?? [],
    });
    return { id: a.id, issue, motif };
  };
  const garder = (motif: string) => tracer('gardee', motif);

  // Le filtre sur l'état protège d'un clic humain arrivé entre-temps : sa
  // décision l'emporte.
  const conclure = (m: Record<string, unknown>) =>
    supabase.from('anecdotes').update({ ...m, a_relire: false }).eq('id', a.id).eq('status', 'draft').eq('a_relire', true).select('id');

  const publier = async (issue: 'publiee' | 'publiee_corrigee', motif: string, titreApres: string) => {
    const { data, error } = await conclure({ status: 'validated' });
    if (error) return garder(`Publication impossible : ${error.message}`);
    if (!data?.length) return { id: a.id, issue: 'deja' as const, motif: 'Décidée entre-temps.' };
    return tracer(issue, motif, titreApres);
  };

  const rejeter = async (motif: string, titre = a.title) => {
    const { data, error } = await conclure({ status: 'rejected' });
    if (error) return garder(`Rejet impossible : ${error.message}`);
    if (!data?.length) return { id: a.id, issue: 'deja' as const, motif: 'Décidée entre-temps.' };
    await supabase.from('rejets_anecdote').insert({
      city: a.city,
      city_place_id: a.city_place_id,
      titre,
      motif: `Rejetée par l'arbitre de relecture : ${motif}`,
    });
    return tracer('rejetee', motif);
  };

  // Le texte que la rédaction a lu, gardé avec son sujet.
  const { data: gardes } = await supabase
    .from('sujets_anecdote')
    .select('article, url, editeur, extrait')
    .eq('anecdote_id', a.id)
    .limit(1);
  const garde = gardes?.[0];
  if (!garde?.extrait) return garder('Source introuvable, laissée à la relecture humaine.');
  const dossier = `=== ${garde.article} — ${garde.editeur} (${garde.url}) ===\n${garde.extrait}`;

  const juger = async (version: Anecdote, sansCorrection: boolean) =>
    lireArbitrage(
      await chatJSON<unknown>({
        apiKey,
        system: ARBITRAGE_SYSTEM,
        user: arbitragePrompt(a.city, dossier, versRedaction(version), reprochesDe(version.problemes), sansCorrection),
        temperature: 0,
        maxTokens: 2500,
        etape: 'arbitrage',
        ville: a.city,
      }),
      sansCorrection
    );

  try {
    premier = await juger(a, false);
  } catch (err) {
    return garder(`Arbitrage impossible : ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!premier) return garder('Réponse de l’arbitre illisible, laissée à la relecture humaine.');

  if (premier.decision === 'rejeter') return rejeter(premier.motif || 'Rejetée par l’arbitre.');
  if (premier.decision === 'publier') {
    return publier('publiee', premier.motif || 'Reproches du vérificateur jugés infondés.', a.title);
  }

  // Corriger : les consignes deviennent la liste de ce qui empêche la
  // publication, que la réécriture doit lever.
  consignes = premier.consignes;
  const { error: e1 } = await supabase
    .from('anecdotes')
    .update({ problemes: consignes.map((c) => `Fond : ${c}`) })
    .eq('id', a.id)
    .eq('status', 'draft')
    .eq('a_relire', true);
  if (e1) return garder(`Consignes non enregistrées : ${e1.message}`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-anecdote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'x-anecto-admin-secret': ADMIN_SECRET!,
    },
    body: JSON.stringify({ mode: 'reecrire', id: a.id }),
  });
  const r = (await res.json().catch(() => ({}))) as { issue?: string; motif?: string; deja?: boolean };
  if (r.deja) return { id: a.id, issue: 'deja', motif: 'Décidée entre-temps.' };

  const { data: apres } = await supabase.from('anecdotes').select(COLONNES).eq('id', a.id).maybeSingle();
  const nouvelle = apres as Anecdote | null;
  const motifCorrection = premier.motif || 'Corrigée selon les reproches fondés.';

  // Confirmée par le vérificateur : `reecrire` l'a déjà publiée.
  if (r.issue === 'publiable' && nouvelle?.status === 'validated') {
    return tracer('publiee_corrigee', motifCorrection, nouvelle.title);
  }
  if (!nouvelle || nouvelle.status !== 'draft' || !nouvelle.a_relire) {
    return { id: a.id, issue: 'deja', motif: 'Décidée entre-temps.' };
  }
  if (r.issue !== 'a_relire') {
    return rejeter(`Correction impossible (${r.motif ?? `réponse ${res.status}`}).`);
  }

  // Encore un doute sur la nouvelle version : dernière lecture.
  let second: Arbitrage | null;
  try {
    second = await juger(nouvelle, true);
  } catch (err) {
    return garder(`Second arbitrage impossible : ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!second) return garder('Second arbitrage illisible, laissée à la relecture humaine.');
  if (second.decision !== 'publier') {
    return rejeter(second.motif || 'Doute fondé persistant après correction.', nouvelle.title);
  }
  return publier('publiee_corrigee', `${motifCorrection} ${second.motif}`.trim(), nouvelle.title);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non supportée.', 405);
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }
  if (!DEEPSEEK_API_KEY) return fail("DEEPSEEK_API_KEY n'est pas configurée sur la fonction.", 500);

  const supabase = client();
  compterAvec(async (c) => {
    const { error } = await supabase.from('deepseek_appels').insert(c);
    if (error) console.error('Suivi DeepSeek', error);
  });

  const { data, error } = await supabase
    .from('anecdotes')
    .select(COLONNES)
    .eq('status', 'draft')
    .eq('a_relire', true)
    .is('arbitree_le', null)
    .order('created_at')
    .limit(1);
  if (error) return fail(error.message, 500);
  const a = (data ?? [])[0] as Anecdote | undefined;
  if (!a) return json({ arbitrees: 0 });

  // Réservée d'emblée : un passage suivant ne la reprend pas pendant
  // l'arbitrage, ni après une panne (elle reste alors à l'humain).
  await supabase.from('anecdotes').update({ arbitree_le: new Date().toISOString() }).eq('id', a.id);

  try {
    return json(await arbitrerUne(DEEPSEEK_API_KEY, supabase, a));
  } catch (err) {
    console.error('Arbitrage', a.id, err);
    return json({ id: a.id, issue: 'echec', motif: err instanceof Error ? err.message : String(err) }, 500);
  }
});
