/**
 * POST /api/alexa-link  { pin, code } → { ok: true }
 * The app sends the 2-digit number Alexa said, with its personal code. From then on
 * the Alexa skill answers that Alexa user with the favorites saved under the code.
 */
import type { ApiRequest, ApiResponse } from '../src/server/http.ts';
import { normalizeCode } from '../src/sync/favorites-sync.ts';
import { store } from '../src/server/store.ts';
import { createPairing, type PairingService } from '../src/server/alexa-link.ts';

export default async function handler(req: ApiRequest, res: ApiResponse, { pairing = createPairing(store) }: { pairing?: PairingService | null } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!pairing) return res.status(503).json({ error: 'Storage is not connected yet.' });
  let body: { pin?: unknown; code?: unknown };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as typeof body) || {};
  } catch {
    return res.status(400).json({ error: 'Bad request.' });
  }
  const pin = String(body.pin || '').replace(/\D/g, '');
  try {
    if (!(await pairing.finish(pin, normalizeCode(body.code)))) {
      return res.status(404).json({ error: 'That number is wrong or has expired. Ask Alexa for a new one.' });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Storage error.' });
  }
}
