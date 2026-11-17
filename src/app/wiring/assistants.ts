/** Events of the "Add NextTram to your assistant" dialog. */
import { $, closest } from '../dom.ts';
import { copyFromButton, linkAlexa, openAssistants, showAssistantGuide, showAssistantPicker, toggleTerm } from '../screens/assistants.ts';

export function wireAssistants(): void {
  $('aiBtn').addEventListener('click', openAssistants);
  $('aiInfo').addEventListener('click', (e) => {
    const target = closest(e, '.term, [data-copy], [data-copy-file], [data-assistant], [data-assistant-back], [data-alexa-link], [data-step-go]');
    if (!target) return;
    if (target.classList.contains('term')) toggleTerm(target);
    else if (target.dataset.stepGo) showAssistantGuide($('aiBody').dataset.guide ?? '', Number(target.dataset.stepGo));
    else if (target.hasAttribute('data-alexa-link')) void linkAlexa();
    else if (target.dataset.assistant) showAssistantGuide(target.dataset.assistant);
    else if (target.hasAttribute('data-assistant-back')) showAssistantPicker();
    else void copyFromButton(target);
  });
  $('aiInfo').addEventListener('keydown', (e) => {
    // Enter in the number box connects instead of closing the dialog.
    if (e.key === 'Enter' && (e.target as HTMLElement).id === 'alexaPin') {
      e.preventDefault();
      void linkAlexa();
    }
  });
}
