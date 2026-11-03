/**
 * Model Status Pill Component (S5-LIVE-REASON)
 * Governed by Architecture Rev3 and LIVE_FIRST Plan S5 (AC-213-1, AC-213-2).
 *
 * Invariants:
 * 1. Honest Engine Status:
 *    - 'meta_model_live': 'Meta model · live'
 *    - 'recorded_model_replay': 'Recorded Meta model output · replay'
 *    - 'scripted_fixture': 'Scripted model fixture · not a live model call'
 *    - 'offline_deterministic': 'Offline fallback · deterministic'
 * 2. Visual Clarity:
 *    - Clear provenance and latency indicator
 *    - Visible across both 390x844 (mobile) and 1280x800 (desktop)
 *    - Never claims 'live' when in offline/fallback mode.
 */

import type { EngineStatus } from '../../../adapters/model/decision-log.js';
import { ENGINE_STATUS_LABELS } from '../../../adapters/model/decision-log.js';
import { escapeHtml } from '../presentation.js';

export interface ModelStatusPillOptions {
  readonly status: EngineStatus;
  readonly label?: string;
  readonly latencyMs?: number;
  readonly id?: string;
  readonly className?: string;
}

export function renderModelStatusPill(options: ModelStatusPillOptions): string {
  const status = options.status;
  const label = options.label || ENGINE_STATUS_LABELS[status] || status;
  const isLive = status === 'meta_model_live';
  const isReplay = status === 'recorded_model_replay';
  // D8: a Baseten answer is a model answer from the labelled fallback engine, not deterministic.
  const provenance = isLive ? 'live' : isReplay ? 'replay' : status === 'baseten_fallback' ? 'fallback_engine' : 'deterministic';
  const latencyPart = typeof options.latencyMs === 'number' && options.latencyMs > 0 ? ` · ${options.latencyMs}ms` : '';
  const elementId = options.id || 'model-status-pill';
  const extraClass = options.className ? ` ${options.className}` : '';

  const statusModifier = isLive
    ? 'pill-engine-live'
    : isReplay
    ? 'pill-engine-replay'
    : 'pill-engine-fallback';

  return `
    <div
      class="model-status-pill ${statusModifier}${extraClass}"
      id="${escapeHtml(elementId)}"
      data-engine-status="${escapeHtml(status)}"
      data-provenance="${provenance}"
      title="${escapeHtml(label)}${latencyPart}"
      role="status"
      aria-label="Model engine status: ${escapeHtml(label)}"
    >
      <span class="status-dot ${isLive ? 'dot-live' : isReplay ? 'dot-replay' : 'dot-fallback'}" aria-hidden="true"></span>
      <span class="status-text">${escapeHtml(label)}${latencyPart}</span>
    </div>
  `.trim();
}
