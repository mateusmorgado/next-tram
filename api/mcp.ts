/**
 * Online MCP server (Streamable HTTP, stateless, JSON replies), so Claude and ChatGPT can add
 * NextTram as a connector with just a link:  https://app.nexttram.morgado.tech/api/mcp/<code>
 *
 * The code from the app's AI screen makes the answers follow the user's own favorites;
 * without one it uses the built-in routes. No sign-in: the code is the only key.
 */
import type { ApiRequest, ApiResponse } from '../src/server/http.ts';
import type { JsonRpcMessage } from '../src/assistants/mcp-tools.ts';
import { isValidCode, normalizeCode } from '../src/sync/favorites-sync.ts';
import { createMcpHandler } from '../src/assistants/mcp-tools.ts';
import { loadFavorites, store } from '../src/server/store.ts';
import { countCall } from '../src/sync/call-stats.ts';

function readBody(req: ApiRequest): JsonRpcMessage | JsonRpcMessage[] | null {
  if (req.body && typeof req.body === 'object') return req.body as JsonRpcMessage | JsonRpcMessage[];
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  return null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') console.log(`[mcp] ${req.method} accept=${req.headers?.accept || ''} ua=${String(req.headers?.['user-agent'] || '').slice(0, 60)}`);
  if (req.method !== 'POST') {
    // No server-to-client stream: everything is answered in the POST reply.
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Send MCP requests with POST.' });
  }

  let body: JsonRpcMessage | JsonRpcMessage[] | null;
  try {
    body = readBody(req);
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (!body) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Empty request' } });

  // One line per request so a failing connector can be traced in the Vercel logs (never the code itself).
  const methods = (Array.isArray(body) ? body : [body]).map((m) => m?.method).join(',');
  const first = Array.isArray(body) ? body[0] : body;
  console.log(
    `[mcp] ${methods} code=${req.query?.code ? 'yes' : 'no'} proto=${first?.params?.protocolVersion || req.headers?.['mcp-protocol-version'] || '-'} accept=${req.headers?.accept || '-'} session=${req.headers?.['mcp-session-id'] ? 'yes' : 'no'} auth=${req.headers?.authorization ? 'yes' : 'no'} ua=${String(req.headers?.['user-agent'] || '').slice(0, 60)}`,
  );

  if (/tools\/call/.test(methods)) await countCall(store, 'mcp');
  const code = normalizeCode(req.query?.code);
  const handle = createMcpHandler({ code: isValidCode(code) ? code : undefined, defaultRoute: [req.query?.route].flat()[0], loadFavorites });
  const batch = Array.isArray(body);
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handle(m)))).filter((r) => r !== null);
  if (!replies.length) {
    console.log('[mcp] -> 202');
    return res.status(202).end(); // only notifications
  }
  console.log(`[mcp] -> 200 ${replies.map((r) => (r.error ? `error ${r.error.code} ${r.error.message}` : 'ok')).join(',')}`);
  return res.status(200).json(batch ? replies : replies[0]);
}
