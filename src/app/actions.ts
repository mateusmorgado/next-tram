/** Things the person can do that change what is shown. */
import { watchNeighbours } from './components/watch-nav.ts';
import { render } from './render.ts';
import { session } from './store.ts';

export function stepTrip(dir: 1 | -1): void {
  if (!session.lastPlan) return;
  const n = watchNeighbours(session.lastPlan, Date.now());
  const target = dir > 0 ? n.next : n.prev;
  if (!target) return;
  session.selectedId = target.id;
  render();
}
