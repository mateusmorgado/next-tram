/**
 * The NextTram Alexa skill's HTTPS endpoint: https://app.nexttram.morgado.tech/api/alexa
 * In the Alexa developer console: Endpoint → HTTPS → this URL, with
 * "My development endpoint has a certificate from a trusted certificate authority".
 *
 * Every request is checked to come from Amazon (lib/alexa-verify.js), then runs the same handler
 * as alexa-skill.mjs. Each Alexa user can link their own stops ("connect my stops").
 * A private skill can still add ?code=<personal code> to answer for one fixed set of favorites.
 *
 * Env: ALEXA_SKILL_ID (optional, comma-separated) only accepts requests for these skills.
 */
import { isValidCode, normalizeCode } from '../lib/favorites-sync.js';
import { verifyAlexaRequest, skillIdsFromEnv, AlexaVerifyError } from '../lib/alexa-verify.js';
import { handler as alexa } from '../alexa-skill.mjs';
import { loadFavorites, store } from './_store.js';
import { createPairing } from './_alexa-link.js';

// The signature covers the exact bytes Amazon sent, so Vercel must not parse the body first.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return req.rawBody;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  if (!chunks.length && (typeof req.body === 'string' || Buffer.isBuffer(req.body))) return req.body; // already read by the platform
  return Buffer.concat(chunks);
}

export default async function handler(req, res, { verify = verifyAlexaRequest, pairing = createPairing(store) } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Alexa sends POST requests here.' });
  }
  let event;
  try {
    event = await verify({ headers: req.headers, rawBody: await readRaw(req), skillIds: skillIdsFromEnv() });
  } catch (e) {
    if (!(e instanceof AlexaVerifyError)) console.error('alexa verify', e);
    return res.status(400).json({ error: 'Request could not be verified.' });
  }
  const code = normalizeCode(req.query?.code);
  const reply = await alexa(event, null, {
    code: isValidCode(code) ? code : undefined,
    defaultRoute: req.query?.route,
    loadFavorites,
    pairing,
  });
  return res.status(200).json(reply);
}
