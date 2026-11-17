import { $, esc } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { DELAY_BRACKETS, delayLabel } from '../../transit/index.ts';

export function delayChip(delayMin: unknown, size = ''): string {
  const d = delayLabel(delayMin);
  const label = t(`delay.${d.key}`);
  return `<span class="delay ${d.key} ${size}" role="button" tabindex="0" data-delay-info title="${esc(t('delay.what', { label }))}">${esc(label)}</span>`;
}

export function openDelayInfo(): void {
  $('delayInfoList').innerHTML =
    DELAY_BRACKETS.map((b) => `<li><span class="delay ${b.key}">${esc(t(`delay.${b.key}`))}</span><span>${esc(t(`delay.${b.key}.text`))}</span></li>`).join('') +
    `<li><span class="delay plan">${esc(t('hero.scheduled'))}</span><span>${esc(t('delay.scheduled.text'))}</span></li>`;
  $<HTMLDialogElement>('delayInfo').showModal();
}
