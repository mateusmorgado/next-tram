// Links an Alexa user to a NextTram personal code, so the public skill answers for their first favorite.
// "Alexa, ask next tram to pair" → a 2-digit number (5 minutes) → typed into the app → linked.
// Only a SHA-256 hash of Amazon's user ID is stored, never the ID itself.
import { createHash, randomInt } from 'node:crypto';
import { isValidCode } from '../lib/favorites-sync.js';

const PIN_SECONDS = 5 * 60;
const LINK_SECONDS = 60 * 60 * 24 * 365;
export const PIN_RE = /^[1-9]\d$/; // 10–99: short to say and type. A wrong guess only links someone else's stops to a stranger's Alexa for a moment, and the number works once.

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
    /** A fresh 2-digit number (10–99) that points at this Alexa user for 5 minutes. */
    async start(userId) {
      for (let i = 0; i < 30; i++) {
        const pin = String(randomInt(10, 100));
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
