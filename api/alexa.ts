/**
 * The NextTram Alexa skill's HTTPS endpoint: https://app.nexttram.morgado.tech/api/alexa
 * In the Alexa developer console: Endpoint → HTTPS → this URL, with
 * "My development endpoint has a certificate from a trusted certificate authority".
 *
 * Every request is checked to come from Amazon (lib/alexa-verify.js), then runs the same handler
 * as alexa-skill.mjs. Each Alexa user can link their own stops ("pair").
 * A private skill can still add ?code=<personal code> to answer for one fixed set of favorites.
 *
 * Env: ALEXA_SKILL_ID (optional, comma-separated) only accepts requests for these skills.
 */
import type { Headers } from '../src/server/http.ts';
import { isValidCode, normalizeCode } from '../src/sync/favorites-sync.ts';
import { verifyAlexaRequest, skillIdsFromEnv, AlexaVerifyError } from '../src/server/alexa-verify.ts';
import { handler as alexa } from '../src/assistants/alexa-skill.ts';
import { loadFavorites, store } from '../src/server/store.ts';
import { countCall } from '../src/sync/call-stats.ts';
import { createPairing, type PairingService } from '../src/server/alexa-link.ts';

/**
 * One Alexa request → { status, body }. rawBody must be the exact bytes Amazon sent,
 * which is why this function uses the Web handler (request.text()) below: Vercel's
 * (req, res) handler parses JSON bodies before we can read them.
 */
export interface AlexaRequest {
  method?: string;
  headers?: Headers | globalThis.Headers;
  rawBody?: Buffer;
  query?: Record<string, string>;
}

export async function respond(
  { method, headers, rawBody, query = {} }: AlexaRequest,
  { verify = verifyAlexaRequest, pairing = createPairing(store) }: { verify?: typeof verifyAlexaRequest; pairing?: PairingService | null } = {},
): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
  if (method !== 'POST') return { status: 405, body: { error: 'Alexa sends POST requests here.' }, headers: { Allow: 'POST' } };
  let event: Awaited<ReturnType<typeof verifyAlexaRequest>>;
  try {
    event = await verify({ headers, rawBody, skillIds: skillIdsFromEnv() });
  } catch (e) {
    console.warn('alexa: refused request:', e instanceof AlexaVerifyError ? e.message : e);
    return { status: 400, body: { error: 'Request could not be verified.' } };
  }
  const code = normalizeCode(query.code);
  const reply = await alexa(event, null, {
    code: isValidCode(code) ? code : undefined,
    defaultRoute: query.route,
    loadFavorites,
    pairing: pairing ?? undefined,
  });
  return { status: 200, body: reply };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const out = await respond({
      method: request.method,
      headers: request.headers,
      rawBody: request.method === 'POST' ? Buffer.from(await request.arrayBuffer()) : undefined,
      query: Object.fromEntries(url.searchParams),
    });
    if (out.status === 200) await countCall(store, 'alexa');
    return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store', ...(out.headers || {}) } });
  },
};
