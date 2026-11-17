import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../src/i18n/en.ts';
import de from '../src/i18n/de.ts';
import pt from '../src/i18n/pt.ts';
import { detectLang } from '../src/i18n/index.ts';

const LANG = { en, de, pt };
const MODEL = { en: 'en-US', de: 'de-DE', pt: 'pt-BR' };

/** Every string in a dictionary, with the path that leads to it. */
function flatten(obj, path = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string') out[p] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'string' ? (out[`${p}[${i}]`] = x) : flatten(x, `${p}[${i}]`, out)));
    else flatten(v, p, out);
  }
  return out;
}
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}|\[\[[^\]]+\]\]/g)].map((m) => m[0]).sort();
const flat = Object.fromEntries(Object.entries(LANG).map(([k, d]) => [k, flatten(d)]));

for (const code of ['de', 'pt']) {
  test(`${code} has exactly the keys of en`, () => {
    assert.deepEqual(Object.keys(flat[code]).sort(), Object.keys(flat.en).sort());
  });

  test(`${code} keeps every {placeholder} and [[term]] of en`, () => {
    for (const [key, text] of Object.entries(flat.en)) {
      assert.deepEqual(placeholders(flat[code][key]).map((p) => p.replace(/\|.*\]\]/, ']]')), placeholders(text).map((p) => p.replace(/\|.*\]\]/, ']]')), key);
    }
  });

  test(`${code} has no empty text`, () => {
    for (const [key, text] of Object.entries(flat[code])) assert.ok(text.trim(), key);
  });
}

test('guide steps line up across the languages', () => {
  for (const code of ['de', 'pt']) {
    for (const [key, a] of Object.entries(en['guides.assistants'])) {
      assert.equal(LANG[code]['guides.assistants'][key].steps.length, a.steps.length, `${code} ${key}`);
    }
  }
});

test('every {voice} placeholder in the guides exists in voice.*', () => {
  for (const [code, d] of Object.entries(LANG)) {
    for (const [key, text] of Object.entries(flat[code])) {
      if (!key.startsWith('guides.')) continue;
      for (const m of text.matchAll(/\{(\w+)\}/g)) assert.ok(`voice.${m[1]}` in d, `${code} ${key} uses {${m[1]}}`);
    }
  }
});

const norm = (s) => s.toLowerCase().replace(/[?.,!“”„"]/g, '').replace(/\s+/g, ' ').trim();

// The phrases people are told to say must really be in the Alexa voice model of that language.
const model = (code) => {
  const lm = JSON.parse(readFileSync(new URL(`../alexa/interaction-model.${MODEL[code]}.json`, import.meta.url), 'utf8')).interactionModel.languageModel;
  return { invocation: lm.invocationName, samples: new Set(lm.intents.flatMap((i) => i.samples || []).map(norm)) };
};

for (const code of ['en', 'de', 'pt']) {
  test(`${code}: Alexa phrases use the real invocation name and sample utterances`, () => {
    const { invocation, samples } = model(code);
    const d = LANG[code];
    assert.equal(invocation, 'next tram');
    // "open next tram" style phrases name the skill; "ask next tram <sample>" phrases end in a real sample.
    for (const key of ['voice.alexaOpen', 'voice.alexaOpenShort']) assert.ok(norm(d[key]).endsWith(invocation), `${code} ${key}`);
    for (const key of ['voice.alexaAsk', 'voice.alexaHome', 'voice.alexaPair', 'voice.alexaNewCode']) {
      const said = norm(d[key]);
      const spoken = said.slice(said.indexOf(invocation) + invocation.length).trim();
      // Alexa also accepts the connecting word "to" ("ask next tram to pair").
      assert.ok(said.includes(invocation) && (samples.has(spoken) || samples.has(spoken.replace(/^to /, ''))), `${code} ${key}: "${spoken}" is not a sample utterance`);
    }
    // Routine / direct questions are plain sample utterances too.
    assert.ok(samples.has(norm(d['voice.ask'])), `${code} voice.ask`);
    assert.ok(samples.has(norm(d['voice.alexaRoutine']).replace(/^alexa /, '')), `${code} voice.alexaRoutine`);
  });
}

test('language is picked from the saved choice, then the browser', () => {
  assert.equal(detectLang('', ['de-DE', 'en']), 'de');
  assert.equal(detectLang('', ['pt-BR']), 'pt');
  assert.equal(detectLang('', ['fr-FR', 'pt-PT', 'de']), 'pt');
  assert.equal(detectLang('', ['fr-FR']), 'en');
  assert.equal(detectLang('', []), 'en');
  assert.equal(detectLang('en', ['de-DE']), 'en'); // an explicit choice wins
  assert.equal(detectLang('xx', ['de-DE']), 'de'); // junk is ignored
});
