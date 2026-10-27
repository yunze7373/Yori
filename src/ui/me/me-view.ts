/**
 * Me Page Component
 * Governed by Architecture Rev3 Section 6 and Invariants INV-105, INV-107, INV-110.
 *
 * Requirements:
 * - Confirmed / pending / rejected facts with provenance.
 * - Today's proactive prompt budget used (INV-105).
 * - Action controls on pending proposals: Confirm / Not true (INV-107).
 * - Only Confirm writes a confirmed fact; rejected proposals stay queryable and are never applied.
 * - Data controls: Export Raw Data, Reset Storage with two-step confirmation (INV-110).
 */

import type { MemoryFact } from '../../core/contracts/index.js';
import type { PromptBudgetRecord } from '../../core/storage/index.js';
import { escapeHtml, formatTime } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import { humanizeMemoryKey, humanizeMemoryValue } from '../review/why-sheet.js';

export interface MeViewState {
  readonly memoryFacts: readonly MemoryFact[];
  readonly proposals: readonly MemoryFact[];
  readonly promptBudget: PromptBudgetRecord;
  readonly maxDailyPrompts: number;
  readonly timezone?: string;
  readonly actionNotice?: string;
}

export function renderMeView(state: MeViewState): string {
  const confirmed = state.memoryFacts.filter(f => f.status === 'confirmed');
  const pending = state.proposals.filter(f => f.status === 'pending');
  const rejected = state.proposals.filter(f => f.status === 'rejected');

  const budgetUsageText = STRINGS.me.budgetUsage
    .replace('{used}', String(state.promptBudget.count))
    .replace('{max}', String(state.maxDailyPrompts));

  return `
    <div class="me-view-container">
      <header class="me-header">
        <h1 class="me-title">${escapeHtml(STRINGS.me.title)}</h1>
        <p class="me-subtitle">${escapeHtml(STRINGS.me.subtitle)}</p>
      </header>

      ${
        state.actionNotice
          ? `<div class="storage-feedback" role="status">${escapeHtml(state.actionNotice)}</div>`
          : ''
      }

      <!-- 1. Proactive Prompt Budget (INV-105) -->
      <section class="card me-card" aria-labelledby="me-budget-title">
        <div class="me-card-header">
          <h2 id="me-budget-title" class="section-label">${escapeHtml(STRINGS.me.budgetTitle)}</h2>
          <span class="card-badge badge-budget">${escapeHtml(budgetUsageText)}</span>
        </div>
        <p class="me-card-desc">${escapeHtml(STRINGS.me.budgetSubtitle)}</p>
        <div class="budget-meter-track" role="progressbar" aria-valuenow="${state.promptBudget.count}" aria-valuemin="0" aria-valuemax="${state.maxDailyPrompts}">
          <div class="budget-meter-fill" style="width: ${Math.min(100, (state.promptBudget.count / state.maxDailyPrompts) * 100)}%;"></div>
        </div>
      </section>

      <!-- 2. Confirmed Preferences -->
      <section class="card me-card" aria-labelledby="me-confirmed-title">
        <h2 id="me-confirmed-title" class="section-label">${escapeHtml(STRINGS.me.confirmedTitle)}</h2>
        <div class="memory-list" id="confirmed-facts-list">
          ${
            confirmed.length > 0
              ? confirmed
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row" id="fact-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta">Source: ${escapeHtml(fact.provenance.source)} · Updated ${escapeHtml(time)}</div>
                      </div>
                      <span class="card-badge badge-confirmed">Confirmed</span>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty">${escapeHtml(STRINGS.me.confirmedEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 3. Pending Proposals (Confirm / Not true) -->
      <section class="card me-card" aria-labelledby="me-pending-title">
        <div class="me-card-header">
          <h2 id="me-pending-title" class="section-label">${escapeHtml(STRINGS.me.pendingTitle)}</h2>
          <span class="card-badge badge-pending">${pending.length} Pending</span>
        </div>
        <p class="me-card-desc">${escapeHtml(STRINGS.me.pendingSubtitle)}</p>

        <div class="memory-list" id="pending-proposals-list">
          ${
            pending.length > 0
              ? pending
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row pending-row" id="proposal-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta">
                          ${fact.provenance.note ? `${escapeHtml(fact.provenance.note)} · ` : ''}
                          Created ${escapeHtml(time)}
                        </div>
                      </div>
                      <div class="proposal-actions">
                        <button type="button" class="btn btn-sm btn-primary btn-confirm-proposal" data-key="${escapeHtml(fact.key)}">
                          ${escapeHtml(STRINGS.actions.confirm)}
                        </button>
                        <button type="button" class="btn btn-sm btn-outline btn-reject-proposal" data-key="${escapeHtml(fact.key)}">
                          ${escapeHtml(STRINGS.actions.notTrue)}
                        </button>
                      </div>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty">${escapeHtml(STRINGS.me.pendingEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 4. Rejected Proposals (Audit Trail) -->
      <section class="card me-card" aria-labelledby="me-rejected-title">
        <h2 id="me-rejected-title" class="section-label">${escapeHtml(STRINGS.me.rejectedTitle)}</h2>
        <p class="me-card-desc">${escapeHtml(STRINGS.me.rejectedSubtitle)}</p>

        <div class="memory-list" id="rejected-proposals-list">
          ${
            rejected.length > 0
              ? rejected
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row rejected-row" id="rejected-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta">Declined by user · Recorded ${escapeHtml(time)}</div>
                      </div>
                      <span class="card-badge badge-rejected">Rejected</span>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty">${escapeHtml(STRINGS.me.rejectedEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 5. Data Controls & Storage (INV-110) -->
      <section class="card me-card" aria-labelledby="me-data-title">
        <h2 id="me-data-title" class="section-label">${escapeHtml(STRINGS.me.dataControlsTitle)}</h2>
        <div class="data-actions-row">
          <button type="button" class="btn btn-secondary" id="btn-me-export">
            ${escapeHtml(STRINGS.me.exportBtn)}
          </button>
          <button type="button" class="btn btn-danger" id="btn-me-reset">
            ${escapeHtml(STRINGS.me.resetBtn)}
          </button>
        </div>
      </section>
    </div>
  `;
}
