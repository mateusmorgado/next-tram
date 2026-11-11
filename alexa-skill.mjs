/**
 * NextTram Alexa skill — AWS Lambda handler (Node.js 18+ runtime, no dependencies).
 *
 * "Alexa, ask Next Tram when the next tram is."
 * "Alexa, frag Nächste Bahn, wann die nächste Bahn kommt."
 *
 * Deploy: zip `alexa-skill.mjs` together with the `lib/` folder, upload it to a Lambda
 * function, and set the handler to `alexa-skill.handler`. The voice model is in
 * alexa/interaction-model.en-US.json and alexa/interaction-model.de-DE.json.
 *
 * Optional env:
 *   NEXT_TRAM_CODE=<code from the app's AI screen>  answer for the user's own first favorite
 *   NEXT_TRAM_ROUTE=<route id>                      pick another default route
 */

import { DEFAULT_ROUTES } from './lib/stops.js';
import { fetchRoutes } from './lib/favorites-sync.js';
import { createTransitClient, fetchRoute, planTrips, describePlan, routeOptions } from './lib/transit.js';

const client = createTransitClient({ timeoutMs: 6000, userAgent: 'NextTram-Alexa/2.0 (+https://github.com/mateusmorgado/next-tram)' });

async function pickRoute(slotValue) {
  const own = process.env.NEXT_TRAM_CODE ? await fetchRoutes(process.env.NEXT_TRAM_CODE) : null;
  const routes = own || DEFAULT_ROUTES;
  const wanted = String(slotValue || process.env.NEXT_TRAM_ROUTE || '').toLowerCase();
  return (
    routes.find((r) => r.id.toLowerCase() === wanted || (r.label || '').toLowerCase() === wanted || r.dest.name.toLowerCase() === wanted) ||
    routes[0]
  );
}

export async function nextTramSpeech({ locale = 'en-US', back = false, destination } = {}) {
  const lang = String(locale).startsWith('de') ? 'de' : 'en';
  const route = await pickRoute(destination);
  try {
    const now = Date.now();
    const { connections } = await fetchRoute(client, route, { reversed: back });
    const plan = planTrips(connections, now, { slots: routeOptions(route, back).length });
    return describePlan(plan, now, { lang, reversed: back });
  } catch {
    return lang === 'de'
      ? 'Entschuldigung, ich konnte die Abfahrtszeiten gerade nicht abrufen.'
      : 'Sorry, I could not get live departures right now.';
  }
}

function speak(text, endSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      card: { type: 'Simple', title: 'NextTram', content: text },
      shouldEndSession: endSession,
    },
  };
}

function slotId(slot) {
  const match = slot?.resolutions?.resolutionsPerAuthority?.find((a) => a.status?.code === 'ER_SUCCESS_MATCH');
  return match?.values?.[0]?.value?.id || slot?.value;
}

export async function handler(event) {
  const req = event?.request || {};
  const locale = req.locale || 'en-US';
  const de = locale.startsWith('de');

  if (req.type === 'SessionEndedRequest') return { version: '1.0', response: {} };

  if (req.type === 'LaunchRequest') return speak(await nextTramSpeech({ locale }));

  if (req.type === 'IntentRequest') {
    const name = req.intent?.name;
    const slots = req.intent?.slots || {};
    const dest = slotId(slots.destination);
    if (name === 'NextTramIntent') {
      return speak(await nextTramSpeech({ locale, destination: dest }));
    }
    if (name === 'TripBackIntent') {
      return speak(await nextTramSpeech({ locale, back: true, destination: dest }));
    }
    if (name === 'AMAZON.HelpIntent') {
      return speak(
        de
          ? 'Frag mich einfach: wann kommt die nächste Bahn? Oder: wann komme ich nach Hause?'
          : 'Just ask: when is the next tram? Or: when is the next tram home?',
        false,
      );
    }
    if (name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent') return speak(de ? 'Tschüss!' : 'Bye!');
  }
  return speak(de ? 'Das habe ich nicht verstanden.' : "Sorry, I didn't get that.");
}
