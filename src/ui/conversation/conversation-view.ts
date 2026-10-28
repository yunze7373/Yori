/**
 * Full-page Conversation Shell Component (V0 - LIVING_CONTEXT_V2.md §2)
 * Manages full-page conversation overlay, transcript, composer, pin, Esc, and focus return.
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import type { ActionStateStore, MessageItem } from '../action-state/types.js';

export function renderConversationOverlay(store: ActionStateStore): string {
  const isPinned = store.isPinned();
  const transcript = store.getTranscript();

  return `
    <div class="conversation-overlay" id="conversation-overlay" role="dialog" aria-modal="true" aria-label="${escapeHtml(STRINGS.conversation.title)}">
      <div class="conversation-shell">
        <header class="conversation-header">
          <div class="conversation-header-left">
            <button type="button" class="conversation-btn-icon" id="conversation-close-btn" aria-label="${escapeHtml(STRINGS.conversation.closeAriaLabel)}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <h2 class="conversation-title">${escapeHtml(STRINGS.conversation.title)}</h2>
            <span class="v2-preview-badge">${escapeHtml(STRINGS.header.v2Badge)}</span>
          </div>
          <div class="conversation-header-right">
            <button type="button" class="conversation-pin-btn ${isPinned ? 'is-pinned' : ''}" id="conversation-pin-btn" aria-label="${escapeHtml(STRINGS.conversation.pinAriaLabel)}" aria-pressed="${isPinned ? 'true' : 'false'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-2l-2-3V5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v7l-2 3v2z"></path>
              </svg>
              <span>${isPinned ? escapeHtml(STRINGS.conversation.pinnedActive) : 'Pin'}</span>
            </button>
          </div>
        </header>

        <main class="conversation-transcript" id="conversation-transcript" role="log" aria-live="polite" aria-label="Conversation Transcript">
          ${renderTranscriptItems(transcript)}
        </main>

        <footer class="conversation-footer">
          <form class="conversation-composer" id="conversation-composer-form" autocomplete="off">
            <label for="conversation-input" class="sr-only">${escapeHtml(STRINGS.conversation.inputAriaLabel)}</label>
            <input
              type="text"
              id="conversation-input"
              class="conversation-input"
              placeholder="${escapeHtml(STRINGS.conversation.inputPlaceholder)}"
              aria-label="${escapeHtml(STRINGS.conversation.inputAriaLabel)}"
              autocomplete="off"
            />
            <button type="submit" id="conversation-send-btn" class="conversation-send-btn" aria-label="${escapeHtml(STRINGS.conversation.sendAriaLabel)}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </footer>
      </div>
    </div>
  `;
}

function renderTranscriptItems(transcript: readonly MessageItem[]): string {
  if (transcript.length === 0) {
    return `<div class="transcript-empty">No messages yet.</div>`;
  }

  return transcript
    .map((msg) => {
      const isUser = msg.sender === 'user';
      return `
        <article class="chat-bubble-wrapper ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}" id="${escapeHtml(msg.id)}">
          <div class="chat-bubble">
            <p class="chat-text">${escapeHtml(msg.text)}</p>
            ${
              msg.isPlaceholder
                ? `<span class="chat-placeholder-tag" aria-label="Notice">(V0 Preview: Command grammar arrives in V2a)</span>`
                : ''
            }
          </div>
        </article>
      `;
    })
    .join('');
}

export function attachConversationEvents(
  container: HTMLElement,
  store: ActionStateStore,
  onClose: () => void
): () => void {
  const closeBtn = container.querySelector<HTMLButtonElement>('#conversation-close-btn');
  const pinBtn = container.querySelector<HTMLButtonElement>('#conversation-pin-btn');
  const form = container.querySelector<HTMLFormElement>('#conversation-composer-form');
  const input = container.querySelector<HTMLInputElement>('#conversation-input');
  const transcriptEl = container.querySelector<HTMLElement>('#conversation-transcript');

  // Focus composer immediately on mount
  if (input) {
    requestAnimationFrame(() => {
      input.focus();
    });
  }

  // Scroll transcript to bottom
  if (transcriptEl) {
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  const handleEscKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (store.handleEsc()) {
        onClose();
      }
    }
  };
  window.addEventListener('keydown', handleEscKey);

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      store.closeConversation('close_button');
      onClose();
    });
  }

  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const newPinned = store.togglePin();
      pinBtn.setAttribute('aria-pressed', newPinned ? 'true' : 'false');
      pinBtn.classList.toggle('is-pinned', newPinned);
      const span = pinBtn.querySelector('span');
      if (span) {
        span.textContent = newPinned ? STRINGS.conversation.pinnedActive : 'Pin';
      }
    });
  }

  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      const result = store.submitMessage(text);

      if (transcriptEl) {
        transcriptEl.innerHTML = renderTranscriptItems(store.getTranscript());
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }

      if (result.collapsed) {
        onClose();
      } else {
        input.focus();
      }
    });
  }

  // Cleanup handler
  return () => {
    window.removeEventListener('keydown', handleEscKey);
  };
}
