/**
 * Model Proxy Boundary Contract & Budget Tests (S5-LIVE-REASON)
 * Governed by LIVE_FIRST Plan S5 (docs/architecture/LIVE_FIRST.plan.json).
 *
 * Acceptance Criteria:
 * 1. Budget tests prove 0 network calls while approval flag is off (MODEL_LIVE_ENABLED=false/unset).
 * 2. Cap is enforced:
 *    - Per-run cap <= 10 calls.
 *    - Lifetime ledger cap <= 50 calls (max 10 further calls from current ledger, total <= 32/50).
 *    - Fallback to labelled deterministic grammar on cap exhaustion or failure.
 * 3. Fact post-check discards uncited outputs:
 *    - Discards outputs with unlisted signal IDs, unconfirmed fact keys, invented times/places.
 *    - Every live output must strictly pass fact post-check; uncited output is discarded to grammar with label shown.
 * 4. Zero agent inspection or logging of secrets (never log or return secret key).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  ModelDevProxy,
  createModelProxyMiddleware,
  resetLedger,
  readLedgerState,
  resetProcessLiveCallCount,
  getProcessLiveCallCount,
  MODEL_LIFETIME_MAX_CALLS,
  MODEL_PER_RUN_MAX_CALLS,
} from '../../src/adapters/model/server-proxy.js';
import {
  ModelCommandInterpreter,
} from '../../src/ui/conversation/model-interpreter.js';
import {
  coordinateReasoning,
} from '../../src/app/reasoning-coordinator.js';
import {
  DecisionLogger,
  ENGINE_STATUS_LABELS,
} from '../../src/adapters/model/decision-log.js';
import {
  createSimulatedSignal,
  type PreparedPlan,
  type ContextSnapshot,
  type LivingContext,
} from '../../src/core/contracts/index.js';
import type { ReasoningInput } from '../../src/adapters/model/reasoning.js';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function createMockReqRes(url: string, method: string = 'GET', bodyObj?: any) {
  const bodyStr = bodyObj !== undefined ? JSON.stringify(bodyObj) : '';
  const req: any = {
    url,
    method,
    headers: {
      host: '127.0.0.1:5173',
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5173',
      referer: 'http://127.0.0.1:5173/',
    },
    on: (event: string, handler: (...args: any[]) => void) => {
      if (event === 'data' && bodyStr) {
        handler(Buffer.from(bodyStr));
      }
      if (event === 'end') {
        handler();
      }
    },
  };

  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
  };

  const res: any = {
    setHeader: vi.fn((k: string, v: string) => {
      response.headers[k.toLowerCase()] = v;
    }),
    end: vi.fn((data?: string) => {
      if (data) response.body = data;
    }),
  };

  Object.defineProperty(res, 'statusCode', {
    get: () => response.statusCode,
    set: (val: number) => {
      response.statusCode = val;
    },
  });

  const next = vi.fn();
  return { req, res, next, response };
}

describe('S5-LIVE-REASON: Model Proxy Boundary & Budget Hard Gates', () => {
  const originalEnv = { ...process.env };
  const tempDir = path.join(os.tmpdir(), `yori-s5-budget-${Date.now()}`);
  const testLedgerPath = path.join(tempDir, 'test-ledger.json');
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_LIFETIME_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_LIVE_LEDGER_PATH'];

    resetProcessLiveCallCount();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    resetLedger(testLedgerPath);
    process.env.MODEL_LIVE_LEDGER_PATH = testLedgerPath;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    try {
      resetLedger(testLedgerPath);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // Gate 1: Zero network calls while approval flag is OFF
  // =========================================================================
  describe('Gate 1: Zero network calls while approval flag is OFF (MODEL_LIVE_ENABLED!=1)', () => {
    it('diagnostics report disabled when key is present but MODEL_LIVE_ENABLED is off', () => {
      process.env.MODEL_API_KEY = 'sk-mock-key-secret';
      process.env.MODEL_LIVE_ENABLED = '0'; // Explicitly OFF

      const proxy = new ModelDevProxy();
      const diag = proxy.getDiagnostics();

      expect(diag.status).toBe('disabled');
      expect(diag.message).toContain('live disabled (MODEL_LIVE_ENABLED!=1)');
      expect(diag.keySource).toBe('MODEL_API_KEY');
      // Invariant: Key value NEVER exposed
      expect(diag.message).not.toContain('sk-mock-key-secret');
    });

    it('proves exactly 0 network calls on /api/model/reason while flag is off', async () => {
      process.env.MODEL_API_KEY = 'sk-mock-key-secret';
      process.env.MODEL_LIVE_ENABLED = '0';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy();
      const middleware = createModelProxyMiddleware(proxy);

      const reasoningPayload: ReasoningInput = {
        candidates: [
          {
            id: 'plan-lunch-1',
            intentId: 'lunch',
            confidence: 1.0,
            places: ['Hayes Valley Ramen'],
            times: ['12:15 PM'],
            citedSignalIds: ['places_lunch:2026-11-02T12:00:00Z'],
            citedFactKeys: ['taste_lunch_japanese'],
          },
          {
            id: 'plan-depart-1',
            intentId: 'depart',
            confidence: 1.0,
            places: ['Downtown Office'],
            times: ['2:25 PM'],
            citedSignalIds: ['calendar:2026-11-02T14:30:00Z'],
            citedFactKeys: [],
          },
        ],
        availableSignalIds: ['places_lunch:2026-11-02T12:00:00Z', 'calendar:2026-11-02T14:30:00Z'],
        confirmedFactKeys: ['taste_lunch_japanese'],
      };

      const { req, res, response } = createMockReqRes('/api/model/reason', 'POST', reasoningPayload);
      await middleware(req, res, () => {});

      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.usedFallback).toBe(true);
      expect(parsed.fallbackReason).toBe('disabled');
      expect(parsed.engineStatus).toBe('offline_deterministic');
      expect(parsed.result.orderedPlanIds).toEqual(['plan-lunch-1', 'plan-depart-1']);

      // Hard gate check: 0 network calls!
      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(getProcessLiveCallCount()).toBe(0);
    });

    it('proves exactly 0 network calls on /api/model/command while flag is off', async () => {
      process.env.MODEL_API_KEY = 'sk-mock-key-secret';
      process.env.MODEL_LIVE_ENABLED = 'false';

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy();
      const middleware = createModelProxyMiddleware(proxy);

      const commandPayload = {
        templateId: 'decision_command',
        facts: {
          utterance: 'Leave 15 minutes later',
          availableModes: ['drive', 'bus'],
          availableSignalIds: ['calendar:2026-11-02T14:30:00Z'],
          knownFactKeys: ['prep_buffer_minutes'],
          confirmedFactKeys: ['prep_buffer_minutes'],
          validTimes: ['2:25 PM', '2:40 PM'],
          validPlaces: ['Office'],
        },
      };

      const { req, res, response } = createMockReqRes('/api/model/command', 'POST', commandPayload);
      await middleware(req, res, () => {});

      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.usedFallback).toBe(true);
      expect(parsed.fallbackReason).toBe('disabled');
      expect(parsed.engineStatus).toBe('offline_deterministic');
      expect(parsed.result).toBeNull();

      // Hard gate check: 0 network calls!
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it('proves coordinateReasoning falls back to deterministic grammar with labelled status and 0 network calls', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      const logger = new DecisionLogger();
      const samplePlan: PreparedPlan = {
        id: 'plan-lunch-hayes',
        intentId: 'lunch',
        headline: 'Hayes Valley Ramen: 450 m walk',
        optionsOrSteps: [],
        subjectTitle: 'Hayes Valley Ramen',
        apptAt: '12:15 PM',
        leaveAt: '12:05 PM',
        requiresConfirmation: false,
        createdAt: '2026-11-02T12:00:00Z',
        why: {
          derivation: 'Nearby matching Ramen',
          evidenceSignals: [
            {
              kind: 'location',
              source: 'simulated',
              issuedAt: '2026-11-02T12:00:00Z',
            },
          ],
          memoryFactsUsed: [],
        },
      };

      const locSignal = createSimulatedSignal({
        kind: 'location',
        value: { currentArea: 'Hayes Valley' },
        issuedAt: '2026-11-02T12:00:00Z',
        validFor: 3600_000,
        confidence: 1.0,
        consentScope: 'local_only',
      });

      const snapshot: ContextSnapshot = {
        id: 'snap-1',
        asOf: '2026-11-02T12:00:00Z',
        timezone: 'America/Los_Angeles',
        signals: [locSignal],
      };

      const living: LivingContext = {
        asOf: '2026-11-02T12:00:00Z',
        now: samplePlan,
        ahead: [],
        forYou: [],
      };

      // Mock endpoint returning disabled fallback
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          result: { orderedPlanIds: ['plan-lunch-hayes'], rationale: [] },
          usedFallback: true,
          fallbackReason: 'disabled',
          engineStatus: 'offline_deterministic',
        }),
      });

      const res = await coordinateReasoning(living, snapshot, [], {
        fetchFn: mockFetchFn as any,
        decisionLogger: logger,
      });

      expect(res.applied).toBe(false);
      expect(res.fallbackReason).toBe('disabled');
      expect(res.engineStatus).toBe('offline_deterministic');
      expect(res.now?.id).toBe('plan-lunch-hayes');

      // Decision log carries offline_deterministic and latency
      const latest = logger.getLatest();
      expect(latest).toBeDefined();
      expect(latest?.engineStatus).toBe('offline_deterministic');
      expect(typeof latest?.latencyMs).toBe('number');
      expect(latest?.validationResult.valid).toBe(false);
      expect(logger.getEngineStatusLabel()).toBe(ENGINE_STATUS_LABELS.offline_deterministic);
    });
  });

  // =========================================================================
  // Gate 2: Call Cap Enforcement (Per-Run <= 10, Lifetime <= 50, S5 remaining <= 10)
  // =========================================================================
  describe('Gate 2: Call Cap Enforcement (Lifetime <= 50, Per-Run <= 10)', () => {
    it('enforces lifetime ledger cap: blocks dispatches when ledger reaches lifetimeMaxCalls', async () => {
      // Seed ledger at lifetimeMaxCalls = 5 for test isolation
      const proxy = new ModelDevProxy({
        apiKey: 'sk-test-key',
        liveEnabled: true,
        maxCalls: 10,
        lifetimeMaxCalls: 5,
        ledgerPath: testLedgerPath,
      });

      // Write 5 entries into test ledger
      const seededLedger = {
        version: 1,
        call_count: 5,
        reservations: [1, 2, 3, 4, 5].map(i => ({
          id: `seed-${i}`,
          timestamp: new Date().toISOString(),
          endpoint: 'reason_rank',
          callIndex: i,
        })),
      };
      fs.writeFileSync(testLedgerPath, JSON.stringify(seededLedger));

      const diag = proxy.getDiagnostics();
      expect(diag.status).toBe('disabled');
      expect(diag.message).toContain('lifetime call cap reached (5/5)');

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as any;

      const res = await proxy.handleReasoning({
        candidates: [
          {
            id: 'plan-1',
            intentId: 'lunch',
            confidence: 1.0,
            places: ['Ramen'],
            times: ['12:00 PM'],
            citedSignalIds: [],
            citedFactKeys: [],
          },
        ],
        availableSignalIds: [],
        confirmedFactKeys: [],
      });

      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(res.engineStatus).toBe('offline_deterministic');
      expect(fetchSpy).toHaveBeenCalledTimes(0);

      // Ledger count remained strictly 5
      const postState = readLedgerState(testLedgerPath);
      expect(postState.callCount).toBe(5);
    });

    it('enforces per-run cap (<= 10 calls): rejects 4th call when maxCalls is 3', async () => {
      const validSigId = 'places:2026-11-02T12:00:00Z';
      const mockFetchResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  orderedPlanIds: ['plan-1'],
                  rationale: [
                    {
                      planId: 'plan-1',
                      citedSignalIds: [validSigId],
                      citedFactKeys: ['fact_one'],
                      reasonCode: 'matches_confirmed_preference',
                    },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }),
      };

      const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(mockFetchResponse));
      globalThis.fetch = fetchSpy as any;

      // Create proxy with per-run cap = 3 for fast unit test
      const proxy = new ModelDevProxy({
        apiKey: 'sk-test-key',
        liveEnabled: true,
        maxCalls: 3,
        lifetimeMaxCalls: 50,
        ledgerPath: testLedgerPath,
      });

      const input: ReasoningInput = {
        candidates: [
          {
            id: 'plan-1',
            intentId: 'lunch',
            confidence: 1.0,
            places: ['Ramen'],
            times: ['12:00 PM'],
            citedSignalIds: [validSigId],
            citedFactKeys: ['fact_one'],
          },
        ],
        availableSignalIds: [validSigId],
        confirmedFactKeys: ['fact_one'],
      };

      // Calls 1, 2, 3 should succeed
      const res1 = await proxy.handleReasoning(input);
      expect(res1.usedFallback).toBe(false);
      expect(res1.engineStatus).toBe('meta_model_live');

      const res2 = await proxy.handleReasoning(input);
      expect(res2.usedFallback).toBe(false);

      const res3 = await proxy.handleReasoning(input);
      expect(res3.usedFallback).toBe(false);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(proxy.getCallCount()).toBe(3);

      // 4th call must be blocked by per-run cap (fallback to deterministic)
      const res4 = await proxy.handleReasoning(input);
      expect(res4.usedFallback).toBe(true);
      expect(res4.fallbackReason).toBe('disabled');
      expect(res4.engineStatus).toBe('offline_deterministic');

      // Zero 4th network fetch dispatched!
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('clamps MODEL_LIVE_MAX_CALLS to <= 10 (MODEL_PER_RUN_MAX_CALLS)', () => {
      expect(MODEL_PER_RUN_MAX_CALLS).toBe(10);
      expect(MODEL_LIFETIME_MAX_CALLS).toBe(50);

      // Attempting to set MODEL_LIVE_MAX_CALLS=25 is safely clamped to 10
      const proxy = new ModelDevProxy({
        maxCalls: 25,
      });
      expect(proxy.getConfig().maxCalls).toBe(10);
    });
  });

  // =========================================================================
  // Gate 3: Fact Post-Check Discards Uncited Claims (Hallucination Prevention)
  // =========================================================================
  describe('Gate 3: Fact Post-Check Discards Uncited Claims to Deterministic Grammar', () => {
    it('discards reasoning output citing unlisted signal ID to deterministic ranking with labelled fallback', async () => {
      const validSigId = 'places:2026-11-02T12:00:00Z';
      const unlistedSigId = 'places:2026-11-02T18:00:00Z';

      // Mock model API returning an uncited/hallucinated signal ID
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  orderedPlanIds: ['plan-lunch', 'plan-depart'],
                  rationale: [
                    {
                      planId: 'plan-lunch',
                      citedSignalIds: [unlistedSigId], // UNLISTED in availableSignalIds!
                      citedFactKeys: ['taste_ramen'],
                      reasonCode: 'matches_confirmed_preference',
                    },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy({
        apiKey: 'sk-test-key',
        liveEnabled: true,
        maxCalls: 10,
        lifetimeMaxCalls: 50,
        ledgerPath: testLedgerPath,
      });

      const res = await proxy.handleReasoning({
        candidates: [
          { id: 'plan-lunch', intentId: 'lunch', confidence: 1.0, places: ['Ramen'], times: ['12:00 PM'], citedSignalIds: [validSigId], citedFactKeys: ['taste_ramen'] },
          { id: 'plan-depart', intentId: 'depart', confidence: 1.0, places: ['Office'], times: ['2:00 PM'], citedSignalIds: ['calendar:2026-11-02T14:30:00Z'], citedFactKeys: [] },
        ],
        availableSignalIds: [validSigId, 'calendar:2026-11-02T14:30:00Z'], // unlistedSigId is absent
        confirmedFactKeys: ['taste_ramen'],
      });

      // Must be safely discarded!
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('unknown_signal_id');
      expect(res.engineStatus).toBe('offline_deterministic');
      // Deterministic order preserved
      expect(res.result.orderedPlanIds).toEqual(['plan-lunch', 'plan-depart']);
    });

    it('discards reasoning output citing unconfirmed fact key', async () => {
      const validSigId = 'places:2026-11-02T12:00:00Z';
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  orderedPlanIds: ['plan-lunch', 'plan-depart'],
                  rationale: [
                    {
                      planId: 'plan-lunch',
                      citedSignalIds: [validSigId],
                      citedFactKeys: ['unconfirmed_bias'], // NOT in confirmedFactKeys!
                      reasonCode: 'matches_confirmed_preference',
                    },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
      });
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy({
        apiKey: 'sk-test-key',
        liveEnabled: true,
        maxCalls: 10,
        lifetimeMaxCalls: 50,
        ledgerPath: testLedgerPath,
      });

      const res = await proxy.handleReasoning({
        candidates: [
          { id: 'plan-lunch', intentId: 'lunch', confidence: 1.0, places: ['Ramen'], times: ['12:00 PM'], citedSignalIds: [validSigId], citedFactKeys: [] },
          { id: 'plan-depart', intentId: 'depart', confidence: 1.0, places: ['Office'], times: ['2:00 PM'], citedSignalIds: [], citedFactKeys: [] },
        ],
        availableSignalIds: [validSigId],
        confirmedFactKeys: ['taste_ramen'], // 'unconfirmed_bias' absent
      });

      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('unknown_fact_key');
      expect(res.engineStatus).toBe('offline_deterministic');
    });

    it('discards command output citing invalid reason code or uncited signal ID', async () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: '/api/model/command',
        logger,
      });

      // Mock command endpoint returning uncited signal ID with a valid reason code
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            intent: 'LEAVE_LATER',
            slots: { deltaMinutes: 15 },
            situationAttribution: {
              signalId: 'weather:invented-rain-signal', // NOT IN availableSignalIds
              reasonCode: 'weather_adjusted',
            },
            citedSignalIds: ['weather:invented-rain-signal'],
            citedFactKeys: [],
            reasonCodes: ['weather_adjusted'],
          },
          usedFallback: false,
        }),
      }) as any;

      const result = await interpreter.interpretAsync('Can I leave later?', {
        availableModes: ['drive', 'bus'],
        availableSignalIds: ['calendar:2026-11-02T14:30:00Z'], // missing invented-rain-signal
      });

      // Fails closed to deterministic grammar
      expect(result.intent).toBe('LEAVE_LATER');
      expect(result.engineStatus).toBe('offline_deterministic');

      // Decision logger records the rejection
      const latest = logger.getLatest();
      expect(latest).toBeDefined();
      expect(latest?.engineStatus).toBe('offline_deterministic');
      expect(latest?.validationResult.valid).toBe(false);
      expect(latest?.validationResult.error).toContain('invented-rain-signal');
    });
  });

  // =========================================================================
  // Gate 4: Zero Secret Exposure (Credential Hygiene)
  // =========================================================================
  describe('Gate 4: Credential Hygiene & Zero Secret Exposure', () => {
    it('never prints or exposes secret API key in diagnostics, logs, or responses', async () => {
      const secret = 'sk-live-super-secret-meta-key-xyz123';
      const loggedMessages: string[] = [];
      const proxy = new ModelDevProxy(
        {
          apiKey: secret,
          keySource: 'MODEL_API_KEY',
          liveEnabled: false,
          ledgerPath: testLedgerPath,
        },
        msg => loggedMessages.push(msg)
      );

      const diag = proxy.getDiagnostics();
      const diagStr = JSON.stringify(diag);
      expect(diagStr).not.toContain(secret);
      expect(diag.keySource).toBe('MODEL_API_KEY');

      // Test HTTP response
      const middleware = createModelProxyMiddleware(proxy);
      const { req, res, response } = createMockReqRes('/api/model/diagnostics', 'GET');
      await middleware(req, res, () => {});

      expect(response.body).not.toContain(secret);

      // Verify internal logs never leaked the secret
      for (const msg of loggedMessages) {
        expect(msg).not.toContain(secret);
      }
    });
  });
});
