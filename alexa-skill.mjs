/**
 * NextTram Alexa skill — AWS Lambda handler (Node.js 18+ runtime, no dependencies).
 *
 * "Alexa, ask next tram when is the next tram."
 * "Alexa, frag nächste Bahn wann kommt die nächste Bahn."
 * "Alexa, ask next tram to connect my stops." → a 6-digit number to type into the app,
 * after which Alexa answers for that user's first favorite.
 *
 * The public skill runs on Vercel: https://app.nexttram.morgado.tech/api/alexa (api/alexa.js
 * verifies Amazon's signature and runs this same handler). See docs/alexa-skill.md.
 *
 * Or deploy it yourself: zip `alexa-skill.mjs` together with the `lib/` folder, upload it to a Lambda
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

const envOptions = () => ({ code: process.env.NEXT_TRAM_CODE, defaultRoute: process.env.NEXT_TRAM_ROUTE });

async function pickRoute(slotValue, { code, defaultRoute, loadFavorites = (c) => fetchRoutes(c) } = {}) {
  const own = code ? await loadFavorites(code).catch(() => null) : null;
  const routes = own || DEFAULT_ROUTES;
  const wanted = String(slotValue || defaultRoute || '').toLowerCase();
  return (
    routes.find((r) => r.id.toLowerCase() === wanted || (r.label || '').toLowerCase() === wanted || r.dest.name.toLowerCase() === wanted) ||
    routes[0]
  );
}

export async function nextTramSpeech({ locale = 'en-US', back = false, destination } = {}, options = envOptions()) {
  const lang = String(locale).startsWith('de') ? 'de' : 'en';
  const route = await pickRoute(destination, options);
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

/** A reply. endSession=false keeps the microphone open and needs a reprompt. */
function speak(text, { endSession = true, reprompt, ssml, card = text } = {}) {
  const response = {
    outputSpeech: ssml ? { type: 'SSML', ssml: `<speak>${ssml}</speak>` } : { type: 'PlainText', text },
    card: { type: 'Simple', title: 'NextTram', content: card },
    shouldEndSession: endSession,
  };
  if (!endSession) response.reprompt = { outputSpeech: { type: 'PlainText', text: reprompt || text } };
  return { version: '1.0', response };
}

function slotId(slot) {
  const match = slot?.resolutions?.resolutionsPerAuthority?.find((a) => a.status?.code === 'ER_SUCCESS_MATCH');
  return match?.values?.[0]?.value?.id || slot?.value;
}

const userIdOf = (event) => event?.context?.System?.user?.userId || event?.session?.user?.userId;

const TEXT = {
  en: {
    help: 'Ask: when is the next tram? Or: when is the next tram home? To use the stops from your NextTram app, say: connect my stops.',
    helpReprompt: 'What would you like to know?',
    fallback: 'Sorry, I can only tell you the next tram. Try: when is the next tram?',
    bye: 'Bye!',
    noLink: 'Connecting your stops is not available for this skill.',
    linkFailed: 'Sorry, I could not make a number right now. Please try again in a minute.',
    link: (pin) => ({
      ssml: `Your number is <say-as interpret-as="digits">${pin}</say-as>. <break time="400ms"/> Open the NextTram app, tap A.I., then Alexa, and type it in. <break time="400ms"/> Once more: <say-as interpret-as="digits">${pin}</say-as>. It works for ten minutes.`,
      card: `Your NextTram number: ${pin.slice(0, 3)} ${pin.slice(3)}\nOpen the NextTram app → AI → Alexa and type it in. It works for 10 minutes.`,
    }),
    forgotten: 'Done. I forgot your stops and use the built-in ones again.',
  },
  de: {
    help: 'Frag: wann kommt die nächste Bahn? Oder: wann komme ich nach Hause? Für die Haltestellen aus deiner NextTram App sag: verbinde meine Haltestellen.',
    helpReprompt: 'Was möchtest du wissen?',
    fallback: 'Das kann ich leider nicht. Frag zum Beispiel: wann kommt die nächste Bahn?',
    bye: 'Tschüss!',
    noLink: 'Das Verbinden deiner Haltestellen ist bei diesem Skill nicht verfügbar.',
    linkFailed: 'Entschuldigung, ich konnte gerade keine Nummer erstellen. Versuch es gleich noch einmal.',
    link: (pin) => ({
      ssml: `Deine Nummer ist <say-as interpret-as="digits">${pin}</say-as>. <break time="400ms"/> Öffne die NextTram App, tippe auf A.I., dann auf Alexa, und gib sie dort ein. <break time="400ms"/> Noch einmal: <say-as interpret-as="digits">${pin}</say-as>. Sie gilt zehn Minuten.`,
      card: `Deine NextTram Nummer: ${pin.slice(0, 3)} ${pin.slice(3)}\nÖffne die NextTram App → AI → Alexa und gib sie dort ein. Sie gilt 10 Minuten.`,
    }),
    forgotten: 'Erledigt. Ich habe deine Haltestellen vergessen und nehme wieder die eingebauten.',
  },
};

/**
 * The skill's answer to one Alexa request.
 * options: { code, defaultRoute, loadFavorites, pairing }
 *  - code: a personal code fixed for the whole skill (Lambda env or the ?code= link of a private skill)
 *  - pairing: { lookup(userId), start(userId), forget(userId) } links each Alexa user to their own code
 *    (api/alexa.js provides it; see "connect my stops").
 */
export async function handler(event, _context, options = envOptions()) {
  const req = event?.request || {};
  const locale = req.locale || 'en-US';
  const lang = locale.startsWith('de') ? 'de' : 'en';
  const t = TEXT[lang];
  const { pairing } = options;
  const userId = userIdOf(event);

  if (req.type === 'SessionEndedRequest' || req.type === 'System.ExceptionEncountered') return { version: '1.0', response: {} };

  const answer = async (extra = {}) => {
    const code = options.code || (pairing && userId ? await pairing.lookup(userId).catch(() => null) : null);
    return speak(await nextTramSpeech({ locale, ...extra }, { ...options, code: code || undefined }));
  };

  if (req.type === 'LaunchRequest') return answer();

  if (req.type === 'IntentRequest') {
    const name = req.intent?.name;
    const dest = slotId(req.intent?.slots?.destination);
    switch (name) {
      case 'NextTramIntent':
        return answer({ destination: dest });
      case 'TripBackIntent':
        return answer({ back: true, destination: dest });
      case 'LinkIntent': {
        if (!pairing || !userId) return speak(t.noLink);
        const pin = await pairing.start(userId).catch(() => null);
        if (!pin) return speak(t.linkFailed);
        const { ssml, card } = t.link(pin);
        return speak(card, { ssml, card });
      }
      case 'UnlinkIntent':
        if (!pairing || !userId) return speak(t.noLink);
        await pairing.forget(userId).catch(() => {});
        return speak(t.forgotten);
      case 'AMAZON.HelpIntent':
        return speak(t.help, { endSession: false, reprompt: t.helpReprompt });
      case 'AMAZON.FallbackIntent':
        return speak(t.fallback, { endSession: false, reprompt: t.helpReprompt });
      case 'AMAZON.StopIntent':
      case 'AMAZON.CancelIntent':
      case 'AMAZON.NavigateHomeIntent':
        return speak(t.bye);
    }
  }
  return speak(t.fallback, { endSession: false, reprompt: t.helpReprompt });
}

