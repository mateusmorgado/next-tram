/** Connects the page's buttons and events to the app. Called once at start. */
import { wireAssistants } from './assistants.ts';
import { wireHome } from './home.ts';
import { wireSetup } from './setup.ts';

export function wire(): void {
  wireHome();
  wireAssistants();
  wireSetup();
}
