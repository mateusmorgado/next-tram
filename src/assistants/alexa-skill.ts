/**
 * NextTram Alexa skill — AWS Lambda handler (Node.js 18+ runtime, no dependencies).
 *
 * "Alexa, ask next tram when is the next tram."
 * "Alexa, frag next tram wann kommt die nächste Bahn."
 * "Alexa, open next tram." → before pairing: a 2-digit number to type into the app,
 * after which Alexa answers for that user's first favorite. ("Alexa, ask next tram to pair" works too.)
 *
 * The public skill runs on Vercel: https://app.nexttram.morgado.tech/api/alexa (api/alexa.ts
 * verifies Amazon's signature and runs this same handler). See docs/alexa-skill.md.
 *
 * Or deploy it yourself: bundle this file with its imports from `src/` (for example with esbuild), upload it to a Lambda
 * function, and set the handler to `alexa-skill.handler`. The voice model is in
 * alexa/interaction-model.*.json (en-US, en-GB, de-DE, pt-BR).
 *
 * Optional env:
 *   NEXT_TRAM_CODE=<code from the app's AI screen>  answer for the user's own first favorite
 *   NEXT_TRAM_ROUTE=<route id>                      pick another default route
 */

import type { Lang, Route } from '../transit/types.ts';
import { DEFAULT_ROUTES } from '../data/stops.ts';
import { fetchRoutes } from '../sync/favorites-sync.ts';
import { createTransitClient, fetchRoute, planTrips, describePlan, routeOptions } from '../transit/index.ts';

const client = createTransitClient({ timeoutMs: 6000, userAgent: 'NextTram-Alexa/2.0 (+https://github.com/mateusmorgado/next-tram)' });

/** How the skill finds its routes. */
export interface SkillOptions {
  /** A personal code fixed for the whole skill (Lambda env or the ?code= link of a private skill). */
  code?: string;
  defaultRoute?: string;
  loadFavorites?: (code: string) => Promise<Route[] | null>;
  /** Links each Alexa user to their own code (api/alexa.ts provides it). */
  pairing?: Pairing;
}

export interface Pairing {
  lookup(userId: string): Promise<string | null>;
  start(userId: string): Promise<string | null>;
  forget(userId: string): Promise<void>;
}

const envOptions = (): SkillOptions => ({ code: process.env.NEXT_TRAM_CODE, defaultRoute: process.env.NEXT_TRAM_ROUTE });

async function pickRoute(slotValue: string | undefined, { code, defaultRoute, loadFavorites = (c) => fetchRoutes(c) }: SkillOptions = {}): Promise<Route> {
  const own = code ? await loadFavorites(code).catch(() => null) : null;
  const routes = own || DEFAULT_ROUTES;
  const wanted = String(slotValue || defaultRoute || '').toLowerCase();
  return (
    routes.find((r) => r.id.toLowerCase() === wanted || (r.label || '').toLowerCase() === wanted || r.dest.name.toLowerCase() === wanted) ||
    routes[0]
  );
}

/** 'de', 'pt' or 'en' from an Alexa locale such as de-DE, pt-BR or en-GB. */
export const langOf = (locale?: string | null): Lang => {
  const l = String(locale || '').toLowerCase();
  return l.startsWith('de') ? 'de' : l.startsWith('pt') ? 'pt' : 'en';
};

const SORRY: Record<Lang, string> = {
  en: 'Sorry, I could not get live departures right now.',
  de: 'Entschuldigung, ich konnte die Abfahrtszeiten gerade nicht abrufen.',
  pt: 'Desculpe, não consegui buscar os horários agora.',
};

export async function nextTramSpeech(
  { locale = 'en-US', back = false, destination }: { locale?: string; back?: boolean; destination?: string } = {},
  options: SkillOptions = envOptions(),
): Promise<string> {
  const lang = langOf(locale);
  const route = await pickRoute(destination, options);
  try {
    const now = Date.now();
    const { connections } = await fetchRoute(client, route, { reversed: back });
    const plan = planTrips(connections, now, { slots: routeOptions(route, back).length, byArrival: back });
    return describePlan(plan, now, { lang, reversed: back });
  } catch {
    return SORRY[lang];
  }
}

/** A reply. endSession=false keeps the microphone open and needs a reprompt. */
interface SpeakOptions {
  endSession?: boolean;
  reprompt?: string;
  ssml?: string;
  card?: string;
}

interface AlexaResponse {
  outputSpeech?: { type: 'SSML'; ssml: string } | { type: 'PlainText'; text: string };
  card?: { type: 'Simple'; title: string; content: string };
  shouldEndSession?: boolean;
  reprompt?: { outputSpeech: { type: 'PlainText'; text: string } };
}

export interface AlexaReply {
  version: '1.0';
  response: AlexaResponse;
}

function speak(text: string, { endSession = true, reprompt, ssml, card = text }: SpeakOptions = {}): AlexaReply {
  const response: AlexaResponse = {
    outputSpeech: ssml ? { type: 'SSML', ssml: `<speak>${ssml}</speak>` } : { type: 'PlainText', text },
    card: { type: 'Simple', title: 'NextTram', content: card },
    shouldEndSession: endSession,
  };
  if (!endSession) response.reprompt = { outputSpeech: { type: 'PlainText', text: reprompt || text } };
  return { version: '1.0', response };
}

interface AlexaSlot {
  value?: string;
  resolutions?: { resolutionsPerAuthority?: { status?: { code?: string }; values?: { value?: { id?: string } }[] }[] };
}

/** The id of the matched slot value, else what was said. */
function slotId(slot?: AlexaSlot): string | undefined {
  const match = slot?.resolutions?.resolutionsPerAuthority?.find((a) => a.status?.code === 'ER_SUCCESS_MATCH');
  return match?.values?.[0]?.value?.id || slot?.value;
}

/** The part of an Alexa request the skill reads. */
export interface AlexaEvent {
  request?: { type?: string; locale?: string; intent?: { name?: string; slots?: { destination?: AlexaSlot } } };
  context?: { System?: { user?: { userId?: string } } };
  session?: { user?: { userId?: string } };
}

const userIdOf = (event?: AlexaEvent): string | undefined => event?.context?.System?.user?.userId || event?.session?.user?.userId;

interface Texts {
  help: string;
  helpReprompt: string;
  fallback: string;
  bye: string;
  noLink: string;
  linkFailed: string;
  link: (pin: string) => { ssml: string; card: string };
  forgotten: string;
  welcome: (pin: string) => { ssml: string; card: string };
}

const TEXT: Record<Lang, Texts> = {
  en: {
    help: 'Ask: when is the next tram? Or: when is the next tram home? To use the stops from your NextTram app, say: pair.',
    helpReprompt: 'What would you like to know?',
    fallback: 'Sorry, I can only tell you the next tram. Try: when is the next tram?',
    bye: 'Bye!',
    noLink: 'Connecting your stops is not available for this skill.',
    linkFailed: 'Sorry, I could not make a number right now. Please try again in a minute.',
    link: (pin: string) => ({
      ssml: `Your number is <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Open the NextTram app, tap A.I., then Alexa, and type it in. <break time="400ms"/> Once more: <say-as interpret-as="cardinal">${pin}</say-as>. It works for five minutes.`,
      card: `Your NextTram number: ${pin}\nOpen the NextTram app → AI → Alexa and type it in. It works for 5 minutes.`,
    }),
    forgotten: 'Done. I forgot your stops and use the built-in ones again.',
    welcome: (pin: string) => ({
      ssml: `Welcome to NextTram. To use your own stops, your number is <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Open the NextTram app, tap A.I., then Alexa, and type it in. <break time="400ms"/> Once more: <say-as interpret-as="cardinal">${pin}</say-as>. It works for five minutes. After that, just say: Alexa, open next tram.`,
      card: `Your NextTram number: ${pin}\nOpen the NextTram app → AI → Alexa and type it in. It works for 5 minutes.\nAfter that, just say: “Alexa, open next tram”.`,
    }),
  },
  de: {
    help: 'Frag: wann kommt die nächste Bahn? Oder: wann komme ich nach Hause? Für die Haltestellen aus deiner NextTram App frag nach dem Code.',
    helpReprompt: 'Was möchtest du wissen?',
    fallback: 'Das kann ich leider nicht. Frag zum Beispiel: wann kommt die nächste Bahn?',
    bye: 'Tschüss!',
    noLink: 'Das Verbinden deiner Haltestellen ist bei diesem Skill nicht verfügbar.',
    linkFailed: 'Entschuldigung, ich konnte gerade keinen Code erstellen. Versuch es gleich noch einmal.',
    link: (pin: string) => ({
      ssml: `Dein Code ist <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Öffne die NextTram App, tippe auf A.I., dann auf Alexa, und gib ihn dort ein. <break time="400ms"/> Noch einmal: <say-as interpret-as="cardinal">${pin}</say-as>. Er gilt fünf Minuten.`,
      card: `Dein NextTram Code: ${pin}\nÖffne die NextTram App → AI → Alexa und gib ihn dort ein. Er gilt 5 Minuten.`,
    }),
    forgotten: 'Erledigt. Ich habe deine Haltestellen vergessen und nehme wieder die eingebauten.',
    welcome: (pin: string) => ({
      ssml: `Willkommen bei NextTram. Für deine eigenen Haltestellen ist dein Code <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Öffne die NextTram App, tippe auf A.I., dann auf Alexa, und gib ihn dort ein. <break time="400ms"/> Noch einmal: <say-as interpret-as="cardinal">${pin}</say-as>. Er gilt fünf Minuten. Danach sag einfach: Alexa, öffne next tram.`,
      card: `Dein NextTram Code: ${pin}\nÖffne die NextTram App → AI → Alexa und gib ihn dort ein. Er gilt 5 Minuten.\nDanach sag einfach: „Alexa, öffne next tram“.`,
    }),
  },
  pt: {
    help: 'Pergunte: quando sai o próximo bonde? Ou: quando sai o próximo bonde para casa? Para usar as paradas do seu app NextTram, diga: código.',
    helpReprompt: 'O que você quer saber?',
    fallback: 'Desculpe, eu só sei dizer o próximo bonde. Tente: quando sai o próximo bonde?',
    bye: 'Tchau!',
    noLink: 'Conectar suas paradas não está disponível nesta skill.',
    linkFailed: 'Desculpe, não consegui criar um número agora. Tente de novo em um minuto.',
    link: (pin: string) => ({
      ssml: `Seu número é <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Abra o app NextTram, toque em A.I., depois em Alexa, e digite o número. <break time="400ms"/> Mais uma vez: <say-as interpret-as="cardinal">${pin}</say-as>. Ele vale por cinco minutos.`,
      card: `Seu número NextTram: ${pin}\nAbra o app NextTram → AI → Alexa e digite o número. Ele vale por 5 minutos.`,
    }),
    forgotten: 'Pronto. Esqueci suas paradas e voltei a usar as paradas de exemplo.',
    welcome: (pin: string) => ({
      ssml: `Bem-vindo ao NextTram. Para usar suas próprias paradas, seu número é <say-as interpret-as="cardinal">${pin}</say-as>. <break time="400ms"/> Abra o app NextTram, toque em A.I., depois em Alexa, e digite o número. <break time="400ms"/> Mais uma vez: <say-as interpret-as="cardinal">${pin}</say-as>. Ele vale por cinco minutos. Depois disso, é só dizer: Alexa, abrir next tram.`,
      card: `Seu número NextTram: ${pin}\nAbra o app NextTram → AI → Alexa e digite o número. Ele vale por 5 minutos.\nDepois disso, é só dizer: “Alexa, abrir next tram”.`,
    }),
  },
};

/**
 * The skill's answer to one Alexa request.
 * options: { code, defaultRoute, loadFavorites, pairing }
 *  - code: a personal code fixed for the whole skill (Lambda env or the ?code= link of a private skill)
 *  - pairing: { lookup(userId), start(userId), forget(userId) } links each Alexa user to their own code
 *    (api/alexa.ts provides it; see "pair").
 */
export async function handler(event: AlexaEvent | undefined, _context?: unknown, options: SkillOptions = envOptions()): Promise<AlexaReply> {
  const req = event?.request || {};
  const locale = req.locale || 'en-US';
  const t = TEXT[langOf(locale)];
  const { pairing } = options;
  const userId = userIdOf(event);

  if (req.type === 'SessionEndedRequest' || req.type === 'System.ExceptionEncountered') return { version: '1.0', response: {} };

  // undefined = not looked up yet, null = this Alexa user is not paired (or the lookup failed)
  let linked: string | null | undefined;
  const linkedCode = async (): Promise<string | null> => {
    if (linked === undefined) linked = options.code || (pairing && userId ? await pairing.lookup(userId).catch(() => null) : null);
    return linked ?? null;
  };
  const answer = async (extra: { back?: boolean; destination?: string } = {}) => {
    const code = await linkedCode();
    return speak(await nextTramSpeech({ locale, ...extra }, { ...options, code: code || undefined }));
  };

  // "Alexa, open next tram". Not paired yet → the pairing number right away, so nobody has to find
  // the exact pairing phrase (Alexa often sent "ask next tram to pair" to its own transit feature).
  // Paired → the next tram.
  if (req.type === 'LaunchRequest') {
    if (pairing && userId && !(await linkedCode())) {
      const pin = await pairing.start(userId).catch(() => null);
      if (pin) {
        const { ssml, card } = t.welcome(pin);
        return speak(card, { ssml, card });
      }
    }
    return answer();
  }

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

