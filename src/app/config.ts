import { createTransitClient } from '../transit/index.ts';
import type { MarkKind } from './types.ts';

export const STORAGE_KEY = 'nexttram:v1';
export const REFRESH_MS = 60_000;
/** Wait before retrying on its own after 1, 2, 3… failed loads in a row. */
export const RETRY_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
export const MAX_UPCOMING = 7;
/** Rows the Upcoming list shows while it is folded. */
export const FOLDED_UPCOMING = 3;
export const client = createTransitClient();
/** What the big faint mark in the card's corner shows: stop initials (Ed/TP), the line number, or nothing. */
export const MARKS: readonly MarkKind[] = ['stop', 'line', 'none'];
