// Shared by the API functions (files starting with "_" are not routes on Vercel).
import { createRedisStore } from '../lib/favorites-sync.js';

// Vercel's Upstash integration names the variables after the prefix chosen at install (KV, STORAGE, …).
const env = (suffix) => {
  for (const k of [`KV_${suffix}`, `STORAGE_KV_${suffix}`, `STORAGE_${suffix}`]) if (process.env[k]) return process.env[k];
  const any = Object.keys(process.env).find((k) => k.endsWith(`_${suffix}`) && !k.includes('READ_ONLY'));
  return any ? process.env[any] : undefined;
};

export const store = createRedisStore({
  url: env('REST_API_URL') || process.env.UPSTASH_REDIS_REST_URL,
  token: env('REST_API_TOKEN') || process.env.UPSTASH_REDIS_REST_TOKEN,
});

/** The saved favorites for a code, straight from storage, or null. */
export async function loadFavorites(code) {
  if (!store) return null;
  const saved = await store.get(code);
  return saved?.routes?.length ? saved.routes : null;
}
