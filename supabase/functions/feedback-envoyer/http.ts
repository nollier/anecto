// Chaque fonction est autonome : pas d'import `../_shared/`, pour que le
// déploiement soit identique via la CLI et via l'API Functions.
//
// Supabase force le Content-Type des fonctions Edge à `text/plain` et ajoute
// une CSP `sandbox` dès que la réponse n'est pas du JSON — mesure de la
// plateforme contre l'hébergement de pages HTML arbitraires sous *.supabase.co,
// non contournable depuis le code de la fonction. Impossible donc de servir un
// vrai formulaire HTML : cette fonction ne renvoie que du texte.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export function texte(corps: string, status = 200): Response {
  return new Response(corps, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
