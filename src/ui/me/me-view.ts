/**
 * Me Page Component
 * Governed by Architecture Rev3 Section 6 and Invariants INV-105, INV-107, INV-110.
 *
 * Requirements:
 * - "What Yori has learned": learned habits and things you told Yori, each with its basis and a
 *   quiet Forget (INV-107 learn-and-correct; no confirm steps).
 * - Today's proactive prompt budget used (INV-105).
 * - Data controls: Export Raw Data, Reset Storage with two-step confirmation (INV-110).
 */

import { isXmemoHidden } from '../demo-flags.js';
import type { MemoryFact } from '../../core/contracts/index.js';
import type { PromptBudgetRecord } from '../../core/storage/index.js';
import { escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import { humanizeMemoryKey, humanizeMemoryValue } from '../review/why-sheet.js';
import { classifyFactSource, provenanceLabel } from '../view-models/provenance.js';

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
    readonly connectionState?: 'off' | 'connected-mock' | 'error-fallback';
  };
}

export function renderMeView(state: MeViewState): string {
  // HABIT-LEARN: what Yori learned and what you told it; pending / rejected proposals gate nothing.
  const learned = state.memoryFacts.filter(f => f.status === 'confirmed' || f.status === 'learned');

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

      <!-- 2. What Yori has learned (HABIT-LEARN: learn-and-correct; no confirm steps) -->
      <section class="card me-card" aria-labelledby="me-learned-title">
        <h2 id="me-learned-title" class="section-label" data-slot="chrome" data-slot-reason="Learned habits section label">What Yori has learned</h2>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Learned habits description">Learned from your choices in Yori, or things you told it. Forget anything here and Yori stops using it.</p>
        <div class="memory-list" id="learned-habits-list">
          ${
            learned.length > 0
              ? learned
                  .map(fact => {
                    const tag = provenanceLabel(classifyFactSource(fact));
                    return `
                    <div class="memory-row learned-row" id="habit-${escapeHtml(fact.key)}" data-habit-key="${escapeHtml(fact.key)}" data-habit-status="${escapeHtml(fact.status)}">
                      <div class="memory-main">
                        <div class="memory-key" data-slot="chrome" data-slot-reason="Memory preference key">${escapeHtml(humanizeMemoryKey(fact.key))}</div>
                        <div class="memory-val" data-source-ref="${escapeHtml(fact.key)}.value" data-slot="domain">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</div>
                        <div class="memory-meta" data-source-ref="${escapeHtml(fact.key)}.provenance" data-slot="domain">${escapeHtml(tag)}</div>
                      </div>
                      <button type="button" class="btn btn-sm btn-quiet btn-forget-habit" data-key="${escapeHtml(fact.key)}" aria-label="Forget ${escapeHtml(humanizeMemoryKey(fact.key).toLowerCase())}" data-slot="chrome" data-slot-reason="Forget learned habit button">Forget</button>
                    </div>
                  `;
                  })
                  .join('')
              : `<p class="memory-empty" data-slot="chrome" data-slot-reason="Empty learned habits notice">Nothing yet. As you pick places in Yori, it learns what you like and puts it first.</p>`
          }
        </div>
      </section>

      <!-- 5. XMemo Sync (PH-002 C2, AC-203-2) - Only visible when XMEMO_OAUTH_ENABLED is on -->
      ${
        state.xmemoStatus?.enabled === true
          ? `
      <section class="card me-card" aria-labelledby="me-xmemo-title" data-xmemo-status="${state.xmemoStatus.connectionState || (state.xmemoStatus.connected ? 'connected' : 'disconnected')}">
        <div class="me-card-header">
          <h2 id="me-xmemo-title" class="section-label" data-slot="chrome" data-slot-reason="XMemo sync section label">${escapeHtml(STRINGS.xmemo.title)}</h2>
          <span class="card-badge ${
            state.xmemoStatus.connectionState === 'error-fallback'
              ? 'badge-pending badge-fallback'
              : state.xmemoStatus.connected
              ? 'badge-confirmed'
              : 'badge-pending'
          }" data-slot="chrome" data-slot-reason="XMemo status badge">
            ${escapeHtml(
              state.xmemoStatus.connectionState === 'error-fallback'
                ? 'Fallback (local only)'
                : state.xmemoStatus.connected
                ? STRINGS.xmemo.connectedBadge
                : STRINGS.xmemo.disconnectedBadge
            )}
          </span>
        </div>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="XMemo status description">
          ${escapeHtml(
            state.xmemoStatus.connectionState === 'error-fallback'
              ? 'Remote memory vault is unavailable. Operating safely in local storage fallback mode.'
              : state.xmemoStatus.connected
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

      <!-- 6. Connectors (Settings > Connectors) -->
      <section class="card me-card" aria-labelledby="me-connectors-title">
        <div class="me-card-header">
          <h2 id="me-connectors-title" class="section-label" data-slot="chrome" data-slot-reason="Connectors section label">Connectors</h2>
          <span class="card-badge badge-confirmed" data-slot="chrome" data-slot-reason="Manage connectors badge">Manage</span>
        </div>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Connectors section description">
          ${isXmemoHidden() ? 'Manage live context sources including Location, Calendar, Weather, and Notifications.' : 'Manage live context sources including Location, Calendar, Weather, XMemo, and Notifications.'}
        </p>
        <div class="data-actions-row">
          <button type="button" class="btn btn-primary" id="btn-me-connectors" data-slot="chrome" data-slot-reason="Open connectors button">
            Manage Connectors
          </button>
        </div>
      </section>

      <!-- 7. Data Controls & Storage (INV-110) -->
      <section class="card me-card" aria-labelledby="me-data-title">
        <h2 id="me-data-title" class="section-label" data-slot="chrome" data-slot-reason="Data controls section label">${escapeHtml(STRINGS.me.dataControlsTitle)}</h2>
        <p class="me-card-desc" data-slot="chrome" data-slot-reason="Data controls description">
          ${isXmemoHidden() ? 'Resetting storage clears the preferences and history saved on this device.' : 'Resetting storage clears local browser preferences and history only. Remote XMemo vault records are preserved and never deleted from this client.'}
        </p>
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
