/**
 * /.well-known/oauth-* for the MCP connector. NextTram needs no sign-in, so these answer a clean
 * JSON 404 (with CORS), which tells Claude and ChatGPT to connect without OAuth. Each hit is logged
 * so a connector that never reaches /api/mcp can still be traced in the Vercel logs.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Protocol-Version, Authorization');
  const path = String(req.query?.path || '').slice(0, 120);
  console.log(`[well-known] ${req.method} /${path} ua=${String(req.headers?.['user-agent'] || '').slice(0, 60)}`);
  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(404).json({ error: 'not_found', error_description: 'NextTram needs no sign-in.' });
}
