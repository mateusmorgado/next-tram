/** Short, human-friendly forms of directions, delays and clock times. */
import { TIME_ZONE } from './constants.ts';
import { shortStopName } from './names.ts';
import type { Connection, DelayBracket, LeaveAdvice } from './types.ts';


/**
 * Short form of a tram's direction (Richtung), the way German departure boards shorten it.
 * Short names stay as they are. Longer ones lose the city prefix and get the usual short
 * forms (Hauptbahnhof → Hbf, Bahnhof → Bf, Straße → Str., Platz → Pl., Nord → N.); a
 * "District, Stop" name keeps the district; a double name keeps its first part and the
 * initial of the rest. "Böhlitz-Ehrenberg" → "Böhlitz-E.", "S+U Hauptbahnhof" → "S+U Hbf".
 */
export function shortDirection(name: unknown, { soft = 12, hard = 16 } = {}): string {
  let s = shortStopName(String(name || '')).replace(/\s*\([^)]*\)\s*$/, '').trim();
  s = s.replace(/Hauptbahnhof/g, 'Hbf');
  if (s.length <= soft) return s;
  s = s
    .replace(/\bBahnhof\b/g, 'Bf')
    .replace(/stra(ß|ss)e\b/gi, (m) => (m[0] === 'S' ? 'Str.' : 'str.'))
    .replace(/(^|[\s-])Platz\b/g, '$1Pl.')
    .replace(/\b(Nord|Süd|Ost|West)\b/g, (m) => ({ Nord: 'N.', Süd: 'S.', Ost: 'O.', West: 'W.' } as Record<string, string>)[m]);
  if (s.length <= soft) return s;
  if (s.includes(',')) {
    // "Lützschena, Am Wasserturm" → "Lützschena", but "Schönefeld, Ost" → "Schönefeld O."
    const [head, tail = ''] = s.split(',').map((x) => x.trim());
    s = tail.length <= 3 ? `${head} ${tail}`.trim() : head;
  }
  if (s.includes('/')) s = s.split('/')[0].trim(); // "S Schöneweide/Sterndamm" → "S Schöneweide"
  if (s.length <= soft) return s;
  const hy = s.split('-');
  if (hy.length > 1 && hy[0].length >= 3) {
    s = [hy[0], ...hy.slice(1).map((w) => (w.length <= 3 || w.endsWith('.') ? w : `${w[0]}.`))].join('-');
  }
  if (s.length <= hard) return s;
  const cut = s.slice(0, hard + 1).replace(/[\s-]+\S*$/, '');
  return cut.length >= 6 && cut.length <= hard ? cut : `${s.slice(0, hard - 1)}.`;
}

/**
 * Delay as a word instead of minutes. Brackets: early ≥ 1 min ahead of schedule, on time,
 * late 1–3 min, +late 4–7 min, ++late 8 min or more.
 */
export const DELAY_BRACKETS: DelayBracket[] = [
  { key: 'early', label: 'early', text: 'Leaves 1 min or more before its timetable time. Be at the stop on time.' },
  { key: 'ontime', label: 'on time', text: 'Within a minute of the timetable.' },
  { key: 'late', label: 'late', max: 3, text: '1 to 3 minutes behind.' },
  { key: 'late2', label: '+late', max: 7, text: '4 to 7 minutes behind.' },
  { key: 'late3', label: '++late', text: '8 minutes or more behind.' },
];

export function delayLabel(delayMin: unknown): DelayBracket {
  const d = Math.round(Number(delayMin) || 0);
  const pick = (key: DelayBracket['key']) => DELAY_BRACKETS.find((b) => b.key === key) as DelayBracket;
  if (d <= -1) return pick('early');
  if (d < 1) return pick('ontime');
  if (d <= 3) return pick('late');
  if (d <= 7) return pick('late2');
  return pick('late3');
}

export function leaveAdvice(conn: Pick<Connection, 'depMs' | 'walk'>, now: number): LeaveAdvice {
  const secs = (conn.depMs - now) / 1000;
  const walkSecs = conn.walk * 60;
  if (conn.walk === 0) return { now: false, minutes: 0, atStop: true };
  if (secs <= walkSecs) return { now: true, minutes: 0, late: secs < walkSecs, run: secs < walkSecs };
  return { now: false, minutes: Math.floor((secs - walkSecs) / 60) };
}

const clockFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

export function formatClock(ms?: number | null): string {
  return ms == null ? '' : clockFormat.format(new Date(ms));
}
