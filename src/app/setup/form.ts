import { DEFAULT_MODE_FILTER } from '../../data/stops.ts';
import type { DraftRoute } from '../types.ts';

/** A blank route for the setup sheet; `city` is the one on screen. */
export function emptyDraft(city: DraftRoute['city'] = 'leipzig'): DraftRoute {
  return { id: '', label: '', city, stops: [{ stop: null, walk: 2 }], dest: null, modes: DEFAULT_MODE_FILTER };
}

/** The route being edited in the setup sheet. */
export const form = {
  draft: emptyDraft(),
  editingId: null as string | null,
  /** The "Stop 2" field only shows after "+ Add a second stop". */
  secondStop: false,
  /** The trip-back walk only shows after "+ Add a walk for the trip back". */
  backWalk: false,
};
