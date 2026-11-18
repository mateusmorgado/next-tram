import type { CityKey, ModeFilter, Route, Stop } from '../transit/index.ts';

/** What the big faint mark in the hero card's corner shows. */
export type MarkKind = 'stop' | 'line' | 'none';
export type ThemeChoice = 'system' | 'light' | 'dark';

/** Everything the app saves in localStorage. */
export interface AppState {
  routes: Route[];
  activeId: string;
  theme: ThemeChoice;
  /** Watch layout on. */
  watch: boolean;
  mark: MarkKind;
  /** Spare seconds on top of every walk, for all routes. */
  buffer: number;
  /** Running for a tram is allowed (all routes). */
  run: boolean;
  /** Big clock on the card: live mm:ss countdown (default) or whole minutes. */
  clock: 'timer' | 'minutes';
  /** Version of the built-in routes the saved favorites were last updated to. */
  defaults: number;
  /** The personal code that favorites are synced under. */
  syncCode: string;
  /** JSON of the routes that were last synced successfully. */
  synced: string;
  installHidden: boolean;
  /** How often the app was opened, and when last (for the intro reminder). */
  opens: number;
  lastOpen: number;
  introShown: number;
}

/** A route while it is being edited: stops and destination may still be empty. */
export interface DraftRoute {
  id: string;
  label: string;
  city: CityKey;
  stops: { stop: Stop | null; walk: number }[];
  dest: Stop | null;
  modes?: ModeFilter;
  destWalk?: number;
  noRun?: boolean;
  buffer?: number;
}
