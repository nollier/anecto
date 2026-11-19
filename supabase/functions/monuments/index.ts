// Rattacher chaque anecdote au monument dont elle parle.
//
// Le 19 novembre, une lectrice de Bordeaux a reçu deux anecdotes sur l'hôtel
// de la rue Labottière à quatre jours d'intervalle, sous deux titres
// différents. Rien ne reliait une anecdote à un lieu : le tirage du jour
// évitait la même anecdote, pas le même monument.
//
// Cette fonction donne à chaque anecdote une clé de monument
// (`anecdotes.monument`), commune à toutes les anecdotes d'une ville qui
// parlent du même lieu. `get_daily_anecdote_for` s'en sert pour ne pas
// resservir un monument trop tôt.
//
// Une ville par appel, et toutes ses anecdotes dans le même prompt : c'est la
// seule façon d'avoir la même clé pour deux anecdotes sur le même lieu. Les
// clés déjà posées sont données au modèle, qui les réutilise pour les
// anecdotes nouvelles.

import { createClient } from 'npm:@supabase/supabase-js@^2';
import { chatJSON, compterAvec } from './deepseek.ts';
import { corsHeaders, fail, json } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_SECRET = Deno.env.get('ANECTO_ADMIN_SECRET');
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

/** Anecdotes à classer par appel DeepSeek : la réponse doit tenir. */
const PAR_APPEL = 50;

const SYSTEM = `Tu ranges des anecdotes historiques d'une ville par monument.

Pour chaque anecdote à classer, donne la clé du lieu précis qui en est le sujet principal : un bâtiment, un édifice, un monument, une fontaine, un pont, un cimetière, un objet d'art identifié.

Règles :
- La clé est en minuscules, sans accent, mots séparés par des tirets, sans le nom de la ville : "hotel-labottiere", "basilique-saint-michel", "gare-saint-jean".
- Deux anecdotes sur le même lieu ont la même clé, même si elles le nomment autrement (ancien nom, nom actuel, adresse, institution qui l'occupe). Un lieu et l'une de ses parties (le clocher d'une église, la verrière d'une gare) ont la même clé.
- Si une clé existante désigne le lieu, réutilise-la exactement.
- null si l'anecdote parle d'une personne, d'un événement ou d'une coutume, et que le lieu n'est qu'un décor. Dans le doute, null.

Réponds en JSON : {"classement": [{"n": 1, "monument": "hotel-labottiere"}, {"n": 2, "monument": null}]}`;

interface Anecdote {
  id: string;
  title: string;
  hook: string | null;
  body: string;
  monument: string | null;
  monument_calcule_at: string | null;
}

function nettoyer(cle: unknown): string | null {
  if (typeof cle !== 'string') return null;
  const c = cle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return c === '' || c === 'null' ? null : c;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non supportée.', 405);
  if (!ADMIN_SECRET || req.headers.get('x-anecto-admin-secret') !== ADMIN_SECRET) {
    return fail('Non autorisé.', 401);
  }
  if (!DEEPSEEK_API_KEY) return fail("DEEPSEEK_API_KEY n'est pas configurée sur la fonction.", 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  compterAvec(async (c) => {
    const { error } = await supabase.from('deepseek_appels').insert(c);
    if (error) console.error('Suivi DeepSeek', error);
  });

  // La ville : celle demandée, sinon la première qui a des anecdotes à classer.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Corps vide : on prend la suivante.
  }
  let placeId = typeof body.cityPlaceId === 'string' ? body.cityPlaceId : null;
  if (!placeId) {
    const { data, error } = await supabase.rpc('ville_monuments_a_classer');
    if (error) return fail(`Ville à classer : ${error.message}`, 500);
    placeId = (data as string | null) ?? null;
  }
  if (!placeId) return json({ ville: null, classees: 0 });

  const { data: lignes, error } = await supabase
    .from('anecdotes')
    .select('id, city, title, hook, body, monument, monument_calcule_at')
    .eq('city_place_id', placeId)
    .in('status', ['validated', 'draft'])
    .order('created_at');
  if (error) return fail(`Lecture des anecdotes : ${error.message}`, 500);

  const toutes = (lignes ?? []) as (Anecdote & { city: string })[];
  const ville = toutes[0]?.city ?? placeId;
  const aClasser = toutes.filter((a) => !a.monument_calcule_at).slice(0, PAR_APPEL);
  if (aClasser.length === 0) return json({ ville, classees: 0 });

  const existantes = [...new Set(toutes.map((a) => a.monument).filter((m): m is string => !!m))];

  // Les anecdotes déjà classées sont montrées aussi, avec leur clé : c'est
  // ce qui permet au modèle de reconnaître un lieu déjà rencontré.
  const deja = toutes
    .filter((a) => a.monument)
    .map((a) => `- [${a.monument}] ${a.title}`)
    .join('\n');
  const liste = aClasser
    .map((a, i) => {
      const extrait = a.body.replace(/\s+/g, ' ').slice(0, 500);
      return `${i + 1}. ${a.title}${a.hook ? ` (${a.hook})` : ''}\n${extrait}`;
    })
    .join('\n\n');

  const user = `Ville : ${ville}

Clés existantes : ${existantes.length ? existantes.join(', ') : 'aucune'}
${deja ? `\nAnecdotes déjà classées :\n${deja}\n` : ''}
Anecdotes à classer :

${liste}

Réponds en JSON.`;

  let reponse: { classement?: { n?: number; monument?: unknown }[] };
  try {
    reponse = await chatJSON({
      apiKey: DEEPSEEK_API_KEY,
      system: SYSTEM,
      user,
      temperature: 0,
      maxTokens: 4000,
      etape: 'monuments',
      ville,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 502);
  }

  const parNumero = new Map<number, string | null>();
  for (const c of reponse.classement ?? []) {
    if (typeof c.n === 'number') parNumero.set(c.n, nettoyer(c.monument));
  }

  const maintenant = new Date().toISOString();
  let classees = 0;
  const resultat: { titre: string; monument: string | null }[] = [];
  for (const [i, a] of aClasser.entries()) {
    // Une anecdote oubliée par le modèle reste à classer : elle repassera.
    if (!parNumero.has(i + 1)) continue;
    const monument = parNumero.get(i + 1) ?? null;
    const { error: e } = await supabase
      .from('anecdotes')
      .update({ monument, monument_calcule_at: maintenant })
      .eq('id', a.id);
    if (e) {
      console.error('Monument', a.id, e);
      continue;
    }
    classees++;
    resultat.push({ titre: a.title, monument });
  }

  return json({ ville, classees, restantes: toutes.filter((a) => !a.monument_calcule_at).length - classees, resultat });
});
