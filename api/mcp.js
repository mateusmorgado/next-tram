/**
 * Online MCP server (Streamable HTTP, stateless, JSON replies), so Claude and ChatGPT can add
 * NextTram as a connector with just a link:  https://app.nexttram.morgado.tech/api/mcp?code=<code>
 *
 * The code from the app's AI screen makes the answers follow the user's own favorites;
 * without one it uses the built-in routes. No sign-in: the code is the only key.
 */
import { isValidCode, normalizeCode } from '../lib/favorites-sync.js';
import { createMcpHandler } from '../lib/mcp-tools.js';
import { loadFavorites } from './_store.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') console.log(`[mcp] ${req.method} accept=${req.headers?.accept || ''}`);
  if (req.method !== 'POST') {
    // No server-to-client stream: everything is answered in the POST reply.
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Send MCP requests with POST.' });
  }

  let body;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (!body) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty request' } });

  // One line per request so a failing connector can be traced in the Vercel logs (never the code itself).
  const methods = (Array.isArray(body) ? body : [body]).map((m) => m?.method).join(',');
  console.log(`[mcp] ${methods} code=${req.query?.code ? 'yes' : 'no'} ua=${String(req.headers?.['user-agent'] || '').slice(0, 60)}`);

  const code = normalizeCode(req.query?.code);
  const handle = createMcpHandler({ code: isValidCode(code) ? code : undefined, defaultRoute: req.query?.route, loadFavorites });
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!replies.length) return res.status(202).end(); // only notifications
  return res.status(200).json(batch ? replies : replies[0]);
}
