/**
 * GET  /api/favorites?code=<code>          → { routes, updatedAt }
 * PUT  /api/favorites?code=<code>  {routes} → { ok, updatedAt }
 *
 * The code is the only key: whoever knows it can read and replace that list.
 * Only route fields (stop names, coordinates, walk times) are stored.
 */
import { isValidCode, normalizeCode, sanitizeRoutes } from '../lib/favorites-sync.js';
import { store } from './_store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!store) return res.status(503).json({ error: 'Favorites storage is not connected yet.' });

  const code = normalizeCode(req.query?.code);
  if (!isValidCode(code)) return res.status(400).json({ error: 'Missing or invalid code.' });

  try {
    if (req.method === 'GET') {
      const saved = await store.get(code);
      if (!saved) return res.status(404).json({ error: 'No favorites saved under this code.' });
      return res.status(200).json(saved);
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const routes = sanitizeRoutes(body.routes);
      if (!routes.length) return res.status(400).json({ error: 'No valid routes.' });
      const updatedAt = new Date().toISOString();
      await store.set(code, { routes, updatedAt });
      return res.status(200).json({ ok: true, updatedAt });
    }
    res.setHeader('Allow', 'GET, PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(502).json({ error: 'Storage error.' });
  }
}
