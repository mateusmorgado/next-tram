// Links an Alexa user to a NextTram personal code, so the public skill answers for their first favorite.
// "Alexa, ask next tram to pair" → a 6-digit number (10 minutes) → typed into the app → linked.
// Only a SHA-256 hash of Amazon's user ID is stored, never the ID itself.
import { createHash, randomInt } from 'node:crypto';
import { isValidCode } from '../lib/favorites-sync.js';

const PIN_SECONDS = 10 * 60;
const LINK_SECONDS = 60 * 60 * 24 * 365;
export const PIN_RE = /^\d{6}$/;

const hash = (userId) => createHash('sha256').update(String(userId)).digest('hex');
const pinKey = (pin) => `alexa:pin:${pin}`;
const userKey = (h) => `alexa:user:${h}`;

export function createPairing(store) {
  if (!store) return null;
  return {
    /** The personal code linked to this Alexa user, or null. */
    async lookup(userId) {
      const code = await store.getKey(userKey(hash(userId)));
      return isValidCode(code) ? code : null;
    },
    /** A fresh 6-digit number that points at this Alexa user for 10 minutes. */
    async start(userId) {
      for (let i = 0; i < 5; i++) {
        const pin = String(randomInt(0, 1e6)).padStart(6, '0');
        if (await store.addKey(pinKey(pin), hash(userId), PIN_SECONDS)) return pin;
      }
      return null;
    },
    /** The app sends the number and its code. True when the number was valid (it works once). */
    async finish(pin, code) {
      if (!PIN_RE.test(pin) || !isValidCode(code)) return false;
      const h = await store.takeKey(pinKey(pin));
      if (!h) return false;
      await store.setKey(userKey(h), code, LINK_SECONDS);
      return true;
    },
    async forget(userId) {
      await store.delKey(userKey(hash(userId)));
    },
  };
}
