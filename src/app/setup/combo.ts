import type { Stop } from '../../transit/index.ts';
import { client } from '../config.ts';
import { $, closest, esc } from '../dom.ts';
import { form } from './form.ts';
import { t } from '../../i18n/index.ts';

/** Autocomplete for one stop input. */
export function setupCombo(inputId: string, onPick: (stop: Stop) => void): void {
  const input = $<HTMLInputElement>(inputId);
  const list = input.parentElement?.querySelector<HTMLElement>('.suggestions');
  if (!list) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let items: Stop[] = [];
  let active = -1;
  let seq = 0;

  // An X to empty the field in one tap (shown by CSS only while there's text).
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clear-btn';
  clear.setAttribute('aria-label', t('setup.clear'));
  clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  clear.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keyboard open
  clear.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  input.after(clear);

  const close = () => {
    list.hidden = true;
    active = -1;
  };
  const show = (html: string) => {
    list.innerHTML = html;
    list.hidden = false;
  };
  const choose = (i: number) => {
    const s = items[i];
    if (!s) return;
    input.value = s.name;
    onPick(s);
    close();
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const my = ++seq; // any answer to an older keystroke is ignored from here on
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      items = []; // nothing to pick while "Searching…" is showing
      show(`<li class="muted">${esc(t('setup.searching'))}</li>`);
      let found: Stop[] = [];
      try {
        found = await client.searchStops(form.draft.city, q);
      } catch {}
      if (my !== seq) return;
      items = found;
      if (!items.length) return show(`<li class="muted">${esc(t('setup.noStops'))}</li>`);
      active = -1;
      show(items.map((s, i) => `<li role="option" data-i="${i}" aria-selected="false">${esc(s.name)}</li>`).join(''));
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active >= 0 ? active : 0);
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', (e) => {
    const li = closest<HTMLElement>(e, 'li[data-i]');
    if (li) {
      e.preventDefault();
      choose(Number(li.dataset.i));
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}
