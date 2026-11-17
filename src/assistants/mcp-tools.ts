/**
 * The NextTram MCP tools and a JSON-RPC handler, shared by the local stdio server
 * (mcp-server.mjs) and the online one (api/mcp.js) that Claude and ChatGPT connect to.
 */
import { DEFAULT_ROUTES, CITIES } from '../data/stops.ts';
import { fetchRoutes } from '../sync/favorites-sync.ts';
import { createTransitClient, fetchRoute, planTrips, isCatchable, describePlan, formatClock, routeOptions, formatWalk, bufferSecs } from '../transit/index.ts';

import type { CityKey, ModeFilter, Route, RouteStop } from '../transit/types.ts';
import type { TransitClient } from '../transit/index.ts';

export const SERVER_INFO = { name: 'next-tram', version: '2.1.0' };

/** A tool as announced to MCP clients (JSON Schema for its input). */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'get_next_tram',
    description:
      'Answer "when is the next tram?": checks the user\'s home stops in parallel, skips trams they cannot reach in time (walk time), and says which stop to walk to and when to leave. With no arguments it uses the user\'s first favorite route from the NextTram app.',
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Favorite route id or name (see list_routes). Leave out for the first favorite.' },
        back: { type: 'boolean', description: 'Trip back: from the destination to the home stops.' },
        city: { type: 'string', enum: Object.keys(CITIES), description: 'City for a custom trip (default leipzig).' },
        from: { type: 'string', description: 'Custom trip: first stop near the user, e.g. "Edlichstraße".' },
        from_walk_minutes: { type: 'number', description: 'Minutes to walk to the first stop (default 2).' },
        from2: { type: 'string', description: 'Custom trip: optional second stop near the user.' },
        from2_walk_minutes: { type: 'number', description: 'Minutes to walk to the second stop (default 4).' },
        to: { type: 'string', description: 'Custom trip: destination stop, e.g. "Augustusplatz".' },
        buffer_seconds: { type: 'number', description: 'Custom trip: spare seconds added to each walk (0, 15, 30 or 60). Favorites use the buffer set in the app.' },
        modes: { type: 'string', enum: ['tram', 'tram_bus', 'all'], description: 'Which vehicles count (default tram_bus).' },
        language: { type: 'string', enum: ['en', 'de', 'pt'], description: 'Answer language (default en).' },
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
    description: "List the user's favorite routes (the first one is the default).",
    inputSchema: { type: 'object', properties: {} },
  },
];

/**
 * code: the personal code from the app (answers for the user's own favorites).
 * defaultRoute: route id used when none is asked for (else the first favorite).
 * loadFavorites: how to read the saved favorites for the code (default: over HTTP from the app).
 */
export interface McpOptions {
  code?: string;
  defaultRoute?: string;
  client?: TransitClient;
  loadFavorites?: (code: string) => Promise<Route[] | null>;
}

/** Arguments of get_next_tram (all optional, see the tool's inputSchema). */
interface NextTramArgs {
  route?: string;
  back?: boolean;
  city?: CityKey;
  from?: string;
  from_walk_minutes?: number;
  from2?: string;
  from2_walk_minutes?: number;
  to?: string;
  buffer_seconds?: number;
  modes?: ModeFilter;
  language?: string;
}

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string };
}

export function createMcpHandler({ code, defaultRoute, client, loadFavorites = (c) => fetchRoutes(c) }: McpOptions = {}) {
  const transit = client ?? createTransitClient({ userAgent: 'NextTram-MCP/2.1 (+https://github.com/mateusmorgado/next-tram)' });

  /** The user's favorites from the app (via the code), else the built-in ones. Refreshed at most once a minute. */
  let favCache: { at: number; routes: Route[] | null } = { at: 0, routes: null };
  async function favorites(): Promise<Route[]> {
    if (!code) return DEFAULT_ROUTES;
    if (Date.now() - favCache.at > 60000) favCache = { at: Date.now(), routes: await loadFavorites(code).catch(() => null) };
    return favCache.routes || DEFAULT_ROUTES;
  }

  async function findRoute(key?: string): Promise<Route | null | undefined> {
    const routes = await favorites();
    const wanted = key || defaultRoute;
    if (!wanted) return routes[0];
    const k = String(wanted).toLowerCase();
    return routes.find((r) => r.id.toLowerCase() === k || (r.label || '').toLowerCase() === k || r.dest.name.toLowerCase() === k) || null;
  }

  async function buildRoute(args: NextTramArgs): Promise<Route> {
    if (args.from || args.to) {
      if (!args.from || !args.to) throw new Error('A custom trip needs both "from" and "to".');
      const stops: RouteStop[] = [{ stop: { name: args.from }, walk: args.from_walk_minutes ?? 2 }];
      if (args.from2) stops.push({ stop: { name: args.from2 }, walk: args.from2_walk_minutes ?? 4 });
      return { id: 'custom', label: 'Custom', city: args.city || 'leipzig', stops, dest: { name: args.to }, modes: args.modes, buffer: args.buffer_seconds };
    }
    const route = await findRoute(args.route);
    if (!route) throw new Error(`Unknown route "${args.route}". Known: ${(await favorites()).map((r) => r.id).join(', ')}`);
    return args.modes ? { ...route, modes: args.modes } : route;
  }

  async function getNextTram(args: NextTramArgs = {}): Promise<string> {
    const route = await buildRoute(args);
    const reversed = Boolean(args.back);
    const now = Date.now();
    const { connections, errors } = await fetchRoute(transit, route, { reversed });
    const plan = planTrips(connections, now, { slots: routeOptions(route, reversed).length, byArrival: reversed });
    const lang = args.language === 'de' || args.language === 'pt' ? args.language : 'en';
    const lines = [describePlan(plan, now, { lang, reversed })];

    const later = plan.upcoming.filter((c) => c !== plan.hero && isCatchable(c, now)).slice(0, 4);
    if (later.length) {
      lines.push('', { en: 'After that:', de: 'Danach:', pt: 'Depois:' }[lang]);
      for (const c of later) {
        const where = reversed ? `to ${c.toName}` : `from ${c.stopName}`;
        lines.push(`- ${formatClock(c.depMs)} ${c.lineName} ${where} → ${c.direction}${c.arrMs ? ` (arr ${formatClock(c.arrMs)})` : ''}`);
      }
    }
    if (errors.length) lines.push('', `Note: one stop could not be checked (${errors.map((e) => e.message).join('; ')}).`);
    return lines.join('\n');
  }

  async function searchStops({ query, city = 'leipzig' }: { query: string; city?: CityKey }): Promise<string> {
    const stops = await transit.searchStops(city, query);
    if (!stops.length) return `No stops found for "${query}" in ${city}.`;
    return stops.map((s) => `- ${s.name}`).join('\n');
  }

  async function listRoutes() {
    return (await favorites()).map((r) => {
      const homes = r.stops.map((s) => `${s.stop.name} (${formatWalk(s.walk)} walk)`).join(' or ');
      const spare = bufferSecs(r.buffer) ? ` +${bufferSecs(r.buffer)} s spare` : '';
      return `- ${r.id}${r.label ? ` (${r.label})` : ''}: ${homes} → ${r.dest.name} [${CITIES[r.city]?.label || r.city}]${spare}`;
    }).join('\n');
  }

  const HANDLERS: Record<string, (args: any) => Promise<string>> = { get_next_tram: getNextTram, search_stops: searchStops, list_routes: listRoutes };

  /** Handles one JSON-RPC message; resolves to the reply, or null for a notification. */
  return async function handle(msg?: JsonRpcMessage | null) {
    const { id, method, params } = msg || {};
    const isRequest = id !== undefined && id !== null;
    try {
      let result: unknown;
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
            instructions: 'Use get_next_tram with no arguments when the user asks "next tram" or when to leave.',
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call': {
          const fn = HANDLERS[params?.name ?? ''];
          if (!fn) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
          try {
            const text = await fn(params?.arguments || {});
            result = { content: [{ type: 'text', text }] };
          } catch (err) {
            result = { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
          }
          break;
        }
        default:
          if (!isRequest) return null; // notifications such as notifications/initialized
          throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
      }
      return isRequest ? { jsonrpc: '2.0', id, result } : null;
    } catch (err) {
      const e = err as Error & { code?: number };
      return isRequest ? { jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message } } : null;
    }
  };
}
