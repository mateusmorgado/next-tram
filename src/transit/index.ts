/**
 * NextTram transit core. Shared by the PWA, the MCP server and the Alexa skill.
 *
 * - No runtime dependencies, no API keys. Works in browsers and Node 22+ (global fetch).
 * - Leipzig: Transitous (MOTIS 2) first, DB HAFAS (v6.db.transport.rest) as fallback.
 * - Berlin:  BVG HAFAS (v6.bvg.transport.rest) first, Transitous as fallback.
 *
 * The pure functions (planTrips, leaveAdvice, describePlan, …) take `now` as an
 * argument so they can be unit-tested without network or clocks.
 */
export * from './types.ts';
export * from './constants.ts';
export * from './names.ts';
export * from './products.ts';
export * from './parse/motis.ts';
export * from './parse/hafas.ts';
export * from './parse/common.ts';
export * from './client.ts';
export * from './route.ts';
export * from './catching.ts';
export * from './display.ts';
export * from './speech.ts';
