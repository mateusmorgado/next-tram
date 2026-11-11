#!/usr/bin/env node
/**
 * NextTram MCP server (stdio, zero dependencies, Node 18+).
 *
 * Tools:
 *   get_next_tram  – when to leave, which stop to walk to, and which tram to take
 *   search_stops   – find stop names in Leipzig or Berlin
 *   list_routes    – the built-in favorite routes
 *
 * Claude Desktop / Claude Code config:
 *   { "mcpServers": { "next-tram": { "command": "node", "args": ["/path/to/next-tram/mcp-server.mjs"] } } }
 *
 * Optional env: NEXT_TRAM_ROUTE=<route id> picks the default route (see lib/stops.js).
 */

import readline from 'node:readline';
import { DEFAULT_ROUTES, CITIES } from './lib/stops.js';
import { createTransitClient, fetchRoute, planTrips, describePlan, formatClock, routeOptions } from './lib/transit.js';

const client = createTransitClient({ userAgent: 'NextTram-MCP/2.0 (+https://github.com/mateusmorgado/next-tram)' });
const SERVER_INFO = { name: 'next-tram', version: '2.0.0' };

const TOOLS = [
  {
    name: 'get_next_tram',
    description:
      'Answer "when is the next tram?": checks the user\'s home stops in parallel, skips trams they cannot reach in time (walk time), and says which stop to walk to and when to leave. With no arguments it uses the default route (Edlichstraße / Torgauer Platz → Leipzig Hauptbahnhof).',
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: `Favorite route id or name: ${DEFAULT_ROUTES.map((r) => `${r.id} (${r.label})`).join(', ')}` },
        back: { type: 'boolean', description: 'Trip back: from the destination to the home stops.' },
        city: { type: 'string', enum: Object.keys(CITIES), description: 'City for a custom trip (default leipzig).' },
        from: { type: 'string', description: 'Custom trip: first stop near the user, e.g. "Edlichstraße".' },
        from_walk_minutes: { type: 'number', description: 'Minutes to walk to the first stop (default 2).' },
        from2: { type: 'string', description: 'Custom trip: optional second stop near the user.' },
        from2_walk_minutes: { type: 'number', description: 'Minutes to walk to the second stop (default 4).' },
        to: { type: 'string', description: 'Custom trip: destination stop, e.g. "Augustusplatz".' },
        modes: { type: 'string', enum: ['tram', 'tram_bus', 'all'], description: 'Which vehicles count (default tram_bus).' },
        language: { type: 'string', enum: ['en', 'de'], description: 'Answer language (default en).' },
      },
    },
  },
  {
    name: 'search_stops',
    description: 'Search public transport stops by name in Leipzig or Berlin.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Stop name, e.g. "edlichstr"' },
        city: { type: 'string', enum: Object.keys(CITIES), description: 'Default leipzig.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_routes',
    description: 'List the built-in favorite routes.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function findRoute(key) {
  const wanted = key || process.env.NEXT_TRAM_ROUTE;
  if (!wanted) return DEFAULT_ROUTES[0];
  const k = String(wanted).toLowerCase();
  return DEFAULT_ROUTES.find((r) => r.id === k || r.label.toLowerCase() === k) || null;
}

function buildRoute(args) {
  if (args.from || args.to) {
    if (!args.from || !args.to) throw new Error('A custom trip needs both "from" and "to".');
    const stops = [{ stop: { name: args.from }, walk: args.from_walk_minutes ?? 2 }];
    if (args.from2) stops.push({ stop: { name: args.from2 }, walk: args.from2_walk_minutes ?? 4 });
    return { id: 'custom', label: 'Custom', city: args.city || 'leipzig', stops, dest: { name: args.to }, destWalk: 0, modes: args.modes };
  }
  const route = findRoute(args.route);
  if (!route) throw new Error(`Unknown route "${args.route}". Known: ${DEFAULT_ROUTES.map((r) => r.id).join(', ')}`);
  return args.modes ? { ...route, modes: args.modes } : route;
}

async function getNextTram(args = {}) {
  const route = buildRoute(args);
  const reversed = Boolean(args.back);
  const now = Date.now();
  const { connections, errors } = await fetchRoute(client, route, { reversed });
  const plan = planTrips(connections, now, { slots: routeOptions(route, reversed).length });
  const lang = args.language === 'de' ? 'de' : 'en';
  const lines = [describePlan(plan, now, { lang, reversed })];

  if (plan.tooTight) {
    lines.push(
      lang === 'de'
        ? `(Die frühere ${plan.tooTight.lineName} ab ${plan.tooTight.stopName} um ${formatClock(plan.tooTight.depMs)} ist zu knapp.)`
        : `(The earlier ${plan.tooTight.lineName} from ${plan.tooTight.stopName} at ${formatClock(plan.tooTight.depMs)} is too tight to catch.)`,
    );
  }
  const later = plan.upcoming.filter((c) => c !== plan.hero && c.depMs - now >= c.walk * 60000).slice(0, 4);
  if (later.length) {
    lines.push('', lang === 'de' ? 'Danach:' : 'After that:');
    for (const c of later) {
      const where = reversed ? `to ${c.toName}` : `from ${c.stopName}`;
      lines.push(`- ${formatClock(c.depMs)} ${c.lineName} ${where} → ${c.direction}${c.arrMs ? ` (arr ${formatClock(c.arrMs)})` : ''}`);
    }
  }
  if (errors.length) lines.push('', `Note: one stop could not be checked (${errors.map((e) => e.message).join('; ')}).`);
  return lines.join('\n');
}

async function searchStops({ query, city = 'leipzig' }) {
  const stops = await client.searchStops(city, query);
  if (!stops.length) return `No stops found for "${query}" in ${city}.`;
  return stops.map((s) => `- ${s.name}`).join('\n');
}

function listRoutes() {
  return DEFAULT_ROUTES.map((r) => {
    const homes = r.stops.map((s) => `${s.stop.name} (${s.walk} min walk)`).join(' or ');
    return `- ${r.id}: ${homes} → ${r.dest.name} [${CITIES[r.city].label}]`;
  }).join('\n');
}

const HANDLERS = { get_next_tram: getNextTram, search_stops: searchStops, list_routes: listRoutes };

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        };
        break;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const fn = HANDLERS[params?.name];
        if (!fn) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
        try {
          const text = await fn(params.arguments || {});
          result = { content: [{ type: 'text', text }] };
        } catch (err) {
          result = { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
        break;
      }
      default:
        if (!isRequest) return; // notifications such as notifications/initialized
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
    if (isRequest) send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    if (isRequest) send({ jsonrpc: '2.0', id, error: { code: err.code || -32603, message: err.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m);
});
