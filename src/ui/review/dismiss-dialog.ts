/**
 * Dismiss Dialog Component
 * Governed by Architecture Rev3 Section 6 and Invariants INV-107, INV-108.
 *
 * Requirements:
 * - Dismiss with reason -> a same-day suppression record (targetIntent, scope today).
 * - Persisted in src/core/storage.
 * - Creates a pending proposal where relevant (e.g. don't suggest).
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';

export function renderDismissDialog(intentId: string): string {
  return `
    <div class="modal-backdrop" id="dismiss-dialog-backdrop" role="presentation">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dismiss-dialog-title">
        <div class="modal-header">
          <h2 id="dismiss-dialog-title" class="modal-title">${escapeHtml(STRINGS.dismissDialog.title)}</h2>
          <button type="button" class="btn-close" id="btn-close-dismiss" aria-label="${escapeHtml(STRINGS.actions.cancel)}">&times;</button>
        </div>

        <div class="modal-body">
          <p class="modal-subtitle">${escapeHtml(STRINGS.dismissDialog.subtitle)}</p>

          <div class="dismiss-options" role="radiogroup" aria-labelledby="dismiss-dialog-title">
            <label class="radio-label">
              <input type="radio" name="dismiss-reason" value="dont_suggest_today" checked />
              <span>${escapeHtml(STRINGS.dismissDialog.reasonToday)}</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="dismiss-reason" value="busy_today" />
              <span>${escapeHtml(STRINGS.dismissDialog.reasonBusy)}</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="dismiss-reason" value="not_needed" />
              <span>${escapeHtml(STRINGS.dismissDialog.reasonNotNeeded)}</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline" id="btn-cancel-dismiss">
            ${escapeHtml(STRINGS.actions.cancel)}
          </button>
          <button type="button" class="btn btn-danger" id="btn-confirm-dismiss" data-intent="${escapeHtml(intentId)}">
            ${escapeHtml(STRINGS.dismissDialog.confirmDismiss)}
          </button>
        </div>
      </div>
    </div>
  `;
}
