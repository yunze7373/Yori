/**
 * Ask Bar Component (V0 - LIVING_CONTEXT_V2.md §2)
 * Docked bottom bar on Home that opens the conversation shell.
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';

export function renderAskBar(): string {
  return `
    <aside class="ask-bar-dock" aria-label="Ask Yori Quick Access">
      <div class="ask-bar-container">
        <button type="button" class="ask-bar" id="ask-bar" aria-label="${escapeHtml(STRINGS.conversation.askBarAriaLabel)}">
          <svg class="ask-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="ask-bar-text">${escapeHtml(STRINGS.conversation.askBarPlaceholder)}</span>
          <span class="ask-bar-hint" aria-hidden="true">Tap to chat</span>
        </button>
      </div>
    </aside>
  `;
}

export function attachAskBarEvents(container: HTMLElement, onOpen: () => void): void {
  const askBarBtn = container.querySelector<HTMLButtonElement>('#ask-bar');
  if (askBarBtn) {
    askBarBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onOpen();
    });
  }
}
