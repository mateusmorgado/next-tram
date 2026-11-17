import { $, esc } from '../dom.ts';
import { getAssistants, termsText } from './assistant-guides.ts';
import { art } from './guide-art.ts';
import { scheduleSync, state } from '../store.ts';
import { getLang, t } from '../../i18n/index.ts';
import { APP_URL, pushRoutes } from '../../sync/favorites-sync.ts';

// ───────────────────────── Assistants ─────────────────────────

export const logo = (key: string): string => `<img class="ai-logo" src="icons/assistants/${key}.svg" alt="" width="48" height="48">`;
export const copyBox = (value: string, label: string, shown = value): string =>
  `<span class="ai-copy"><code>${esc(shown)}</code><button type="button" class="btn ai-copy-btn" data-copy="${esc(value)}">${esc(label)}</button></span>`;

/** The links and texts the guides offer for copying. */
export function assistantCopies(): Record<string, string> {
  const code = state.syncCode;
  return {
    mcp: copyBox(`${APP_URL}/api/mcp/${code}`, t('ai.copy')),
    alexaPin: `<span class="ai-copy ai-pin"><input id="alexaPin" inputmode="numeric" autocomplete="one-time-code" maxlength="2" placeholder="42" aria-label="${esc(t('ai.pinAria'))}">
      <button type="button" class="btn btn-primary ai-copy-btn" data-alexa-link>${esc(t('ai.connect'))}</button></span><span class="ai-pin-msg" id="alexaPinMsg" role="status"></span>`,
    siri: copyBox(`${APP_URL}/api/say?code=${code}&lang=${getLang()}`, t('ai.copy')),
    siriBack: copyBox(`${APP_URL}/api/say?code=${code}&back=1&lang=${getLang()}`, t('ai.copy')),
  };
}

export const firstName = () => {
  const first = state.routes[0];
  return first?.label || first?.dest?.name || t('ai.firstFallback');
};

/** Fills [[term:key|words]], [[copy:key]] and [[first]] in guide text. */
export function fillGuide(html: string, copies: Record<string, string>): string {
  return html
    .replace(/\[\[term:(\w+)\|([^\]]+)\]\]/g, (_, k: string, words: string) =>
      `<button type="button" class="term" data-term="${k}" aria-expanded="false">${words}<span class="term-i" aria-hidden="true">i</span></button>`)
    .replace(/\[\[copy:(\w+)\]\]/g, (_, k: string) => copies[k] || '')
    .replace(/\[\[first\]\]/g, `<b>${esc(firstName())}</b>`);
}

export function openAssistants(): void {
  scheduleSync();
  showAssistantPicker();
  $<HTMLDialogElement>('aiInfo').showModal();
}

export function showAssistantPicker(): void {
  $('aiBody').classList.remove('wizard');
  $('aiBody').innerHTML = `
    <h2 id="aiInfoTitle" class="ai-title">${esc(t('ai.title'))}</h2>
    <p class="ai-lead">${t('ai.lead', { ask: esc(t('voice.ask')) })}</p>
    <ul class="ai-grid">${getAssistants().map(
      (a) => `<li><button type="button" class="ai-tile" data-assistant="${a.key}">${logo(a.key)}<b>${esc(a.name)}</b><span>${esc(a.where)}</span></button></li>`,
    ).join('')}</ul>
    <div class="ai-note">${fillGuide(t('ai.note'), {})}<div class="explain" hidden></div></div>`;
}

/**
 * One step of an assistant's guide, as a wizard screen: picture, title, one or two sentences,
 * at most one thing to tap or type, an optional folded tip, and Back / Next.
 */
export function showAssistantGuide(key: string, index = 0): void {
  const a = getAssistants().find((x) => x.key === key);
  if (!a) return showAssistantPicker();
  const total = a.steps.length;
  const i = Math.max(0, Math.min(index, total - 1));
  const st = a.steps[i];
  const copies = assistantCopies();
  const last = i === total - 1;
  $('aiBody').innerHTML = `
    <div class="ai-guide-head">
      <button type="button" class="icon-btn ai-back" data-assistant-back aria-label="${esc(t('ai.all'))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      ${logo(a.key)}<b class="ai-guide-name">${esc(a.name)}</b>
    </div>
    <div class="ai-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${i + 1}" aria-label="${esc(t('ai.stepOf', { n: i + 1, total }))}">
      ${a.steps.map((_, n) => `<span class="${n < i ? 'done' : n === i ? 'now' : ''}"></span>`).join('')}
    </div>
    <div class="ai-step" data-step="${i}">
      <div class="ai-art">${art(st.art)}</div>
      <span class="ai-step-no">${esc(t('ai.stepOf', { n: i + 1, total }))}</span>
      <h2 id="aiInfoTitle" class="ai-title">${esc(st.title)}</h2>
      <p class="ai-text">${fillGuide(st.text, copies)}</p>
      <div class="explain" hidden></div>
      ${st.action ? `<div class="ai-action">${fillGuide(st.action, copies)}</div>` : ''}
      ${i === 0 && a.needs ? `<p class="ai-needs">${esc(t('ai.needs', { needs: a.needs, time: a.time }))}</p>` : ''}
      ${st.tip ? `<details class="ai-tip"><summary>${esc(st.tipLabel || t('ai.notWorking'))}</summary><div>${fillGuide(st.tip, copies)}<div class="explain" hidden></div></div></details>` : ''}
    </div>
    <div class="ai-nav">
      ${i > 0 ? `<button type="button" class="btn ai-prev" data-step-go="${i - 1}">${esc(t('ai.back'))}</button>` : '<span></span>'}
      ${last
        ? `<button type="submit" class="btn btn-primary ai-next" value="ok">${esc(t('ai.done'))}</button>`
        : `<button type="button" class="btn btn-primary ai-next" data-step-go="${i + 1}">${esc(t('ai.next'))}</button>`}
    </div>`;
  $('aiBody').dataset.guide = a.key;
  $('aiBody').classList.add('wizard');
  const body = $('aiBody');
  const step = body.querySelector<HTMLElement>('.ai-step');
  if (step) step.scrollTop = 0;
  body.querySelector<HTMLElement>('.ai-next')?.focus({ preventScroll: true });
}

/** Shows or hides a word's explanation right under the step (or tip) it is in. */
export function toggleTerm(btn: HTMLElement): void {
  const scope = btn.closest('.ai-tip > div, li, .ai-note, .ai-step');
  const box = scope?.querySelector<HTMLElement>(':scope > .explain');
  if (!scope || !box) return;
  const term = termsText(btn.dataset.term ?? '');
  const open = btn.getAttribute('aria-expanded') === 'true';
  scope.querySelectorAll('.term').forEach((b: Element) => b.setAttribute('aria-expanded', 'false'));
  if (open || !term) {
    box.hidden = true;
    return;
  }
  btn.setAttribute('aria-expanded', 'true');
  box.innerHTML = `<b>${esc(term.title)}</b><span>${esc(term.text)}</span>`;
  box.hidden = false;
}

/** Sends the number Alexa said, so the Alexa skill answers with these favorites from now on. */
export async function linkAlexa(): Promise<void> {
  const msg = $('alexaPinMsg');
  const pin = ((document.getElementById('alexaPin') as HTMLInputElement | null)?.value || '').replace(/\D/g, '');
  if (pin.length !== 2) {
    msg.textContent = t('ai.pinNeed');
    return;
  }
  msg.textContent = t('ai.pinWorking');
  try {
    await pushRoutes(state.syncCode, state.routes);
    const res = await fetch('/api/alexa-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, code: state.syncCode }),
    });
    msg.textContent = res.ok ? t('ai.pinOk') : t('ai.pinFail');
  } catch {
    msg.textContent = t('ai.pinOffline');
  }
}

export async function copyFromButton(b: HTMLElement): Promise<void> {
  const label = b.dataset.label || (b.dataset.label = b.textContent ?? '');
  try {
    const text = b.dataset.copyFile ? await (await fetch(b.dataset.copyFile, { cache: 'no-cache' })).text() : b.dataset.copy;
    await navigator.clipboard.writeText(text ?? '');
    b.textContent = t('ai.copied');
  } catch {
    b.textContent = t('ai.copyFailed');
  }
  setTimeout(() => (b.textContent = label), 2500);
}
