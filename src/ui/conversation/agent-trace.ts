/**
 * AGENT-TRACE: Real observable agent activity timeline & result presentation
 * (TID: INBOX-20261104-533A59 / ASK-AGENT-TRACE)
 *
 * Invariants:
 * 1. Truthful event bus: emits ONLY at real async boundaries that already exist.
 * 2. Durations come from performance.now() deltas around real awaits.
 * 3. Privacy: NEVER exposes coordinates, prompts, raw payloads, tokens, keys, memory contents, or OAuth secrets.
 * 4. Result card: shows ONLY real candidate fields (name, distance, open status, rating/count, price, cuisine, attribution).
 *    No fake photos; no invented noise traits.
 * 5. Offline/demo mode: truthfully labelled 'offline'; never a fake live badge.
 */

export type TracePhaseKind =
  | 'permission'
  | 'location'
  | 'places'
  | 'model'
  | 'fact_check'
  | 'render'
  | 'local';

export type TraceStatus = 'started' | 'finished' | 'failed' | 'cancelled' | 'skipped';

export interface AgentTraceStep {
  readonly id: string;
  readonly runId: string;
  readonly phase: string;
  readonly kind: TracePhaseKind;
  status: TraceStatus;
  readonly startedAt: number;
  endedAt?: number;
  durationMs?: number;
  summary: string;
  badge?: string;
  error?: string;
}

export interface AgentTraceLunchCard {
  readonly name: string;
  readonly straightLineDistanceLabel?: string;
  readonly openingStatus?: 'open' | 'closed' | 'unknown' | string;
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: number | string;
  readonly cuisine?: string;
  readonly attribution?: string;
  readonly photoUrl?: string;
  readonly photoAttribution?: string;
  readonly noiseLevel?: string;
}

export interface AgentTraceRun {
  readonly id: string;
  readonly startedAt: number;
  endedAt?: number;
  totalDurationMs?: number;
  status: 'in_flight' | 'completed' | 'cancelled' | 'failed';
  steps: AgentTraceStep[];
  engineLabel?: string;
  topPick?: AgentTraceLunchCard;
}

export type AgentTraceListener = (run: AgentTraceRun) => void;

const nowMonotonicMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// Privacy patterns: reject/sanitize coordinates, tokens, keys
const COORD_PATTERN = /-?\b\d{1,3}\.\d{4,}\b/g;
const SECRET_PATTERN = /\b(bearer\s+[a-zA-Z0-9_\-\.]+|aiza[0-9a-zA-Z_\-]+|sec_[a-zA-Z0-9]+|sk-[a-zA-Z0-9]+)\b/gi;
const PROMPT_PATTERN = /<(?:prompt|system|context|instruction)[^>]*>[\s\S]*?<\/(?:prompt|system|context|instruction)>/gi;

export function sanitizeTraceText(text: string): string {
  if (!text) return '';
  let sanitized = text.replace(PROMPT_PATTERN, '');
  sanitized = sanitized.replace(SECRET_PATTERN, '[redacted]');
  sanitized = sanitized.replace(COORD_PATTERN, '[location]');
  return sanitized.trim();
}

export function formatStepDuration(durationMs?: number): string {
  if (durationMs == null || durationMs < 0) return '';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function formatCompactRunSummary(run: AgentTraceRun): string {
  if (run.status === 'cancelled') {
    return 'Request cancelled';
  }

  // Check if places search was performed
  const placesStep = run.steps.find((s) => s.kind === 'places' && s.status === 'finished');
  let placesPart: string | null = null;
  if (placesStep) {
    const match = placesStep.summary.match(/(\d+)\s+places/i);
    placesPart = match ? `Searched ${match[1]} places` : 'Searched nearby places';
  }

  // Check if model reasoning was live and successful
  const modelSteps = run.steps.filter((s) => s.kind === 'model');
  const liveModelStep = modelSteps.find(
    (s) =>
      s.status === 'finished' &&
      (s.badge === 'live' || s.badge === 'Meta Muse Spark' || s.summary.includes('live') || s.summary.includes('Muse Spark')) &&
      !s.summary.toLowerCase().includes('fallback') &&
      !s.summary.toLowerCase().includes('offline') &&
      !s.summary.toLowerCase().includes('locally')
  );
  const engineLabelLower = (run.engineLabel || '').toLowerCase();
  const engineIsLive =
    (engineLabelLower.includes('muse spark') || engineLabelLower.includes('live')) &&
    !engineLabelLower.includes('fallback') &&
    !engineLabelLower.includes('offline') &&
    !engineLabelLower.includes('locally');

  const modelIsLive = Boolean(liveModelStep || engineIsLive);

  if (placesPart) {
    if (modelIsLive) {
      return `${placesPart} · ranked by Meta Muse Spark`;
    }
    return `${placesPart} · planned locally`;
  }

  if (modelIsLive) {
    return 'Ranked by Meta Muse Spark';
  }

  return 'Planned locally';
}

export function formatRunSummary(run: AgentTraceRun): string {
  return formatCompactRunSummary(run);
}

export class AgentTraceBus {
  private runs = new Map<string, AgentTraceRun>();
  private activeRunId: string | null = null;
  private listeners = new Set<AgentTraceListener>();

  public startRun(runId: string = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`): AgentTraceRun {
    const run: AgentTraceRun = {
      id: runId,
      startedAt: nowMonotonicMs(),
      status: 'in_flight',
      steps: [],
    };
    this.runs.set(runId, run);
    this.activeRunId = runId;
    this.notify(run);
    return run;
  }

  public getActiveRun(): AgentTraceRun | undefined {
    return this.activeRunId ? this.runs.get(this.activeRunId) : undefined;
  }

  public getRun(runId: string): AgentTraceRun | undefined {
    return this.runs.get(runId);
  }

  public startStep(
    runId: string,
    kind: TracePhaseKind,
    phase: string,
    initialSummary: string = 'In progress…',
    badge?: string
  ): AgentTraceStep {
    const run = this.runs.get(runId);
    const step: AgentTraceStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      runId,
      phase: sanitizeTraceText(phase),
      kind,
      status: 'started',
      startedAt: nowMonotonicMs(),
      summary: sanitizeTraceText(initialSummary),
      badge: badge ? sanitizeTraceText(badge) : undefined,
    };
    if (run) {
      run.steps.push(step);
      this.notify(run);
    }
    return step;
  }

  public finishStep(
    stepId: string,
    summary?: string,
    badge?: string
  ): AgentTraceStep | undefined {
    const step = this.findStep(stepId);
    if (!step) return undefined;
    step.status = 'finished';
    step.endedAt = nowMonotonicMs();
    step.durationMs = Math.max(0, Math.round(step.endedAt - step.startedAt));
    if (summary) step.summary = sanitizeTraceText(summary);
    if (badge) step.badge = sanitizeTraceText(badge);
    const run = this.runs.get(step.runId);
    if (run) this.notify(run);
    return step;
  }

  public failStep(
    stepId: string,
    errorSummary: string,
    badge?: string
  ): AgentTraceStep | undefined {
    const step = this.findStep(stepId);
    if (!step) return undefined;
    step.status = 'failed';
    step.endedAt = nowMonotonicMs();
    step.durationMs = Math.max(0, Math.round(step.endedAt - step.startedAt));
    const safeError = sanitizeTraceText(errorSummary);
    step.summary = safeError;
    step.error = safeError;
    if (badge) step.badge = sanitizeTraceText(badge);
    const run = this.runs.get(step.runId);
    if (run) this.notify(run);
    return step;
  }

  public skipStep(stepId: string, summary: string): AgentTraceStep | undefined {
    const step = this.findStep(stepId);
    if (!step) return undefined;
    step.status = 'skipped';
    step.endedAt = nowMonotonicMs();
    step.durationMs = undefined;
    step.summary = sanitizeTraceText(summary);
    step.badge = undefined;
    const run = this.runs.get(step.runId);
    if (run) this.notify(run);
    return step;
  }

  public cancelRun(runId: string, summary: string = 'Cancelled'): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'in_flight') return;
    run.status = 'cancelled';
    run.endedAt = nowMonotonicMs();
    run.totalDurationMs = Math.max(0, Math.round(run.endedAt - run.startedAt));
    for (const step of run.steps) {
      if (step.status === 'started') {
        step.status = 'cancelled';
        step.endedAt = run.endedAt;
        step.durationMs = Math.max(0, Math.round(step.endedAt - step.startedAt));
        step.summary = sanitizeTraceText(summary);
      }
    }
    if (this.activeRunId === runId) {
      this.activeRunId = null;
    }
    this.notify(run);
  }

  public completeRun(
    runId: string,
    engineLabel?: string,
    topPick?: AgentTraceLunchCard
  ): AgentTraceRun | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.status = 'completed';
    run.endedAt = nowMonotonicMs();
    run.totalDurationMs = Math.max(0, Math.round(run.endedAt - run.startedAt));
    if (engineLabel) run.engineLabel = sanitizeTraceText(engineLabel);
    if (topPick) run.topPick = topPick;
    if (this.activeRunId === runId) {
      this.activeRunId = null;
    }
    this.notify(run);
    return run;
  }

  public failRun(runId: string, engineLabel?: string): AgentTraceRun | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    run.status = 'failed';
    run.endedAt = nowMonotonicMs();
    run.totalDurationMs = Math.max(0, Math.round(run.endedAt - run.startedAt));
    if (engineLabel) run.engineLabel = sanitizeTraceText(engineLabel);
    if (this.activeRunId === runId) {
      this.activeRunId = null;
    }
    this.notify(run);
    return run;
  }

  public subscribe(listener: AgentTraceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear(): void {
    this.runs.clear();
    this.activeRunId = null;
  }

  private findStep(stepId: string): AgentTraceStep | undefined {
    for (const run of this.runs.values()) {
      const step = run.steps.find((s) => s.id === stepId);
      if (step) return step;
    }
    return undefined;
  }

  private notify(run: AgentTraceRun): void {
    for (const listener of this.listeners) {
      try {
        listener(run);
      } catch {
        // ignore subscriber exceptions
      }
    }
  }
}

export const agentTrace = new AgentTraceBus();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTraceStepMarker(status: TraceStatus): string {
  if (status === 'finished') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5L6.5 12L13 4" stroke="#1F7A4D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (status === 'failed') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" stroke="#C53030" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (status === 'cancelled') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 8H12" stroke="#586B64" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (status === 'skipped') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="4.5" stroke="#8A9992" stroke-width="1.6" stroke-dasharray="2 2"/></svg>`;
  }
  // status === 'started'
  return `<span class="trace-compact-dot" aria-hidden="true"></span>`;
}

export function getCompactStepIcon(kind: TracePhaseKind, status: TraceStatus): string {
  if (status === 'started') {
    return `<span class="trace-compact-dot" aria-hidden="true"></span>`;
  }
  if (status === 'failed') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="#C53030" stroke-width="1.6"/><path d="M5.5 8h5" stroke="#C53030" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  }
  if (status === 'cancelled') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 8H12" stroke="#586B64" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (status === 'skipped') {
    return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="4.5" stroke="#8A9992" stroke-width="1.6" stroke-dasharray="2 2"/></svg>`;
  }
  switch (kind) {
    case 'permission':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l5.5 2.5v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7V4l5.5-2.5z" stroke="currentColor" stroke-width="1.5"/></svg>`;
    case 'location':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" stroke-width="1.5"/></svg>`;
    case 'places':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 5.5l1.5-3.5h8l1.5 3.5v7.5H2.5V5.5zM2.5 5.5h11M6 13V9h4v4" stroke="currentColor" stroke-width="1.5"/></svg>`;
    case 'model':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6L8 1.5z" stroke="currentColor" stroke-width="1.5"/></svg>`;
    case 'fact_check':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'render':
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'local':
    default:
      return `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>`;
  }
}

export function getCompactStepText(step: AgentTraceStep): string {
  const isStarted = step.status === 'started';
  const isFailed = step.status === 'failed';
  const isSkipped = step.status === 'skipped';
  const summaryLower = (step.summary || '').toLowerCase();

  switch (step.kind) {
    case 'permission': {
      if (isStarted) return 'Asking for your location…';
      if (isFailed) return 'Location permission denied';
      if (isSkipped) return 'Location permission skipped';
      return 'Location permission granted';
    }
    case 'location': {
      if (isStarted) return 'Acquiring location…';
      if (isFailed) return "Couldn't acquire location";
      if (isSkipped) return 'Location skipped';
      return step.summary || 'Location acquired';
    }
    case 'places': {
      if (isStarted) return 'Searching places near you…';
      if (isSkipped) {
        if (summaryLower.includes('disabled')) return 'Places search skipped (service disabled)';
        if (summaryLower.includes('unavailable')) return 'Places search skipped (location unavailable)';
        return 'Places search skipped';
      }
      if (isFailed) return "Couldn't reach places service";
      const match = step.summary.match(/(\d+)\s+places\s+found\s+via\s+(.+)/i);
      if (match) {
        return `Found ${match[1]} places via ${match[2]}`;
      }
      const matchSimple = step.summary.match(/(\d+)\s+places\s+found/i);
      if (matchSimple) {
        return `Found ${matchSimple[1]} places near you`;
      }
      if (summaryLower.includes('cached')) {
        return 'Found places from cache';
      }
      return step.summary || 'Found places near you';
    }
    case 'model': {
      const isCandidatePhase = step.phase.toLowerCase().includes('candidate');
      if (isStarted) {
        return isCandidatePhase ? 'Ranking with Meta Muse Spark…' : 'Reasoning with Meta Muse Spark…';
      }
      const isFallback = isFailed || summaryLower.includes('fallback') || step.badge === 'offline';
      if (isFallback) {
        if (summaryLower.includes('timeout')) {
          return "Muse Spark didn't answer in time, used local ranking";
        }
        if (summaryLower.includes('offline') || step.badge === 'offline' || summaryLower.includes('local')) {
          return 'Planned locally';
        }
        return "Couldn't reach Muse Spark, used local ranking";
      }
      return isCandidatePhase ? 'Ranked by Meta Muse Spark' : 'Reasoned with Meta Muse Spark';
    }
    case 'fact_check': {
      if (isStarted) return 'Checking the reply against the facts…';
      if (isFailed) return 'Fact check adjusted reply';
      return 'Checked against the facts';
    }
    case 'render': {
      if (isStarted) return 'Preparing answer…';
      return step.phase || 'Answer presentation';
    }
    case 'local':
    default: {
      if (isStarted) return 'Planning locally…';
      if (step.phase.toLowerCase().includes('grammar')) {
        return 'Grammar match';
      }
      return step.summary || 'Planned locally';
    }
  }
}

export function renderTraceStepsHtml(steps: readonly AgentTraceStep[], isRunning: boolean = false): string {
  if (!steps || steps.length === 0) return '';
  return steps
    .map((step) => {
      const isCurrentRunning = isRunning && step.status === 'started';
      const icon = getCompactStepIcon(step.kind, step.status);
      const text = getCompactStepText(step);
      // Durations appear only in the expanded view, small and muted
      const durText = !isRunning && step.durationMs != null ? formatStepDuration(step.durationMs) : '';
      const durationHtml = durText ? `<span class="trace-compact-duration trace-step-duration">${durText}</span>` : '';
      const runningClass = isCurrentRunning ? 'is-running' : '';
      const textIdAttr = isCurrentRunning ? 'id="inflight-status-text"' : '';
      const textClass = isCurrentRunning ? 'trace-compact-text trace-shimmer' : 'trace-compact-text';

      return `
      <div class="trace-compact-line trace-step-item is-${step.status} ${runningClass}" data-kind="${step.kind}">
        <span class="trace-compact-icon trace-step-marker" aria-hidden="true">${icon}</span>
        <span class="${textClass}" ${textIdAttr}>${escapeHtml(text)}</span>
        ${durationHtml}
      </div>
    `;
    })
    .join('');
}

export function renderTraceSummaryToggleHtml(arg1: string | AgentTraceRun, arg2?: AgentTraceRun): string {
  const msgId = typeof arg1 === 'string' ? arg1 : 'msg-1';
  const run = typeof arg1 === 'string' ? arg2! : arg1;
  const summaryText = formatCompactRunSummary(run);
  return `
    <div class="trace-summary-container trace-compact-container">
      <button
        type="button"
        class="trace-summary-toggle trace-compact-summary-toggle"
        id="btn-trace-toggle-${escapeHtml(msgId)}"
        data-trace-toggle="${escapeHtml(msgId)}"
        aria-expanded="false"
        aria-controls="trace-details-${escapeHtml(msgId)}"
      >
        <span class="trace-summary-icon trace-compact-summary-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5v7M4.5 8h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </span>
        <span class="trace-summary-text trace-compact-summary-text">${escapeHtml(summaryText)}</span>
        <span class="trace-summary-chevron trace-compact-chevron" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <div class="trace-details trace-compact-details" id="trace-details-${escapeHtml(msgId)}" hidden>
        <div class="trace-timeline trace-compact-lines" role="region" aria-label="Agent execution trace">
          ${renderTraceStepsHtml(run.steps, false)}
        </div>
      </div>
    </div>
  `;
}

export function renderLunchCardHtml(card: AgentTraceLunchCard): string {
  const metaItems: string[] = [];
  if (card.straightLineDistanceLabel) {
    metaItems.push(`<span class="chat-result-dist">${escapeHtml(card.straightLineDistanceLabel)}</span>`);
  }
  if (card.openingStatus) {
    const raw = card.openingStatus;
    const isOpen = raw === 'open' || raw.toLowerCase().startsWith('open');
    const isClosed = raw === 'closed' || raw.toLowerCase().startsWith('closed');
    const statusLabel = raw === 'open' ? 'Open now' : raw === 'closed' ? 'Closed' : raw;
    metaItems.push(`<span class="chat-result-open ${isOpen ? 'is-open' : isClosed ? 'is-closed' : ''}">${escapeHtml(statusLabel)}</span>`);
  }
  if (typeof card.rating === 'number') {
    const countPart = typeof card.userRatingCount === 'number' ? ` (${card.userRatingCount.toLocaleString()})` : '';
    metaItems.push(`<span class="chat-result-rating" aria-label="Rated ${card.rating.toFixed(1)} out of 5">★ ${card.rating.toFixed(1)}${countPart}</span>`);
  }
  if (typeof card.priceLevel === 'number' && card.priceLevel > 0) {
    const priceSymbols = '$'.repeat(Math.min(4, Math.max(1, card.priceLevel)));
    metaItems.push(`<span class="chat-result-price" aria-label="Price level ${card.priceLevel}">${priceSymbols}</span>`);
  } else if (typeof card.priceLevel === 'string' && card.priceLevel) {
    metaItems.push(`<span class="chat-result-price">${escapeHtml(card.priceLevel)}</span>`);
  }
  if (card.cuisine) {
    metaItems.push(`<span class="chat-result-cuisine">${escapeHtml(card.cuisine)}</span>`);
  }
  if (card.noiseLevel) {
    metaItems.push(`<span class="chat-result-noise">${escapeHtml(card.noiseLevel)}</span>`);
  }

  const photoHtml = card.photoUrl
    ? `
    <div class="chat-result-photo-wrap">
      <img class="chat-result-photo" src="${escapeHtml(card.photoUrl)}" alt="${escapeHtml(card.name)}" loading="lazy" />
      ${card.photoAttribution ? `<span class="chat-result-photo-attr">${escapeHtml(card.photoAttribution)}</span>` : ''}
    </div>
  `
    : '';

  return `
    <div class="chat-result-card" data-testid="chat-result-card">
      <div class="chat-result-card-header">
        <span class="chat-result-badge">Top Recommendation</span>
        ${card.attribution ? `<span class="chat-result-attribution">${escapeHtml(card.attribution)}</span>` : ''}
      </div>
      <div class="chat-result-main">
        ${photoHtml}
        <div class="chat-result-info">
          <h4 class="chat-result-name">${escapeHtml(card.name)}</h4>
          ${metaItems.length > 0 ? `<div class="chat-result-meta-row">${metaItems.join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}
