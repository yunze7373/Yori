import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentTraceBus,
  sanitizeTraceText,
  renderTraceStepsHtml,
  renderTraceSummaryToggleHtml,
  renderLunchCardHtml,
  type AgentTraceRun,
  type AgentTraceLunchCard,
} from '../../src/ui/conversation/agent-trace.js';
import { extractLunchCard, createActionStateStore } from '../../src/ui/action-state/store.js';

describe('AgentTraceBus Lifecycle', () => {
  let bus: AgentTraceBus;

  beforeEach(() => {
    bus = new AgentTraceBus();
  });

  it('manages run and step lifecycle correctly', () => {
    const notifySpy = vi.fn();
    bus.subscribe(notifySpy);

    const run = bus.startRun('req-1');
    expect(run.id).toBe('req-1');
    expect(run.status).toBe('in_flight');
    expect(run.steps).toHaveLength(0);
    expect(bus.getActiveRun()).toBe(run);
    expect(notifySpy).toHaveBeenCalledWith(run);

    const step1 = bus.startStep(run.id, 'permission', 'Location permission', 'Checking browser permission…', 'live');
    expect(step1.status).toBe('started');
    expect(step1.kind).toBe('permission');
    expect(step1.phase).toBe('Location permission');
    expect(run.steps).toHaveLength(1);

    const finishedStep1 = bus.finishStep(step1.id, 'Permission granted', 'live');
    expect(finishedStep1?.status).toBe('finished');
    expect(finishedStep1?.summary).toBe('Permission granted');
    expect(typeof finishedStep1?.durationMs).toBe('number');
    expect(finishedStep1!.durationMs).toBeGreaterThanOrEqual(0);

    const step2 = bus.startStep(run.id, 'places', 'Places search', 'Searching nearby dining…', 'live');
    bus.failStep(step2.id, 'Places provider unavailable');
    expect(step2.status).toBe('failed');
    expect(step2.summary).toBe('Places provider unavailable');

    bus.failRun(run.id, 'failed');
    expect(run.status).toBe('failed');
    expect(typeof run.endedAt).toBe('number');
    expect(typeof run.totalDurationMs).toBe('number');
    expect(run.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(bus.getActiveRun()).toBeUndefined();
  });

  it('cancels active run and running steps when user cancels', () => {
    const run = bus.startRun('req-cancel');
    const step = bus.startStep(run.id, 'model', 'Model reasoning', 'Generating recommendation…', 'live');

    bus.cancelRun(run.id);

    expect(run.status).toBe('cancelled');
    expect(step.status).toBe('cancelled');
    expect(step.summary).toContain('Cancelled');
    expect(bus.getActiveRun()).toBeUndefined();
  });
});

describe('Trace Privacy Sanitizer', () => {
  it('redacts raw GPS coordinates to prevent precise location leakage', () => {
    const textWithCoords = 'Fix acquired at 35.689487, 139.691706 accuracy 10m';
    const sanitized = sanitizeTraceText(textWithCoords);
    expect(sanitized).not.toContain('35.689487');
    expect(sanitized).not.toContain('139.691706');
    expect(sanitized).toContain('[location]');
  });

  it('redacts Bearer tokens and API keys', () => {
    const textWithToken = 'Calling provider with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const sanitizedToken = sanitizeTraceText(textWithToken);
    expect(sanitizedToken).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sanitizedToken).toContain('[redacted]');

    const textWithApiKey = 'Initialized key AIzaSyD3x9AbCdEfGhIjKlMnOpQrStUvWxYz';
    const sanitizedApiKey = sanitizeTraceText(textWithApiKey);
    expect(sanitizedApiKey).not.toContain('AIzaSyD3x9AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(sanitizedApiKey).toContain('[redacted]');
  });

  it('strips prompt markers and CoT internal markers', () => {
    const textWithPrompt = '<prompt>You are Yori, system instructions...</prompt> Processing user query';
    const sanitized = sanitizeTraceText(textWithPrompt);
    expect(sanitized).not.toContain('<prompt>');
    expect(sanitized).not.toContain('</prompt>');
    expect(sanitized).not.toContain('system instructions');
    expect(sanitized).toContain('Processing user query');
  });
});

describe('Top Pick Lunch Card Extraction', () => {
  it('extracts real candidate fields truthfully without hallucination', () => {
    const candidate = {
      name: 'Shin Udon',
      straightLineDistanceLabel: '320m',
      openingStatus: 'Open now · closes 22:00',
      rating: 4.6,
      userRatingCount: 840,
      priceLevel: '¥¥',
      cuisine: 'Udon / Noodle',
      attribution: 'OpenStreetMap contributors',
      noiseLevel: 'Lively',
    };

    const card = extractLunchCard(candidate);
    expect(card).toBeDefined();
    expect(card?.name).toBe('Shin Udon');
    expect(card?.straightLineDistanceLabel).toBe('320m');
    expect(card?.openingStatus).toBe('Open now · closes 22:00');
    expect(card?.rating).toBe(4.6);
    expect(card?.userRatingCount).toBe(840);
    expect(card?.priceLevel).toBe('¥¥');
    expect(card?.cuisine).toBe('Udon / Noodle');
    expect(card?.attribution).toBe('OpenStreetMap contributors');
    expect(card?.noiseLevel).toBe('Lively');
  });

  it('handles partial fields gracefully and preserves missing fields as undefined', () => {
    const minimalCandidate = {
      label: 'Quiet Cafe',
    };

    const card = extractLunchCard(minimalCandidate);
    expect(card).toBeDefined();
    expect(card?.name).toBe('Quiet Cafe');
    expect(card?.rating).toBeUndefined();
    expect(card?.photoUrl).toBeUndefined();
    expect(card?.priceLevel).toBeUndefined();
  });

  it('returns undefined for non-object inputs', () => {
    expect(extractLunchCard(null)).toBeUndefined();
    expect(extractLunchCard(undefined)).toBeUndefined();
    expect(extractLunchCard('string')).toBeUndefined();
  });
});

describe('HTML Trace & Card Rendering', () => {
  it('renders compact trace steps with semantic icons and natural text', () => {
    const steps = [
      {
        id: 's1',
        runId: 'r1',
        phase: 'Grammar match',
        kind: 'local' as const,
        status: 'finished' as const,
        startedAt: 100,
        endedAt: 110,
        durationMs: 10,
        summary: 'Matched rule FIND_LUNCH',
        badge: 'offline',
      },
      {
        id: 's2',
        runId: 'r1',
        phase: 'Grounding check',
        kind: 'fact_check' as const,
        status: 'finished' as const,
        startedAt: 110,
        endedAt: 118,
        durationMs: 8,
        summary: 'Validated reply against facts',
        badge: 'offline',
      },
    ];

    const html = renderTraceStepsHtml(steps);
    expect(html).toContain('trace-compact-line');
    expect(html).toContain('trace-step-item');
    expect(html).toContain('Grammar match');
    expect(html).toContain('Checked against the facts');
    expect(html).toContain('10 ms');
    expect(html).toContain('8 ms');
  });

  it('renders expandable compact trace summary toggle button', () => {
    const run: AgentTraceRun = {
      id: 'r2',
      status: 'completed',
      startedAt: 1000,
      endedAt: 1240,
      totalDurationMs: 240,
      engineLabel: 'Meta Muse Spark · live',
      steps: [
        {
          id: 'st1',
          runId: 'r2',
          phase: 'Candidate reasoning',
          kind: 'model',
          status: 'finished',
          startedAt: 1000,
          endedAt: 1200,
          durationMs: 200,
          summary: 'Ranked candidates',
          badge: 'live',
        },
      ],
    };

    const toggleHtml = renderTraceSummaryToggleHtml(run);
    expect(toggleHtml).toContain('trace-summary-toggle');
    expect(toggleHtml).toContain('trace-compact-summary-toggle');
    expect(toggleHtml).toContain('aria-expanded="false"');
    expect(toggleHtml).toContain('Ranked by Meta Muse Spark');
  });

  it('renders lunch result card with valid semantic fields', () => {
    const card: AgentTraceLunchCard = {
      name: 'Ramen Ichiran',
      straightLineDistanceLabel: '250m',
      openingStatus: 'Open now',
      rating: 4.5,
      userRatingCount: 1200,
      priceLevel: '¥¥',
      cuisine: 'Tonkotsu Ramen',
      attribution: 'Google Places',
    };

    const cardHtml = renderLunchCardHtml(card);
    expect(cardHtml).toContain('chat-result-card');
    expect(cardHtml).toContain('Ramen Ichiran');
    expect(cardHtml).toContain('250m');
    expect(cardHtml).toContain('Open now');
    expect(cardHtml).toContain('4.5');
    expect(cardHtml).toContain('1,200');
    expect(cardHtml).toContain('Tonkotsu Ramen');
    expect(cardHtml).toContain('Google Places');
  });
});

describe('Store & Trace Integration', () => {
  it('records truthful offline trace steps when submitting message in offline mode', () => {
    const bus = new AgentTraceBus();
    const store = createActionStateStore({ traceBus: bus });

    store.submitMessage('Leave 15m later');

    const transcript = store.getTranscript();
    expect(transcript.length).toBeGreaterThanOrEqual(2);

    const assistantMsg = transcript.find(m => m.sender === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.traceRun).toBeDefined();

    const trace = assistantMsg!.traceRun!;
    expect(trace.status).toBe('completed');
    expect(trace.engineLabel).toBe('Local plan · deterministic');
    expect(trace.steps.length).toBe(2);

    const phases = trace.steps.map(s => s.phase);
    expect(phases).toContain('Grammar match');
    expect(phases).toContain('Answer presentation');
    expect(phases).not.toContain('Grounding check');

    for (const step of trace.steps) {
      expect(step.status).toBe('finished');
      expect(step.badge).toBe('offline');
      expect(typeof step.durationMs).toBe('number');
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('cancels trace run when in-flight execution is cancelled', () => {
    const bus = new AgentTraceBus();
    const store = createActionStateStore({ traceBus: bus });

    const run = bus.startRun('req-inflight');
    bus.startStep(run.id, 'model', 'Model reasoning', 'Generating recommendation…', 'live');

    store.cancelInFlight();

    expect(run.status).toBe('cancelled');
    expect(run.steps[0]?.status).toBe('cancelled');
  });
});

