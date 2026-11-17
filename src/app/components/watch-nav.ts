import type { Plan } from '../../transit/index.ts';
import { $ } from '../dom.ts';
import { isCatchable } from '../../transit/index.ts';

/** Watch: step through catchable departures without opening the list. */
export function watchNeighbours(plan: Plan, now: number) {
  const list = plan.upcoming.filter((c) => isCatchable(c, now));
  const hero = plan.hero;
  const i = hero ? list.findIndex((c) => c.id === hero.id) : -1;
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 ? list[i + 1] || null : null, index: i, total: list.length };
}

export function renderWatchNav(plan: Plan, now: number): void {
  const { prev, next, index, total } = watchNeighbours(plan, now);
  $('prevBtn').hidden = !prev;
  $('nextBtn').hidden = !next;
  $('watchPos').textContent = total > 1 && index >= 0 ? `${index + 1}/${total}` : '';
}
