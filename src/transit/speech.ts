/** Plain sentences for voice assistants (Alexa, Claude, ChatGPT, Siri). */
import { isCatchable, needsRun } from './catching.ts';
import type { Connection, Lang, Plan } from './types.ts';


// Voice answer rules (Alexa, Claude, ChatGPT all use describePlan):
//  - lead with when to leave the house; minutes only, no clock times or arrival
//  - trams you can no longer reach, even running, are skipped silently (see isCatchable)
//  - a tram you only make by running says "Run now" instead of "Leave now"
//  - name the stop only when the route has two stops; never the direction
//  - add one backup that leaves at least BACKUP_GAP_MIN later (a tram one minute
//    behind is no real backup); if that is more than LONG_GAP_MIN away, warn instead
//  - trip back: you're at the station already, so "leaves in" instead of "leave in"
export const BACKUP_GAP_MIN = 3;
export const LONG_GAP_MIN = 20;

const leaveMs = (c: Pick<Connection, 'depMs' | 'walk'>) => c.depMs - (c.walk || 0) * 60000;
const minsFrom = (ms: number, now: number) => Math.max(0, Math.floor((ms - now) / 60000));

/** The backup after `hero`: the first catchable tram leaving at least BACKUP_GAP_MIN later. */
export function backupFor(plan: SpokenPlan, now: number): Connection | null {
  const { hero } = plan;
  if (!hero) return null;
  return (
    (plan.upcoming || [])
      .filter((c) => c !== hero && isCatchable(c, now) && leaveMs(c) >= leaveMs(hero) + BACKUP_GAP_MIN * 60000)
      .sort((a, b) => leaveMs(a) - leaveMs(b))[0] || null
  );
}

/** `m` is 0 or an already spelled-out amount ("3 minutes"): 0 means "now". */
type Amount = number | string;

interface Words {
  min: (n: number) => string;
  at: (stop: string) => string;
  leave: (m: Amount, what: string) => string;
  run: (what: string) => string;
  goesIn: (m: Amount) => string;
  orLeave: (m: string, what: string) => string;
  leaves: (what: string, m: Amount) => string;
  then: (what: string, m: string) => string;
  gap: (m: string) => string;
  change: (ch: { at: string; line: string }) => string;
  noneTight: string;
  none: string;
}

/** The part of a Plan that is spoken. */
export type SpokenPlan = Pick<Plan, 'hero' | 'tooTight' | 'upcoming'> & Partial<Pick<Plan, 'perSlot'>>;

const WORDS: Record<Lang, Words> = {
  en: {
    min: (n) => `${n} ${n === 1 ? 'minute' : 'minutes'}`,
    at: (stop) => ` at ${stop}`,
    leave: (m, what) => (m === 0 ? `Leave now for ${what}` : `Leave in ${m} for ${what}`),
    run: (what) => `Run now for ${what}`,
    goesIn: (m) => (m === 0 ? ', it goes now' : `, it goes in ${m}`),
    orLeave: (m, what) => `Or leave in ${m} for ${what}.`,
    leaves: (what, m) => `${what} leaves ${m === 0 ? 'now' : `in ${m}`}`,
    then: (what, m) => `Then ${what} in ${m}.`,
    gap: (m) => `After that, nothing for ${m}.`,
    change: (ch) => ` Change at ${ch.at} to ${ch.line}.`,
    noneTight: 'Nothing you can still catch is coming soon.',
    none: 'I could not find any departures right now.',
  },
  de: {
    min: (n) => `${n} ${n === 1 ? 'Minute' : 'Minuten'}`,
    at: (stop) => ` ab ${stop}`,
    leave: (m, what) => (m === 0 ? `Geh jetzt los, ${what}` : `Geh in ${m} los, ${what}`),
    run: (what) => `Lauf jetzt los, ${what}`,
    goesIn: (m) => (m === 0 ? ', fährt jetzt' : `, fährt in ${m}`),
    orLeave: (m, what) => `Oder in ${m}, ${what}.`,
    leaves: (what, m) => `${what} fährt ${m === 0 ? 'jetzt' : `in ${m}`}`,
    then: (what, m) => `Danach ${what} in ${m}.`,
    gap: (m) => `Danach kommt ${m} lang nichts.`,
    change: (ch) => ` Umsteigen an ${ch.at} in ${ch.line}.`,
    noneTight: 'So bald kommt nichts mehr, das du noch schaffst.',
    none: 'Ich habe gerade keine Verbindungen gefunden.',
  },
  pt: {
    min: (n) => `${n} ${n === 1 ? 'minuto' : 'minutos'}`,
    at: (stop) => ` em ${stop}`,
    leave: (m, what) => (m === 0 ? `Saia agora para o ${what}` : `Saia em ${m} para o ${what}`),
    run: (what) => `Corra agora para o ${what}`,
    goesIn: (m) => (m === 0 ? ', ele sai agora' : `, ele sai em ${m}`),
    orLeave: (m, what) => `Ou saia em ${m} para o ${what}.`,
    leaves: (what, m) => `O ${what} sai ${m === 0 ? 'agora' : `em ${m}`}`,
    then: (what, m) => `Depois, o ${what} em ${m}.`,
    gap: (m) => `Depois disso, nada por ${m}.`,
    change: (ch) => ` Troque em ${ch.at} para o ${ch.line}.`,
    noneTight: 'Não vem nada que você ainda consiga pegar.',
    none: 'Não encontrei nenhuma partida agora.',
  },
};

/**
 * Plain sentences for voice assistants. lang: 'en' | 'de' | 'pt'.
 * stops: how many stops the route has (defaults to the plan's slots); the stop is named only with two.
 */
export function describePlan(
  plan: SpokenPlan,
  now: number,
  { lang = 'en', reversed = false, stops }: { lang?: Lang | string; reversed?: boolean; stops?: number } = {},
): string {
  const w = WORDS[(lang in WORDS ? lang : 'en') as Lang];
  const { hero, tooTight } = plan;
  const twoStops = !reversed && (stops ?? plan.perSlot?.length ?? 1) > 1;
  const what = (c: Connection) => `${c.lineName}${twoStops && c.stopName ? w.at(c.stopName) : ''}`;

  if (!hero) return tooTight ? w.noneTight : w.none;

  const parts: string[] = [];
  const backup = backupFor(plan, now);
  const atStop = reversed || !hero.walk;

  if (atStop) {
    parts.push(`${w.leaves(what(hero), minsFrom(hero.depMs, now) && w.min(minsFrom(hero.depMs, now)))}.`);
  } else {
    const leaveIn = minsFrom(leaveMs(hero), now);
    let first = needsRun(hero, now) ? w.run(what(hero)) : w.leave(leaveIn && w.min(leaveIn), what(hero));
    if (leaveIn === 0) first += w.goesIn(minsFrom(hero.depMs, now) && w.min(minsFrom(hero.depMs, now)));
    parts.push(`${first}.`);
  }
  if (reversed && hero.changes?.length) parts[parts.length - 1] += w.change(hero.changes[0]);

  if (backup) {
    const m = minsFrom(atStop ? backup.depMs : leaveMs(backup), now);
    if (m > LONG_GAP_MIN) parts.push(w.gap(w.min(m)));
    else parts.push(atStop ? w.then(what(backup), w.min(m)) : w.orLeave(w.min(m), what(backup)));
  }
  return parts.join(' ');
}
