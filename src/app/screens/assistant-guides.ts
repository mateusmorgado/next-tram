/**
 * The "Add NextTram to your assistant" guides shown behind the AI button.
 *
 * Each guide is a short wizard: one screen per step, with a picture (lib/guide-art.js), a title,
 * one or two sentences, and at most one thing to tap, copy or type. `tip` is extra help that stays
 * folded under `tipLabel` until tapped. Keep it uncluttered: if a step needs a third sentence, it is two steps.
 *
 * This file holds the structure (which picture, which link, which thing to copy). All the words live
 * in lib/i18n/{en,de,pt}.js under guides.*, one entry per step in the same order.
 *
 * Text is HTML with these placeholders, filled in by app.js:
 *   [[term:key|shown words]]  a word with a small (i); tapping it shows the term's explanation
 *   [[copy:key]]              a box with something to copy (the user's link, the Alexa voice model, …)
 *   {askQ}, {siri}, …         the phrase to say, from voice.* in the language files
 * Keep the language plain: short sentences, exact button names in bold.
 */
import { t, tx } from '../../i18n/index.ts';

const go = (href: string, label: string) => `<a class="btn btn-primary ai-go" href="${href}" target="_blank" rel="noopener">${label}</a>`;

/** Per assistant and step: the picture, and a link button (href) or a thing to copy (action). */
interface StepStructure {
  art: string;
  /** A button that opens this link. */
  href?: string;
  /** A placeholder for something to copy or type, e.g. [[copy:mcp]]. */
  action?: string;
}

interface GuideStructure {
  key: string;
  name: string;
  steps: StepStructure[];
}

/** The words of one guide step (src/i18n/*.ts, guides.assistants.<key>.steps[i]). */
interface StepWords {
  title: string;
  text: string;
  go?: string;
  tipLabel?: string;
  tip?: string;
}

interface GuideWords {
  where: string;
  time: string;
  needs: string;
  steps: StepWords[];
}

const STRUCTURE: GuideStructure[] = [
  { key: 'claude', name: 'Claude', steps: [
    { art: 'browser', href: 'https://claude.ai' },
    { art: 'add' },
    { art: 'paste', action: '[[copy:mcp]]' },
    { art: 'done' },
    { art: 'chat' },
  ] },
  { key: 'chatgpt', name: 'ChatGPT', steps: [
    { art: 'browser', href: 'https://chatgpt.com/#settings/Connectors' },
    { art: 'toggle' },
    { art: 'paste', action: '[[copy:mcp]]' },
    { art: 'done' },
    { art: 'chat' },
  ] },
  { key: 'gemini', name: 'Gemini', steps: [{ art: 'install' }, { art: 'first' }, { art: 'speak' }] },
  { key: 'siri', name: 'Siri', steps: [
    { art: 'paste', action: '[[copy:siri]]' },
    { art: 'add' },
    { art: 'shortcut' },
    { art: 'speaker' },
    { art: 'done' },
    { art: 'speak' },
  ] },
  { key: 'alexa', name: 'Alexa', steps: [
    { art: 'toggle', href: 'https://www.amazon.de/dp/B0HQ7KN3S1/' },
    { art: 'speak' },
    { art: 'number', action: '[[copy:alexaPin]]' },
    { art: 'speak' },
  ] },
];

/** Replaces {askQ}, {siri}, … with the phrases of the current language (voice.* keys). */
export const fillVoice = (s: unknown): string => String(s).replace(/\{(\w+)\}/g, (m, k: string) => (tx(`voice.${k}`) ? t(`voice.${k}`) : m));

export const termsText = (key: string): { title: string; text: string } | null => {
  const v = tx(`guides.terms.${key}`) as { title: string; text: string } | undefined;
  return v ? { title: fillVoice(v.title), text: fillVoice(v.text) } : null;
};

/** The guides in the current language, ready to show. */
export function getAssistants() {
  return STRUCTURE.map((a) => {
    const words = tx(`guides.assistants.${a.key}`) as GuideWords;
    return {
      key: a.key,
      name: a.name,
      where: words.where,
      time: words.time,
      needs: words.needs,
      steps: a.steps.map((s, i) => {
        const w = words.steps[i];
        return {
          art: s.art,
          title: fillVoice(w.title),
          text: fillVoice(w.text),
          action: s.href ? go(s.href, w.go ?? '') : s.action,
          tipLabel: w.tipLabel,
          tip: w.tip ? fillVoice(w.tip) : undefined,
        };
      }),
    };
  });
}
