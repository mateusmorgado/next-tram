/**
 * GET /api/stats -> how often the assistants asked NextTram in the last 30 days (per endpoint and day).
 * Public on purpose: only counts, no codes or user data. Read by the portfolio's Calls card (morgado.tech).
 */
import { readStats } from '../lib/call-stats.js';
import { store } from './_store.js';

const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' };

export default {
  async fetch(request) {
    if (request.method !== 'GET') return Response.json({ error: 'Use GET.' }, { status: 405, headers: { Allow: 'GET' } });
    if (!store) return Response.json({ error: 'Storage not configured.' }, { status: 503, headers });
    try {
      return Response.json(await readStats(store), { headers });
    } catch (e) {
      console.error('[stats]', e.message);
      return Response.json({ error: 'Stats unavailable.' }, { status: 502, headers });
    }
  },
};
