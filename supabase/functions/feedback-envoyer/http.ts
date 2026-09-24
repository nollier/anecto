// Chaque fonction est autonome : pas d'import `../_shared/`, pour que le
// déploiement soit identique via la CLI et via l'API Functions.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function page(corps: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Anecto</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 60px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #999; text-transform: uppercase; letter-spacing: 0.02em; margin: 24px 0 8px; }
  p.contexte { color: #888; font-size: 13px; margin-top: 0; }
  blockquote { background: #faf6f2; border-left: 3px solid #b3402f; padding: 12px 16px; margin: 0; white-space: pre-wrap; font-size: 15px; line-height: 1.5; }
  button { background: #b3402f; color: #fff; border: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; cursor: pointer; margin-top: 24px; }
  button:hover { background: #94331f; }
</style>
</head>
<body>${corps}</body>
</html>`;
}

export function html(corps: string, status = 200): Response {
  return new Response(page(corps), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
