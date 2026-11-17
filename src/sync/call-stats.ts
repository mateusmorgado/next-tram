/**
 * Call counter for the assistant endpoints (MCP, Alexa, Siri), shown on the portfolio's Calls card.
 * One Redis counter per endpoint and UTC day (kept 40 days) plus an all-time total. No codes, no user data.
 */
import type { RedisStore } from './favorites-sync.ts';

export const STAT_NAMES = ['mcp', 'alexa', 'say'];

/** The few store methods the counters need (the tests pass a fake). */
type CounterStore = Pick<RedisStore, 'incrKey' | 'mgetKeys'>;
const DAY_TTL = 40 * 24 * 3600;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Adds one call; never throws, so counting can't break an answer. */
export async function countCall(store: Partial<CounterStore> | null | undefined, name: string, now = new Date()): Promise<void> {
  if (!store?.incrKey || !STAT_NAMES.includes(name)) return;
  try {
    await Promise.all([store.incrKey(`stats:${name}:${day(now)}`, DAY_TTL), store.incrKey(`stats:${name}:total`)]);
  } catch (e) {
    console.error('[stats]', (e as Error).message);
  }
}

/** { days, total, services: [{ name, count, allTime }], daily } for the last `days` UTC days, oldest first. */
export async function readStats(store: CounterStore, { days = 30, now = new Date() }: { days?: number; now?: Date } = {}) {
  const dates = Array.from({ length: days }, (_, i) => day(new Date(now.getTime() - (days - 1 - i) * 86400_000)));
  const keys = STAT_NAMES.flatMap((n) => [...dates.map((d) => `stats:${n}:${d}`), `stats:${n}:total`]);
  const values = (await store.mgetKeys(keys)).map((v) => Number(v) || 0);
  const daily = new Array(days).fill(0);
  const services = STAT_NAMES.map((name, s) => {
    const row = values.slice(s * (days + 1), (s + 1) * (days + 1));
    row.slice(0, days).forEach((n, i) => (daily[i] += n));
    return { name: `nexttram-${name}`, count: row.slice(0, days).reduce((a, b) => a + b, 0), allTime: row[days] };
  });
  return { days, total: services.reduce((a, s) => a + s.count, 0), services, daily };
}
