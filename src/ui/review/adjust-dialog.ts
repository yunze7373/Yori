/**
 * Adjust Dialog Component
 * Governed by Architecture Rev3 Section 6 and Invariant INV-107.
 *
 * Requirements:
 * - Edits prep/buffer minutes.
 * - Option 1: "For this time only" -> adjusts view for today without memory proposal.
 * - Option 2: "Remember as preference" -> creates a PENDING MemoryFact proposal (INV-107).
 *   NEVER a direct confirmed write.
 */

import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';

export interface AdjustDialogValues {
  prepMinutes: number;
  bufferMinutes: number;
}

export function renderAdjustDialog(currentValues: AdjustDialogValues): string {
  return `
    <div class="modal-backdrop" id="adjust-dialog-backdrop" role="presentation">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="adjust-dialog-title">
        <div class="modal-header">
          <h2 id="adjust-dialog-title" class="modal-title" tabindex="-1">${escapeHtml(STRINGS.adjustDialog.title)}</h2>
          <button type="button" class="btn-close" id="btn-close-adjust" aria-label="${escapeHtml(STRINGS.actions.cancel)}">&times;</button>
        </div>

        <form id="adjust-form" class="modal-body" tabindex="0" role="region" aria-label="${escapeHtml(STRINGS.adjustDialog.title)}" onsubmit="return false;">
          <div class="form-group">
            <label for="input-prep-minutes" class="form-label">${escapeHtml(STRINGS.adjustDialog.prepLabel)}</label>
            <input
              type="number"
              id="input-prep-minutes"
              class="form-input"
              value="${currentValues.prepMinutes}"
              min="0"
              max="120"
              step="5"
              required
            />
          </div>

          <div class="form-group">
            <label for="input-buffer-minutes" class="form-label">${escapeHtml(STRINGS.adjustDialog.bufferLabel)}</label>
            <input
              type="number"
              id="input-buffer-minutes"
              class="form-input"
              value="${currentValues.bufferMinutes}"
              min="0"
              max="60"
              step="5"
              required
            />
          </div>
        </form>

        <div class="modal-footer adjust-footer">
          <button type="button" class="btn btn-outline" id="btn-adjust-for-today">
            ${escapeHtml(STRINGS.adjustDialog.forThisTimeOnly)}
          </button>
          <button type="button" class="btn btn-primary" id="btn-adjust-remember">
            ${escapeHtml(STRINGS.adjustDialog.rememberPreference)}
          </button>
        </div>
      </div>
    </div>
  `;
}
