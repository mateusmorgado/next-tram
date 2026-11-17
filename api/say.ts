/**
 * The next tram as one short spoken sentence, in plain text, for voice shortcuts:
 *   https://app.nexttram.morgado.tech/api/say?code=<personal code>
 *
 * Siri: a Shortcut with "Get Contents of URL" (this link) + "Speak Text" answers
 * "Hey Siri, when is the next tram" out loud, on iPhone, Apple Watch and in CarPlay.
 * Any other tool that can fetch a URL and read it aloud works the same way.
 *
 * Query: code (follow the user's favorites), route (a route id or name, default: first favorite),
 *        back=1 (the trip back home), lang=de|en|pt (default: the caller's Accept-Language).
 */
import type { Headers } from '../src/server/http.ts';
import { isValidCode, normalizeCode } from '../src/sync/favorites-sync.ts';
import { nextTramSpeech } from '../src/assistants/alexa-skill.ts';
import { loadFavorites, store } from '../src/server/store.ts';
import { countCall } from '../src/sync/call-stats.ts';

/** 'de', 'pt' or 'en' from ?lang= or the Accept-Language header (iPhones send their own language). */
export function pickLocale(lang?: string | null, acceptLanguage?: string | null): string {
  const wanted = String(lang || acceptLanguage || '').trim().toLowerCase();
  return wanted.startsWith('de') ? 'de-DE' : wanted.startsWith('pt') ? 'pt-BR' : 'en-US';
}

const isYes = (v: unknown) => ['1', 'true', 'yes', 'ja'].includes(String(v || '').toLowerCase());

export async function respond({ method, query = {}, headers = {} }: { method?: string; query?: Record<string, string>; headers?: Headers | globalThis.Headers }): Promise<{ status: number; text: string; headers?: Record<string, string> }> {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405, text: 'Use GET.', headers: { Allow: 'GET, HEAD' } };
  const code = normalizeCode(query.code);
  const acceptLanguage = typeof (headers as globalThis.Headers).get === 'function' ? (headers as globalThis.Headers).get('accept-language') : ((headers as Headers)['accept-language'] as string | undefined);
  const text = await nextTramSpeech(
    { locale: pickLocale(query.lang, acceptLanguage), back: isYes(query.back), destination: query.route },
    { code: isValidCode(code) ? code : undefined, loadFavorites },
  );
  return { status: 200, text };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const out = await respond({ method: request.method, query: Object.fromEntries(url.searchParams), headers: request.headers });
    if (out.status === 200 && request.method === 'GET') await countCall(store, 'say');
    return new Response(request.method === 'HEAD' ? null : out.text, {
      status: out.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        ...(out.headers || {}),
      },
    });
  },
};
