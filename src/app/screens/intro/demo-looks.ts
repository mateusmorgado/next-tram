/** Screen 5: make it yours (the card's look settings). */
import { t } from '../../../i18n/index.ts';
import { miniHero, setAttr, setText, timeline } from './helpers.ts';
import type { DemoContext } from './helpers.ts';

const LOOKS = [
  { key: 'minutes', label: () => t('intro.demo.minutes') },
  { key: 'timer', label: () => t('intro.demo.countdown') },
  { key: 'line', label: () => t('intro.demo.lineNumber') },
  { key: 'theme', label: () => '' }, // filled in: the theme you are not using right now
  { key: 'watch', label: () => t('intro.demo.watch') },
];

export function mountLooks(stage: HTMLElement, ctx: DemoContext): () => void {
  const looks = LOOKS.map((l) => ({ ...l, label: l.key === 'theme' ? (ctx.dark ? t('intro.demo.light') : t('intro.demo.dark')) : l.label() }));
  stage.innerHTML = `
    <div class="in-looks" data-look="minutes">
      <div class="in-lookcard ${ctx.dark ? 'to-light' : 'to-dark'}">
        ${miniHero({ mark: '<span class="in-mark" data-mark aria-hidden="true">Ed</span>' })}
      </div>
      <ul class="in-chips">${looks.map((l) => `<li data-chip="${l.key}">${l.label}</li>`).join('')}</ul>
    </div>`;
  const root = stage.firstElementChild as HTMLElement;
  const num = root.querySelector('.in-num');
  const unit = root.querySelector('.in-unit');
  const mark = root.querySelector('[data-mark]');
  const chips = [...root.querySelectorAll('[data-chip]')];
  const EACH = 2.1;
  return timeline(
    EACH * looks.length,
    (t) => {
      const i = Math.min(looks.length - 1, Math.floor(t / EACH));
      const look = looks[i].key;
      setAttr(root, 'data-look', look);
      chips.forEach((c, k) => c.classList.toggle('on', k === i));
      const timer = look === 'timer';
      setText(num, timer ? `5:${String(42 - Math.floor(t - EACH)).padStart(2, '0')}` : '6');
      setText(unit, timer ? '' : 'min');
      setText(mark, look === 'line' ? '3' : 'Ed');
    },
    ctx.reduced,
    EACH * 2.5,
  );
}
