/**
 * Online Alexa endpoint, so a personal Alexa skill needs no AWS Lambda:
 * in the Alexa developer console, Endpoint → HTTPS → https://app.nexttram.morgado.tech/api/alexa?code=<code>
 * It runs the same handler as alexa-skill.mjs.
 */
import { isValidCode, normalizeCode } from '../lib/favorites-sync.js';
import { handler as alexa } from '../alexa-skill.mjs';
import { loadFavorites } from './_store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Alexa sends POST requests here.' });
  }
  let event;
  try {
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Bad request.' });
  }
  const code = normalizeCode(req.query?.code);
  const reply = await alexa(event, null, { code: isValidCode(code) ? code : undefined, defaultRoute: req.query?.route, loadFavorites });
  return res.status(200).json(reply);
}
