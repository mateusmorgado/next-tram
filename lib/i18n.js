/**
 * Tiny translation layer (no dependencies). English is always loaded and is the fallback;
 * German and Brazilian Portuguese load on demand from lib/i18n/.
 *
 *   t('leaveIn', { n: 4 })        → "Leave in 4 min"
 *   tn('minutes', 3)              → "3 minutes"   (uses minutes.one / minutes.other)
 *   tx('guides.assistants')       → the raw object, for the guides
 *
 * The language is the saved choice, otherwise the browser's, otherwise English.
 */
import en from './i18n/en.js';

export const LANGS = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'de', name: 'Deutsch', short: 'DE' },
  { code: 'pt', name: 'Português', short: 'PT' },
];
export const LANG_KEY = 'nexttram:lang';
/** BCP 47 tag for Intl and the <html lang> attribute. */
const TAGS = { en: 'en', de: 'de', pt: 'pt-BR' };

const LOADERS = {
  de: () => import('./i18n/de.js'),
  pt: () => import('./i18n/pt.js'),
};

let lang = 'en';
let dict = en;
let plurals = new Intl.PluralRules('en');

/** 'de', 'pt' or 'en' from a saved value and the browser's language list. */
export function detectLang(saved, browser = []) {
  if (LANGS.some((l) => l.code === saved)) return saved;
  for (const tag of browser) {
    const base = String(tag || '').toLowerCase().slice(0, 2);
    if (LANGS.some((l) => l.code === base)) return base;
  }
  return 'en';
}

export function savedLang() {
  try {
    return localStorage.getItem(LANG_KEY) || '';
  } catch {
    return '';
  }
}

/** Switch language. Pass remember=true when the person chose it (it then stops following the browser). */
export async function setLang(code, remember = false) {
  const next = LANGS.some((l) => l.code === code) ? code : 'en';
  try {
    dict = next === 'en' ? en : (await LOADERS[next]()).default;
    lang = next;
  } catch {
    dict = en; // offline before that language was ever cached
    lang = 'en';
  }
  plurals = new Intl.PluralRules(TAGS[lang]);
  if (typeof document !== 'undefined') document.documentElement.lang = TAGS[lang];
  if (remember) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  }
  return lang;
}

export const getLang = () => lang;
export const langTag = () => TAGS[lang];

/** Keys are flat ('guides.terms') with objects below them; look up the longest flat key first, then dig. */
function dig(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const parts = key.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const head = parts.slice(0, i).join('.');
    if (head in obj) return dig(obj[head], parts.slice(i).join('.'));
  }
  return undefined;
}
const fill = (s, params) => s.replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? params[k] : m));

/** The raw entry (string, array or object), falling back to English. */
export const tx = (key) => dig(dict, key) ?? dig(en, key);

export function t(key, params) {
  const v = tx(key);
  return typeof v === 'string' ? fill(v, params) : key;
}

/** Plural by count: key.one / key.other (with {n}). */
export function tn(key, n, params) {
  const form = plurals.select(n) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}`, { n, ...params });
}

/** Fill every [data-i18n*] element in the page. */
export function applyStaticText(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  // data-i18n-attr="aria-label:key;title:key2"
  root.querySelectorAll('[data-i18n-attr]').forEach((el) =>
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }),
  );
}
