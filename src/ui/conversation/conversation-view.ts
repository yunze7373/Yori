/**
 * Full-page Conversation Shell Component (V2a - LIVING_CONTEXT_V2.md §2 & §8 D3/D4/D5, Rev4 C6/C7)
 * Manages full-page conversation overlay, transcript, composer, focus trap, Esc, Back, engine status, and decision log.
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import type { ActionStateStore, MessageItem } from '../action-state/types.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';

export function renderConversationOverlay(store: ActionStateStore): string {
  const isPinned = store.isPinned();
  const transcript = store.getTranscript();
  const isInteractive = store.getActionState().status === 'needs-confirmation';
  const engineStatusLabel = store.getEngineStatusLabel();
  const logEntries = globalDecisionLogger.getEntries();

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
            <div class="conversation-avatar-mark" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#16382F"/>
                <path d="M7 12l3 3 7-7" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="conversation-title-block">
              <h2 class="conversation-title" id="conversation-title">${escapeHtml(STRINGS.conversation.title)}</h2>
              <div class="conversation-subtitle-row">
                <span class="v2-offline-badge" id="conversation-status-badge">Offline demo · simulated</span>
                <span class="engine-status-chip" id="engine-status-chip">${escapeHtml(engineStatusLabel)}</span>
              </div>
            </div>
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
          ${renderTranscriptItems(transcript, isInteractive)}
        </main>

        <div class="decision-log-bar">
          <button type="button" class="btn-dev-decision-log" id="btn-toggle-decision-log" aria-expanded="false" title="Inspect Redacted Decision Log">
            Decision Log
          </button>
          <button type="button" class="btn-dev-export-log" id="btn-export-decision-log" data-testid="decision-log-export" title="Export Redacted Decision Log JSON">
            Export Log
          </button>
        </div>
        <div class="decision-log-drawer" id="decision-log-drawer" style="display: none;">
          <div class="decision-log-header">
            <span>Redacted Decision Log (C7)</span>
            <span class="decision-log-count">${logEntries.length} entries</span>
          </div>
          <pre class="decision-log-viewer" id="decision-log-content">${escapeHtml(globalDecisionLogger.exportJson())}</pre>
        </div>

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

export function renderTranscriptItems(
  transcript: readonly MessageItem[],
  isInteractive: boolean = false
): string {
  if (transcript.length === 0) {
    return `<div class="transcript-empty">No messages yet. Ask Yori about your departure or travel route.</div>`;
  }

  return transcript
    .map((msg, idx) => {
      const isUser = msg.sender === 'user';
      const isLatestMessage = idx === transcript.length - 1;
      const canInteract = isInteractive && isLatestMessage;

      return `
        <article class="chat-bubble-wrapper ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}" id="${escapeHtml(msg.id)}">
          ${
            !isUser
              ? `
            <div class="chat-avatar-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#16382F"/>
                <path d="M7 12l3 3 7-7" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          `
              : ''
          }
          <div class="chat-bubble">
            <p class="chat-text">${escapeHtml(msg.text)}</p>
            ${
              msg.comparisonOptions && msg.comparisonOptions.length > 0
                ? `
              <div class="chat-comparison-box">
                <div class="chat-comparison-title">Departure options compared:</div>
                <div class="chat-comparison-options">
                  ${msg.comparisonOptions
                    .map(
                      (opt) => `
                    <div class="chat-comparison-card ${opt.isLateRisk ? 'is-late' : 'is-on-time'} ${opt.isRecommended ? 'is-recommended' : ''}">
                      <div class="chat-comparison-card-header">
                        <span class="chat-comparison-tag">${opt.isLateRisk ? 'Late Risk' : 'Latest On-Time'}</span>
                        ${
                          opt.isRecommended
                            ? `<span class="chat-comparison-recommendation">Recommended${
                                opt.recommendationReasonCode
                                  ? ` · ${escapeHtml(opt.recommendationReasonCode.replace(/_/g, ' '))}`
                                  : ''
                              }</span>`
                            : ''
                        }
                        <span class="chat-comparison-margin">${
                          opt.isLateRisk ? `Late by ${Math.abs(opt.marginMinutes)}m` : 'On time · 0m buffer'
                        }</span>
                      </div>
                      <div class="chat-comparison-times">
                        Leave <strong>${escapeHtml(opt.leaveTime)}</strong> · Arrive by <strong>${escapeHtml(opt.arrivalTime)}</strong>
                      </div>
                      <button
                        type="button"
                        class="btn btn-outline btn-sm btn-select-comparison ${!canInteract ? 'is-stale' : ''}"
                        data-delta="${opt.deltaMinutes}"
                        ${!canInteract ? 'disabled aria-disabled="true"' : ''}
                      >
                        ${opt.deltaMinutes === 0 ? 'Keep current departure' : `Choose: Leave ${opt.deltaMinutes}m later`}
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            `
                : ''
            }
            ${
              msg.needsConfirmation && msg.pendingPlan
                ? `
              <div class="chat-confirm-box">
                <div class="chat-confirm-notice">Confirm change for this time only:</div>
                <div class="chat-confirm-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm ${!canInteract ? 'is-stale' : ''}"
                    id="btn-chat-confirm"
                    data-plan-id="${escapeHtml(msg.pendingPlan.id)}"
                    ${!canInteract ? 'disabled aria-disabled="true"' : ''}
                  >
                    Confirm for this time only
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline btn-sm ${!canInteract ? 'is-stale' : ''}"
                    id="btn-chat-reject"
                    ${!canInteract ? 'disabled aria-disabled="true"' : ''}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            `
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
  const overlay = container.querySelector<HTMLElement>('#conversation-overlay');
  const closeBtn = container.querySelector<HTMLButtonElement>('#conversation-close-btn');
  const pinBtn = container.querySelector<HTMLButtonElement>('#conversation-pin-btn');
  const transcriptEl = container.querySelector<HTMLElement>('#conversation-transcript');
  const form = container.querySelector<HTMLFormElement>('#conversation-composer-form');
  const input = container.querySelector<HTMLInputElement>('#conversation-input');

  // Push history state if not already pushed (for browser back navigation)
  if (typeof window !== 'undefined' && window.history && !window.history.state?.yoriConversationOpen) {
    window.history.pushState({ yoriConversationOpen: true }, '', window.location.href);
  }

  let isClosed = false;

  const updateStatusChip = () => {
    const chip = overlay?.querySelector<HTMLElement>('#engine-status-chip');
    if (chip) {
      chip.textContent = store.getEngineStatusLabel();
    }
  };

  const updateDecisionLogDrawer = () => {
    const viewer = overlay?.querySelector<HTMLElement>('#decision-log-content');
    if (viewer) {
      viewer.textContent = globalDecisionLogger.exportJson();
    }
    const countEl = overlay?.querySelector<HTMLElement>('.decision-log-count');
    if (countEl) {
      countEl.textContent = `${globalDecisionLogger.getEntries().length} entries`;
    }
  };

  const performClose = (reason?: string) => {
    if (isClosed) return;
    isClosed = true;
    store.closeConversation(reason);
    onClose();
  };

  const safeClose = (reason: string) => {
    if (isClosed) return;
    if (typeof window !== 'undefined' && window.history && window.history.state?.yoriConversationOpen) {
      performClose(reason);
      window.history.back();
    } else {
      performClose(reason);
    }
  };

  const wireTranscriptButtons = () => {
    if (!transcriptEl) return;

    const confirmBtn = transcriptEl.querySelector<HTMLButtonElement>(
      '#btn-chat-confirm:not([disabled]):not(.is-stale)'
    );
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirmBtn.disabled || confirmBtn.classList.contains('is-stale')) return;
        const res = store.submitMessage('Looks good');
        transcriptEl.innerHTML = renderTranscriptItems(
          store.getTranscript(),
          store.getActionState().status === 'needs-confirmation'
        );
        updateStatusChip();
        updateDecisionLogDrawer();
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        if (res.collapsed) {
          setTimeout(() => safeClose('auto_collapse'), 600);
        }
      });
    }

    const rejectBtn = transcriptEl.querySelector<HTMLButtonElement>(
      '#btn-chat-reject:not([disabled]):not(.is-stale)'
    );
    if (rejectBtn) {
      rejectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (rejectBtn.disabled || rejectBtn.classList.contains('is-stale')) return;
        store.rejectPending();
        transcriptEl.innerHTML = renderTranscriptItems(
          store.getTranscript(),
          store.getActionState().status === 'needs-confirmation'
        );
        updateStatusChip();
        updateDecisionLogDrawer();
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      });
    }

    const comparisonButtons = transcriptEl.querySelectorAll<HTMLButtonElement>(
      '.btn-select-comparison:not([disabled]):not(.is-stale)'
    );
    comparisonButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.disabled || btn.classList.contains('is-stale')) return;
        const delta = btn.dataset.delta;
        if (delta === undefined) return;
        const numDelta = parseInt(delta, 10);
        const msg = numDelta === 0 ? 'Keep current departure' : `Leave ${delta} minutes later`;
        const res = store.submitMessage(msg);
        transcriptEl.innerHTML = renderTranscriptItems(
          store.getTranscript(),
          store.getActionState().status === 'needs-confirmation'
        );
        updateStatusChip();
        updateDecisionLogDrawer();
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        wireTranscriptButtons();
        if (res.collapsed) {
          setTimeout(() => safeClose('auto_collapse'), 600);
        }
      });
    });
  };

  wireTranscriptButtons();

  // Redacted decision log panel toggle & export
  const toggleLogBtn = overlay?.querySelector<HTMLButtonElement>('#btn-toggle-decision-log');
  const drawer = overlay?.querySelector<HTMLElement>('#decision-log-drawer');
  if (toggleLogBtn && drawer) {
    toggleLogBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = drawer.style.display === 'none';
      drawer.style.display = isHidden ? 'block' : 'none';
      toggleLogBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      updateDecisionLogDrawer();
    });
  }

  const exportLogBtn = overlay?.querySelector<HTMLButtonElement>('#btn-export-decision-log');
  if (exportLogBtn) {
    exportLogBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const jsonStr = globalDecisionLogger.exportJson();
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(jsonStr).catch(() => {});
      }
    });
  }

  // Popstate listener for system / browser Back navigation
  const handlePopState = () => {
    if (isClosed) return;
    performClose('system_back');
  };
  window.addEventListener('popstate', handlePopState);

  // Esc key listener (unless pinned or Esc closed)
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (drawer && drawer.style.display !== 'none') {
        drawer.style.display = 'none';
        toggleLogBtn?.setAttribute('aria-expanded', 'false');
        return;
      }
      const shouldClose = store.handleEsc();
      if (shouldClose) {
        safeClose('esc_key');
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  // Backdrop click listener: click outside the shell closes the conversation
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === overlay) {
      safeClose('backdrop_click');
    }
  };
  overlay?.addEventListener('click', handleOverlayClick);

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      safeClose('close_button');
    });
  }

  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const newPinned = store.togglePin();
      pinBtn.classList.toggle('is-pinned', newPinned);
      pinBtn.setAttribute('aria-pressed', newPinned ? 'true' : 'false');
      const textSpan = pinBtn.querySelector('span');
      if (textSpan) {
        textSpan.textContent = newPinned ? STRINGS.conversation.pinnedActive : 'Pin';
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
        transcriptEl.innerHTML = renderTranscriptItems(
          store.getTranscript(),
          store.getActionState().status === 'needs-confirmation'
        );
        updateStatusChip();
        updateDecisionLogDrawer();
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        wireTranscriptButtons();
      }

      if (result.collapsed) {
        setTimeout(() => safeClose('auto_collapse'), 600);
      } else {
        input.focus();
      }
    });
  }

  // Focus trap inside the modal overlay
  const handleFocusTrap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !overlay) return;
    const focusable = overlay.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([aria-disabled="true"]):not(.is-stale), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0] as HTMLElement | undefined;
    const last = focusable[focusable.length - 1] as HTMLElement | undefined;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  overlay?.addEventListener('keydown', handleFocusTrap);

  // Focus input automatically on open
  setTimeout(() => {
    input?.focus();
  }, 50);

  // Return cleanup function
  return () => {
    window.removeEventListener('popstate', handlePopState);
    document.removeEventListener('keydown', handleKeyDown);
    overlay?.removeEventListener('click', handleOverlayClick);
    overlay?.removeEventListener('keydown', handleFocusTrap);
  };
}
