#!/usr/bin/env node
/**
 * NextTram MCP server (stdio, zero dependencies, Node 18+), for running it on your own computer.
 * Most people use the online one instead: https://app.nexttram.morgado.tech/api/mcp?code=<code> (see api/mcp.js).
 *
 * Tools (lib/mcp-tools.js):
 *   get_next_tram  – when to leave, which stop to walk to, and which tram to take
 *   search_stops   – find stop names in Leipzig or Berlin
 *   list_routes    – the user's favorite routes
 *
 * Claude Desktop / Claude Code config:
 *   { "mcpServers": { "next-tram": { "command": "node", "args": ["/path/to/next-tram/mcp-server.mjs"] } } }
 *
 * Optional env:
 *   NEXT_TRAM_CODE=<code from the app's AI screen>  answer for the user's own favorites (first one by default)
 *   NEXT_TRAM_ROUTE=<route id>                      pick another default route
 */

import readline from 'node:readline';
import { createMcpHandler } from './lib/mcp-tools.js';

const handle = createMcpHandler({ code: process.env.NEXT_TRAM_CODE, defaultRoute: process.env.NEXT_TRAM_ROUTE });

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
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
  for (const m of Array.isArray(msg) ? msg : [msg]) handle(m).then((reply) => reply && send(reply));
});
