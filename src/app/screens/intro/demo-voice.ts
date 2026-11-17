/** Screen 4: just ask your assistant. */
import { t } from '../../../i18n/index.ts';
import { ASSET, setAttr, setText, timeline } from './helpers.ts';
import type { DemoContext } from './helpers.ts';

const VOICES = [
  { key: 'alexa', ask: () => t('voice.alexaOpen') },
  { key: 'siri', ask: () => `${t('voice.siri')}?` },
  { key: 'gemini', ask: () => t('voice.google') },
  { key: 'claude', ask: () => t('voice.askQ') },
  { key: 'chatgpt', ask: () => t('voice.askQ') },
];

export function mountVoice(stage: HTMLElement, ctx: DemoContext): () => void {
  stage.innerHTML = `
    <div class="in-voice" data-phase="idle">
      <div class="in-chat">
        <p class="in-bubble me" data-ask></p>
        <p class="in-bubble them"><span class="in-eq" aria-hidden="true"><i></i><i></i><i></i></span>${t('voice.introAnswer')}</p>
      </div>
      <ul class="in-logos">
        ${VOICES.map((v) => `<li data-voice="${v.key}"><img src="${ASSET(`icons/assistants/${v.key}.svg`)}" alt="" width="40" height="40"></li>`).join('')}
      </ul>
    </div>`;
  const root = stage.firstElementChild as HTMLElement;
  const ask = root.querySelector('[data-ask]') as HTMLElement;
  const logos = [...root.querySelectorAll('[data-voice]')];
  let shown = -1;
  return timeline(
    5.6,
    (t, n) => {
      const i = n % VOICES.length;
      if (i !== shown) {
        shown = i;
        ask.textContent = `“${VOICES[i].ask()}”`;
        logos.forEach((li, k) => li.classList.toggle('on', k === i));
      }
      setAttr(root, 'data-phase', t < 0.35 ? 'idle' : t < 1.5 ? 'ask' : t < 5.1 ? 'answer' : 'out');
    },
    ctx.reduced,
    3,
  );
}
