/**
 * Ask Bar Component (V0 - LIVING_CONTEXT_V2.md §2)
 * Docked bottom bar on Home that opens the conversation shell.
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';

export function renderAskBar(): string {
  // UI-QUIET-PRECISION (owner reference 04): a floating bar with a sparkle, the prompt and a filled
  // forest-green action. It opens the conversation; it never implies voice (no mic until D10 ships).
  return `
    <aside class="ask-bar-dock qp-ask-dock" aria-label="Ask Yori Quick Access">
      <div class="ask-bar-container">
        <button type="button" class="ask-bar qp-ask-bar" id="ask-bar" aria-label="${escapeHtml(STRINGS.conversation.askBarAriaLabel)}">
          <svg class="ask-bar-icon qp-ask-sparkle" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3.5l1.9 5.1a2 2 0 0 0 1.2 1.2l5.1 1.9-5.1 1.9a2 2 0 0 0-1.2 1.2L12 20l-1.9-5.2a2 2 0 0 0-1.2-1.2L3.8 11.7l5.1-1.9a2 2 0 0 0 1.2-1.2z"/>
          </svg>
          <span class="ask-bar-text"><span class="v2-ask-desktop">${escapeHtml(STRINGS.conversation.askBarPlaceholder)}</span><span class="v2-ask-mobile">${escapeHtml(STRINGS.conversation.askBarPlaceholderMobile)}</span></span>
          <span class="ask-bar-hint qp-visually-hidden">Tap to chat</span>
          <span class="qp-ask-go" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
          </span>
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
