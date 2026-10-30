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

/**
 * Maps provenance source tokens to human-readable user copy.
 * Eliminates engineering tokens (e.g. 'user_confirmed') on the Me tab.
 * Unknown or non-local sources map to neutral, non-claiming descriptions.
 */
export function formatProvenanceSource(source: string): string {
  switch (source) {
    case 'user_confirmed':
      return 'Source: you confirmed';
    case 'user_feedback':
      return 'Source: your adjustment';
    case 'seed':
      return 'Source: sample profile';
    case 'inferred':
      return 'Source: suggested habit';
    case 'xmemo':
      return 'Source: synced from XMemo';
    case 'model_reasoning':
      return 'Source: suggested by assistant';
    default:
      return 'Source: other';
  }
}

export interface MeViewState {
  readonly memoryFacts: readonly MemoryFact[];
  readonly proposals: readonly MemoryFact[];
  readonly promptBudget: PromptBudgetRecord;
  readonly maxDailyPrompts: number;
  readonly timezone?: string;
  readonly actionNotice?: string;
  readonly isPersistent?: boolean;
  readonly xmemoStatus?: {
    readonly enabled: boolean;
    readonly connected: boolean;
    readonly statusText?: string;
  };
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
        <h1 class="me-title" data-slot="chrome" data-slot-reason="Me page title">${escapeHtml(STRINGS.me.title)}</h1>
        <p class="me-subtitle" data-slot="chrome" data-slot-reason="Me page subtitle">${escapeHtml(STRINGS.me.subtitle)}</p>
      </header>

      ${
        state.isPersistent === false
          ? `<div class="storage-notice banner-warning" role="status" data-slot="chrome" data-slot-reason="Storage status notice">${escapeHtml(STRINGS.me.persistenceUnavailable)}</div>`
          : ''
      }

      ${
        state.actionNotice
          ? `<div class="storage-feedback" role="status" data-slot="chrome" data-slot-reason="Storage feedback message">${escapeHtml(state.actionNotice)}</div>`
          : ''
      }

      <!-- 1. Proactive Prompt Budget (INV-105) -->
      <section class="card me-card" aria-labelledby="me-budget-title">
        <div class="me-card-header">
          <h2 id="me-budget-title" class="section-label" data-slot="chrome" data-slot-reason="Daily budget section label">${escapeHtml(STRINGS.me.budgetTitle)}</h2>
          <span class="card-badge badge-budget" data-slot="chrome" data-slot-reason="Daily prompt budget badge">${escapeHtml(budgetUsageText)}</span>
        </div>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Daily budget description">${escapeHtml(STRINGS.me.budgetSubtitle)}</p>
        <div class="budget-meter-track" role="progressbar" aria-labelledby="me-budget-title" aria-valuenow="${state.promptBudget.count}" aria-valuemin="0" aria-valuemax="${state.maxDailyPrompts}">
          <div class="budget-meter-fill" style="width: ${Math.min(100, (state.promptBudget.count / state.maxDailyPrompts) * 100)}%;"></div>
        </div>
      </section>

      <!-- 2. Confirmed Preferences -->
      <section class="card me-card" aria-labelledby="me-confirmed-title">
        <h2 id="me-confirmed-title" class="section-label" data-slot="chrome" data-slot-reason="Confirmed preferences section label">${escapeHtml(STRINGS.me.confirmedTitle)}</h2>
        <div class="memory-list" id="confirmed-facts-list">
          ${
            confirmed.length > 0
              ? confirmed
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row" id="fact-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key" data-slot="chrome" data-slot-reason="Memory preference key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val" data-source-ref="${escapeHtml(fact.key)}.value" data-slot="domain">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta" data-source-ref="${escapeHtml(fact.key)}.provenance" data-slot="domain">${escapeHtml(formatProvenanceSource(fact.provenance.source))} · Updated ${escapeHtml(time)}</div>
                      </div>
                      <span class="card-badge badge-confirmed" data-slot="chrome" data-slot-reason="Confirmed preference badge">Confirmed</span>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty" data-slot="chrome" data-slot-reason="Empty confirmed preferences notice">${escapeHtml(STRINGS.me.confirmedEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 3. Pending Proposals (Confirm / Not true) -->
      <section class="card me-card" aria-labelledby="me-pending-title">
        <div class="me-card-header">
          <h2 id="me-pending-title" class="section-label" data-slot="chrome" data-slot-reason="Pending proposals section label">${escapeHtml(STRINGS.me.pendingTitle)}</h2>
          <span class="card-badge badge-pending" data-slot="chrome" data-slot-reason="Pending proposals count badge">${pending.length} Pending</span>
        </div>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Pending proposals description">${escapeHtml(STRINGS.me.pendingSubtitle)}</p>

        <div class="memory-list" id="pending-proposals-list">
          ${
            pending.length > 0
              ? pending
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row pending-row" id="proposal-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key" data-slot="chrome" data-slot-reason="Memory preference key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val" data-slot="chrome" data-slot-reason="Pending proposal value">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta" data-slot="chrome" data-slot-reason="Pending proposal metadata">
                          ${fact.provenance.note ? `${escapeHtml(fact.provenance.note)} · ` : ''}
                          Created ${escapeHtml(time)}
                        </div>
                      </div>
                      <div class="proposal-actions">
                        <button type="button" class="btn btn-sm btn-primary btn-confirm-proposal" data-key="${escapeHtml(fact.key)}" data-slot="chrome" data-slot-reason="Confirm proposal button">
                          ${escapeHtml(STRINGS.actions.confirm)}
                        </button>
                        <button type="button" class="btn btn-sm btn-outline btn-reject-proposal" data-key="${escapeHtml(fact.key)}" data-slot="chrome" data-slot-reason="Reject proposal button">
                          ${escapeHtml(STRINGS.actions.notTrue)}
                        </button>
                      </div>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty" data-slot="chrome" data-slot-reason="Empty pending proposals notice">${escapeHtml(STRINGS.me.pendingEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 4. Rejected Proposals (Audit Trail) -->
      <section class="card me-card" aria-labelledby="me-rejected-title">
        <h2 id="me-rejected-title" class="section-label" data-slot="chrome" data-slot-reason="Rejected proposals section label">${escapeHtml(STRINGS.me.rejectedTitle)}</h2>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Rejected proposals description">${escapeHtml(STRINGS.me.rejectedSubtitle)}</p>

        <div class="memory-list" id="rejected-proposals-list">
          ${
            rejected.length > 0
              ? rejected
                  .map(fact => {
                    const time = formatTime(fact.updatedAt, state.timezone);
                    return `
                    <div class="memory-row rejected-row" id="rejected-${escapeHtml(fact.key)}">
                      <div class="memory-main">
                        <div class="memory-key" data-slot="chrome" data-slot-reason="Memory preference key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val" data-slot="chrome" data-slot-reason="Rejected proposal value">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta" data-slot="chrome" data-slot-reason="Rejected proposal metadata">Declined by user · Recorded ${escapeHtml(time)}</div>
                      </div>
                      <span class="card-badge badge-rejected" data-slot="chrome" data-slot-reason="Rejected proposal badge">Rejected</span>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty" data-slot="chrome" data-slot-reason="Empty rejected proposals notice">${escapeHtml(STRINGS.me.rejectedEmpty)}</p>`
          }
        </div>
      </section>

      <!-- 5. XMemo Sync (PH-002 C2, AC-203-2) - Only visible when XMEMO_OAUTH_ENABLED is on -->
      ${
        state.xmemoStatus?.enabled === true
          ? `
      <section class="card me-card" aria-labelledby="me-xmemo-title">
        <div class="me-card-header">
          <h2 id="me-xmemo-title" class="section-label" data-slot="chrome" data-slot-reason="XMemo sync section label">${escapeHtml(STRINGS.xmemo.title)}</h2>
          <span class="card-badge ${state.xmemoStatus.connected ? 'badge-confirmed' : 'badge-pending'}" data-slot="chrome" data-slot-reason="XMemo status badge">
            ${escapeHtml(state.xmemoStatus.connected ? STRINGS.xmemo.connectedBadge : STRINGS.xmemo.disconnectedBadge)}
          </span>
        </div>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="XMemo status description">
          ${escapeHtml(
            state.xmemoStatus.connected
              ? STRINGS.xmemo.connectedDesc
              : STRINGS.xmemo.disconnectedDesc
          )}
        </p>
        <div class="data-actions-row">
          ${
            state.xmemoStatus.connected
              ? `<button type="button" class="btn btn-outline" id="btn-xmemo-disconnect" data-slot="chrome" data-slot-reason="Disconnect XMemo button">${escapeHtml(STRINGS.xmemo.disconnectBtn)}</button>`
              : `<button type="button" class="btn btn-primary" id="btn-xmemo-connect" data-slot="chrome" data-slot-reason="Connect XMemo button">${escapeHtml(STRINGS.xmemo.connectBtn)}</button>`
          }
        </div>
      </section>
      `
          : ''
      }

      <!-- 6. Data Controls & Storage (INV-110) -->
      <section class="card me-card" aria-labelledby="me-data-title">
        <h2 id="me-data-title" class="section-label" data-slot="chrome" data-slot-reason="Data controls section label">${escapeHtml(STRINGS.me.dataControlsTitle)}</h2>
        <div class="data-actions-row">
          <button type="button" class="btn btn-secondary" id="btn-me-export" data-slot="chrome" data-slot-reason="Export raw data button">
            ${escapeHtml(STRINGS.me.exportBtn)}
          </button>
          <button type="button" class="btn btn-danger" id="btn-me-reset" data-slot="chrome" data-slot-reason="Reset storage button">
            ${escapeHtml(STRINGS.me.resetBtn)}
          </button>
        </div>
      </section>
    </div>
  `;
}
