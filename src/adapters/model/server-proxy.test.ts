/**
 * GATE-S1-PREP: Server-Side Model Dev Proxy Safety & Secret Hygiene Tests
 * Governed by YORI_SUBMIT_R2 (GATE-S1-PREP, AC-S1-PREP)
 *
 * Enforces:
 * 1. Explicit live switch: outbound fetch occurs ONLY when MODEL_API_KEY is set AND MODEL_LIVE_ENABLED === '1'.
 * 2. Hard call cap: per-process MODEL_LIVE_MAX_CALLS (default 10, clamped <= 10). Fallback when exhausted.
 *    max_tokens <= 300 per request body on all endpoints.
 * 3. Secret hygiene: sentinel keys never appear in logs, diagnostics, HTTP responses, or error messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ModelDevProxy,
  resolveModelConfig,
  resolveMaxCalls,
  resolveTimeoutMs,
  MAX_VERIFICATION_TIMEOUT_MS,
  resolveMaxTokensOverride,
  resolveLedgerPath,
  getDefaultLedgerPath,
  readLedgerState,
  resetProcessLiveCallCount,
  getProcessLiveCallCount,
  resetLedger,
  loadEnvLocal,
  stripCodeFences,
  extractMessageContent,
  parseMessageContent,
  resolveReasoningEffort,
  MAX_TOKENS_CEILING,
  resolveLifetimeMaxCalls,
  resolveOperatingCap,
  resolveReasoningBudgetCeiling,
  reserveLedgerSlot,
} from './server-proxy.js';
import { runLiveVerification } from '../../../scripts/live-verify-spark.js';
import type { ModelPortRequest } from './types.js';

function createMockReq(options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}): any {
  const emitter = new EventEmitter() as any;
  emitter.url = options.url;
  emitter.method = options.method;
  emitter.headers = options.headers || {};
  emitter.socket = { remoteAddress: '127.0.0.1' };
  process.nextTick(() => {
    if (options.body) {
      emitter.emit('data', Buffer.from(options.body, 'utf-8'));
    }
    emitter.emit('end');
  });
  return emitter;
}

function createMockRes(): any {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(data?: string) {
      if (data) {
        res.body += data;
      }
    },
  };
  return res;
}

const suiteTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-proxy-suite-'));
const suiteLedgerPath = path.join(suiteTempDir, 'suite-ledger.json');

describe('GATE-S1-PREP: Explicit Live Switch (MODEL_LIVE_ENABLED === 1)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('no API key: diagnostics report disabled with (no MODEL_API_KEY) and no fetch is made', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const diag = proxy.getDiagnostics();
      expect(diag.status).toBe('disabled');
      expect(diag.message).toBe('model: disabled (no MODEL_API_KEY)');
      expect(diag.keySource).toBe('none');

      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM' },
      });
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(['', '0', 'false', 'true', 'yes', '2', undefined])(
    'key present + MODEL_LIVE_ENABLED=%s: no fetch, diagnostics state live disabled, fallback returned',
    async (flagValue) => {
      process.env.MODEL_API_KEY = 'sk-test-live-switch-guard-key';
      if (flagValue !== undefined) {
        process.env.MODEL_LIVE_ENABLED = flagValue;
      } else {
        delete process.env.MODEL_LIVE_ENABLED;
      }

      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as any;

      try {
        const proxy = new ModelDevProxy();
        const diag = proxy.getDiagnostics();
        expect(diag.status).toBe('disabled');
        expect(diag.message).toBe('model: key present, live disabled (MODEL_LIVE_ENABLED!=1)');
        expect(diag.keySource).toBe('MODEL_API_KEY');

        // Refine route
        const refineRes = await proxy.handleRefine({
          templateId: 'depart',
          facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM' },
        });
        expect(refineRes.usedFallback).toBe(true);
        expect(refineRes.fallbackReason).toBe('disabled');

        // Reasoning route
        const reasonRes = await proxy.handleReasoning({
          candidates: [
            {
              id: 'plan-depart-piano',
              intentId: 'depart',
              confidence: 0.8,
              times: ['2:05 PM', '2:25 PM'],
              places: ['Piano Studio'],
              optionModes: ['drive', 'bus'],
              citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
              citedFactKeys: [],
            },
          ],
          availableSignalIds: ['calendar:2026-10-28T09:00:00Z'],
          confirmedFactKeys: [],
          timeZone: 'Asia/Tokyo',
        });
        expect(reasonRes.usedFallback).toBe(true);
        expect(reasonRes.fallbackReason).toBe('disabled');

        // Command route
        const cmdRes = await proxy.handleCommand({
          utterance: 'Can I leave later?',
          availableModes: ['drive', 'bus'],
          knownFactKeys: ['habit_rain_transit'],
        });
        expect(cmdRes.usedFallback).toBe(true);
        expect(cmdRes.fallbackReason).toBe('disabled');

        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );

  it('key present + MODEL_LIVE_ENABLED=1: diagnostics enabled and fetch is dispatched', async () => {
    process.env.MODEL_API_KEY = 'sk-test-live-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wording: 'Leave by 2:25 PM!' }) } }],
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const diag = proxy.getDiagnostics();
      expect(diag.status).toBe('enabled');
      expect(diag.message).toContain('model: enabled');
      expect(diag.message).toContain('via MODEL_API_KEY');

      const refineRes = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(refineRes.usedFallback).toBe(false);
      expect(refineRes.wording).toBe('Leave by 2:25 PM!');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('GATE-S1-PREP: Hard Call Cap (MODEL_LIVE_MAX_CALLS) & max_tokens <= 300', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('defaults call cap to 30 and clamps any higher value to at most 30', () => {
    expect(resolveMaxCalls({})).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '' })).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '5' })).toBe(5);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '30' })).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '100' })).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '999' })).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '0' })).toBe(0);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: 'invalid' })).toBe(30);
  });

  it('D4: code ceiling 200 (lowering-only) and operating cap 200 (lowering-only, never above 200)', () => {
    expect(resolveLifetimeMaxCalls({})).toBe(200);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '' })).toBe(200);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '4' })).toBe(4);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '50' })).toBe(50);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '200' })).toBe(200);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '250' })).toBe(200);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: '-1' })).toBe(200);
    expect(resolveLifetimeMaxCalls({ MODEL_LIFETIME_MAX_CALLS: 'invalid' })).toBe(200);
    expect(resolveOperatingCap({})).toBe(200);
    expect(resolveOperatingCap({ MODEL_OPERATING_CAP: '40' })).toBe(40);
    expect(resolveOperatingCap({ MODEL_OPERATING_CAP: '250' })).toBe(200);
    expect(resolveOperatingCap({ MODEL_OPERATING_CAP: 'x' })).toBe(200);
    expect(resolveReasoningBudgetCeiling({})).toBe(200);
    expect(resolveReasoningBudgetCeiling({ MODEL_REASONING_BUDGET_CEILING: '32' })).toBe(32);
    expect(resolveReasoningBudgetCeiling({ MODEL_REASONING_BUDGET_CEILING: '250' })).toBe(200);
    expect(resolveReasoningBudgetCeiling({ MODEL_OPERATING_CAP: '30', MODEL_REASONING_BUDGET_CEILING: '60' })).toBe(30);
  });

  it('exhausting call cap causes proxy to fall back to deterministic and reports cap in diagnostics', async () => {
    process.env.MODEL_API_KEY = 'sk-test-cap-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '3'; // Limit to 3 calls

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const req: ModelPortRequest = {
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      };

      // Calls 1, 2, 3 succeed
      await proxy.handleRefine(req);
      await proxy.handleRefine(req);
      await proxy.handleRefine(req);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(getProcessLiveCallCount()).toBe(3);

      // Call 4 hits cap
      const capDiag = proxy.getDiagnostics();
      expect(capDiag.status).toBe('disabled');
      expect(capDiag.message).toBe('model: live call cap reached (3/3), falling back to deterministic');

      const fallbackRes = await proxy.handleRefine(req);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // NO 4th fetch call
      expect(fallbackRes.usedFallback).toBe(true);
      expect(fallbackRes.fallbackReason).toBe('disabled');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // D4 rework (Reviewer ae9b0e30) + ADDENDUM: all endpoints default to resolveD4MaxTokens (4096; env can lower).
  it('verifies max_tokens per endpoint: refine 4096 (D4), reason 4096 (D4), command 4096 (D4)', async () => {
    process.env.MODEL_API_KEY = 'sk-test-token-cap-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    const capturedBodies: any[] = [];
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBodies.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  wording: 'Time: 2:25 PM',
                  orderedPlanIds: ['plan-1'],
                  rationale: [],
                  intent: 'leave_later',
                  command: 'shift_departure',
                  reasonCode: 'user_request',
                  userFacingReason: 'Shifted as requested',
                  suggestedTimes: ['2:45 PM'],
                  usedSignalIds: ['weather:rain'],
                  usedFactKeys: ['habit_rain_transit'],
                }),
              },
            },
          ],
        }),
      };
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();

      // 1. Refine endpoint
      await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });

      // 2. Reason endpoint
      await proxy.handleReasoning({
        candidates: [
          {
            id: 'plan-1',
            intentId: 'depart',
            confidence: 0.8,
            times: ['2:05 PM', '2:25 PM'],
            places: ['Piano Studio'],
            optionModes: ['drive', 'bus'],
            citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
            citedFactKeys: ['habit_rain_transit'],
          },
        ],
        availableSignalIds: ['weather:2026-10-28T11:30:00Z'],
        confirmedFactKeys: ['habit_rain_transit'],
        timeZone: 'Asia/Tokyo',
      });

      // 3. Command endpoint
      await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
        confirmedFactKeys: ['habit_rain_transit'],
        availableSignalIds: ['weather:2026-10-28T11:30:00Z'],
        validTimes: ['2:45 PM'],
      });

      expect(capturedBodies).toHaveLength(3);
      expect(capturedBodies[0].max_tokens).toBe(4096);
      expect(capturedBodies[1].max_tokens).toBe(4096);
      expect(capturedBodies[2].max_tokens).toBe(4096);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('GATE-S1-PREP: Secret Hygiene (Keys Never Leaked)', () => {
  const originalEnv = { ...process.env };
  const SENTINEL_KEY = 'sk-TEST-SENTINEL-KEY-LEAK-PROBE-XYZ1234567890';
  const SENTINEL_META_ALIAS = 'sk-TEST-SENTINEL-META-ALIAS-PROBE-ABC0987654321';

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it.each([
    { envVar: 'MODEL_API_KEY', key: SENTINEL_KEY },
    { envVar: 'META_API_KEY', key: SENTINEL_META_ALIAS },
  ])(
    'asserts secret %s is absent from logs, diagnostics, HTTP responses, and error fallbacks',
    async ({ envVar, key }) => {
      process.env[envVar] = key;
      process.env.MODEL_LIVE_ENABLED = '1';

      const logCalls: string[] = [];
      const logger = (msg: string) => logCalls.push(msg);

      // Check config logger
      const config = resolveModelConfig(logger);
      expect(config.keySource).toBe(envVar);
      for (const log of logCalls) {
        expect(log).not.toContain(key);
      }

      // Check diagnostics
      const proxy = new ModelDevProxy(undefined, logger);
      const diag = proxy.getDiagnostics();
      expect(JSON.stringify(diag)).not.toContain(key);

      // Check HTTP GET /api/model/diagnostics
      const diagReq = createMockReq({ url: '/api/model/diagnostics', method: 'GET' });
      const diagRes = createMockRes();
      await proxy.handleHttpRequest(diagReq, diagRes);
      expect(diagRes.body).not.toContain(key);

      // Check HTTP POST /api/model/refine with fetch error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error(`Simulated network failure with ${key}`));

      try {
        const refineReq = createMockReq({
          url: '/api/model/refine',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:5173',
          },
          body: JSON.stringify({
            templateId: 'depart',
            facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM' },
          }),
        });
        const refineRes = createMockRes();
        await proxy.handleHttpRequest(refineReq, refineRes);
        expect(refineRes.body).not.toContain(key);

        // Check HTTP POST /api/model/reason with error
        const reasonReq = createMockReq({
          url: '/api/model/reason',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:5173',
          },
          body: JSON.stringify({
            candidates: [
              {
                id: 'plan-1',
                kind: 'depart',
                headline: 'Piano lesson',
                prepareAt: '2:05 PM',
                leaveAt: '2:25 PM',
                score: 80,
                reasons: ['scheduled_event'],
              },
            ],
            availableSignalIds: ['cal:1'],
            confirmedFactKeys: [],
          }),
        });
        const reasonRes = createMockRes();
        await proxy.handleHttpRequest(reasonReq, reasonRes);
        expect(reasonRes.body).not.toContain(key);

        // Check HTTP POST /api/model/command with error
        const cmdReq = createMockReq({
          url: '/api/model/command',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:5173',
          },
          body: JSON.stringify({
            templateId: 'decision_command',
            facts: {
              utterance: 'Can I leave later?',
              availableModes: ['drive', 'bus'],
              knownFactKeys: ['habit_rain_transit'],
            },
          }),
        });
        const cmdRes = createMockRes();
        await proxy.handleHttpRequest(cmdReq, cmdRes);
        expect(cmdRes.body).not.toContain(key);

        // Check all logger outputs captured throughout
        for (const log of logCalls) {
          expect(log).not.toContain(key);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  );
});

describe('S1-PREP-PROVIDER: MODEL_TIMEOUT_MS clamping & enforcement', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('verifies timeout clamp values: 100->2000, 99999->30000, "abc"->15000, negative->15000, empty->15000', () => {
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '100' })).toBe(2000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '99999' })).toBe(30000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: 'abc' })).toBe(15000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '-500' })).toBe(15000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '' })).toBe(15000);
    expect(resolveTimeoutMs({})).toBe(15000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '5000' })).toBe(5000);
  });

  it('proves app path without allowExtendedVerificationTimeout still clamps at 30000ms even when higher timeout is passed', () => {
    // 1. resolveTimeoutMs strictly clamps to 30000
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '30000' })).toBe(30000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '45000' })).toBe(30000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '60000' })).toBe(30000);

    // 2. ModelDevProxy without allowExtendedVerificationTimeout clamps customConfig.timeoutMs to 30000
    const proxyApp = new ModelDevProxy({ timeoutMs: 45000 });
    expect(proxyApp.getConfig().timeoutMs).toBe(30000);

    const proxyApp60k = new ModelDevProxy({ timeoutMs: 60000 });
    expect(proxyApp60k.getConfig().timeoutMs).toBe(30000);
  });

  it('proves script path with allowExtendedVerificationTimeout accepts up to 60000ms and rejects >60000ms', () => {
    // 1. Accepts up to 60000ms
    const proxy45k = new ModelDevProxy({ timeoutMs: 45000, allowExtendedVerificationTimeout: true });
    expect(proxy45k.getConfig().timeoutMs).toBe(45000);

    const proxy60k = new ModelDevProxy({ timeoutMs: 60000, allowExtendedVerificationTimeout: true });
    expect(proxy60k.getConfig().timeoutMs).toBe(60000);
    expect(proxy60k.getConfig().timeoutMs).toBe(MAX_VERIFICATION_TIMEOUT_MS);

    // 2. Rejects > 60000ms
    expect(() => {
      new ModelDevProxy({ timeoutMs: 60001, allowExtendedVerificationTimeout: true });
    }).toThrow(/cannot exceed 60000ms for verification/);

    expect(() => {
      new ModelDevProxy({ timeoutMs: 99999, allowExtendedVerificationTimeout: true });
    }).toThrow(/cannot exceed 60000ms for verification/);
  });

  it('triggers fallbackReason: "timeout" across refine, reason, and command fetch paths', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-timeout-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_TIMEOUT_MS = '500';

    const originalFetch = globalThis.fetch;
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    try {
      const proxy = new ModelDevProxy();

      // Refine path
      const refineRes = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(refineRes.usedFallback).toBe(true);
      expect(refineRes.fallbackReason).toBe('timeout');

      // Reason path
      const reasonRes = await proxy.handleReasoning({
        candidates: [
          {
            id: 'plan-1',
            intentId: 'depart',
            confidence: 0.8,
            times: ['2:05 PM', '2:25 PM'],
            places: ['Piano Studio'],
            optionModes: ['drive', 'bus'],
            citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
            citedFactKeys: [],
          },
        ],
        availableSignalIds: ['calendar:2026-10-28T09:00:00Z'],
        confirmedFactKeys: [],
        timeZone: 'Asia/Tokyo',
      });
      expect(reasonRes.usedFallback).toBe(true);
      expect(reasonRes.fallbackReason).toBe('timeout');

      // Command path
      const cmdRes = await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
      });
      expect(cmdRes.usedFallback).toBe(true);
      expect(cmdRes.fallbackReason).toBe('timeout');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('S1-PREP-PROVIDER: MODEL_MAX_TOKENS clamping & override', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('verifies max_tokens clamp values: 0/negative/non-numeric->undefined, 2000->2000, 9000->8192', () => {
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '0' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '-10' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '2000' })).toBe(2000);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '9000' })).toBe(8192);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: 'x' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '' })).toBeUndefined();
    expect(resolveMaxTokensOverride({})).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '512' })).toBe(512);
  });

  it('applies max_tokens override to all three fetch paths', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-tokens-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_MAX_TOKENS = '450';

    const recordedBodies: any[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      recordedBodies.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  wording: 'Time: 2:25 PM',
                  orderedPlanIds: ['plan-1'],
                  rationale: [],
                  intent: 'leave_later',
                  command: 'shift_departure',
                  reasonCode: 'user_request',
                  userFacingReason: 'Shifted',
                  suggestedTimes: ['2:45 PM'],
                  usedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
                  usedFactKeys: ['habit_rain_transit'],
                }),
              },
            },
          ],
        }),
      };
    });

    try {
      const proxy = new ModelDevProxy();

      await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });

      await proxy.handleReasoning({
        candidates: [
          {
            id: 'plan-1',
            intentId: 'depart',
            confidence: 0.8,
            times: ['2:05 PM', '2:25 PM'],
            places: ['Piano Studio'],
            optionModes: ['drive', 'bus'],
            citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
            citedFactKeys: ['habit_rain_transit'],
          },
        ],
        availableSignalIds: ['calendar:2026-10-28T09:00:00Z'],
        confirmedFactKeys: ['habit_rain_transit'],
        timeZone: 'Asia/Tokyo',
      });

      await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
        confirmedFactKeys: ['habit_rain_transit'],
        availableSignalIds: ['calendar:2026-10-28T09:00:00Z'],
        validTimes: ['2:45 PM'],
      });

      expect(recordedBodies).toHaveLength(3);
      for (const b of recordedBodies) {
        expect(b.max_tokens).toBe(450);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('decision_command sets max_tokens=4096 by default and MODEL_MAX_TOKENS lowers it', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-tokens-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    delete process.env.MODEL_MAX_TOKENS;

    let capturedBody: any;
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ wording: 'OK', reasonCode: 'ok', rationale: [] }) } }],
        }),
      };
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const defaultProxy = new ModelDevProxy();
      await defaultProxy.handleCommand({
        knownFactKeys: ['habit_rain_transit'],
      });
      expect(capturedBody.max_tokens).toBe(4096);

      // Env lowering to 1024
      process.env.MODEL_MAX_TOKENS = '1024';
      const loweredProxy = new ModelDevProxy();
      await loweredProxy.handleCommand({
        knownFactKeys: ['habit_rain_transit'],
      });
      expect(capturedBody.max_tokens).toBe(1024);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MODEL_MAX_TOKENS;
    }
  });

  it('decision_command server timeout defaults to 30000ms and MODEL_TIMEOUT_MS lowers it', async () => {
    delete process.env.MODEL_TIMEOUT_MS;
    const defaultProxy = new ModelDevProxy();
    expect(defaultProxy.getConfig().commandTimeoutMs).toBe(30000);

    process.env.MODEL_TIMEOUT_MS = '10000';
    const loweredProxy = new ModelDevProxy();
    expect(loweredProxy.getConfig().commandTimeoutMs).toBe(10000);

    // Cannot raise above 30000ms via env
    process.env.MODEL_TIMEOUT_MS = '45000';
    const clampedProxy = new ModelDevProxy();
    expect(clampedProxy.getConfig().commandTimeoutMs).toBe(30000);

    delete process.env.MODEL_TIMEOUT_MS;
  });
});

describe('S1-PREP-PROVIDER: Durable Pre-Fetch Attempt Ledger', () => {
  const originalEnv = { ...process.env };
  const tempDir = path.join(os.tmpdir(), `yori-ledger-test-${Date.now()}`);
  const testLedgerPath = path.join(tempDir, 'test-ledger.json');

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger(testLedgerPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    process.env.MODEL_LIVE_LEDGER_PATH = testLedgerPath;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(testLedgerPath);
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('survives new proxy instance + resetProcessLiveCallCount() across restarts', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-restart-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '4';
    process.env.MODEL_LIFETIME_MAX_CALLS = '4';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      // Instance 1 makes 2 calls
      const proxy1 = new ModelDevProxy();
      await proxy1.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      await proxy1.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Simulate process restart
      resetProcessLiveCallCount();
      expect(getProcessLiveCallCount()).toBe(0);

      // Instance 2 starts in new process
      const proxy2 = new ModelDevProxy();
      // Diagnostics must see ledger at 2/4
      const diag2 = proxy2.getDiagnostics();
      expect(diag2.status).toBe('enabled');

      await proxy2.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      await proxy2.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // 5th call is blocked by persistent ledger cap
      const blockedRes = await proxy2.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(blockedRes.usedFallback).toBe(true);
      expect(blockedRes.fallbackReason).toBe('disabled');
      expect(fetchSpy).toHaveBeenCalledTimes(4); // NO 5th fetch
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MODEL_LIFETIME_MAX_CALLS;
    }
  });

  it('fails closed when ledger is corrupt JSON: diagnostics reports disabled and 0 fetches occur', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-corrupt-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    // Write corrupt JSON to ledger
    fs.writeFileSync(testLedgerPath, '{ NOT_VALID_JSON ...corrupted!!', 'utf-8');

    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const diag = proxy.getDiagnostics();
      expect(diag.status).toBe('disabled');
      expect(diag.message).toContain('persistent ledger corrupt or unreadable');

      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails closed when ledger directory is unwritable', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-unwritable-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    // Use an impossible directory path
    process.env.MODEL_LIVE_LEDGER_PATH = '/dev/null/impossible/path/ledger.json';

    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parallel 20 reservations with cap 10 -> exactly 10 fetches, exactly 10 fallbacks', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-parallel-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';

    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
        }),
      };
    });

    try {
      const proxy = new ModelDevProxy();
      const req: ModelPortRequest = {
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      };

      // Launch 20 concurrent requests
      const promises = Array.from({ length: 20 }, () => proxy.handleRefine(req));
      const results = await Promise.all(promises);

      const accepted = results.filter(r => !r.usedFallback);
      const rejected = results.filter(r => r.usedFallback && r.fallbackReason === 'disabled');

      expect(accepted).toHaveLength(10);
      expect(rejected).toHaveLength(10);
      expect(fetchCount).toBe(10);

      // Verify ledger file on disk
      const state = readLedgerState(testLedgerPath);
      expect(state.status).toBe('ok');
      expect(state.callCount).toBe(10);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('flag OFF: fetch mock called 0 times, ledger remains uncreated/0', async () => {
    process.env.MODEL_API_KEY = 'sk-mock-flag-off-key';
    delete process.env.MODEL_LIVE_ENABLED;

    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy();
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM' },
      });
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(fetchSpy).not.toHaveBeenCalled();

      const state = readLedgerState(testLedgerPath);
      expect(state.status).toBe('missing');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('S1-PREP-PROVIDER: Diagnostics providerHost & Hygiene', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('extracts providerHost hostname only without key or query', () => {
    // Baseten provider
    process.env.MODEL_BASE_URL = 'https://inference.baseten.co/v1';
    process.env.MODEL_API_KEY = 'sk-baseten-dummy-key';
    const proxyBaseten = new ModelDevProxy();
    const diagBaseten = proxyBaseten.getDiagnostics();
    expect(diagBaseten.providerHost).toBe('inference.baseten.co');
    expect(diagBaseten.message).not.toContain('sk-baseten-dummy-key');

    // Meta provider
    process.env.MODEL_BASE_URL = 'https://api.meta.ai/v1';
    const proxyMeta = new ModelDevProxy();
    const diagMeta = proxyMeta.getDiagnostics();
    expect(diagMeta.providerHost).toBe('api.meta.ai');
  });
});

describe('S1-PREP-PROVIDER: Baseten Provider Fallback Tests with Mocked Fetch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
    process.env['MODEL_LIVE_LEDGER_PATH'] = suiteLedgerPath;
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger(suiteLedgerPath);
  });

  it('sends request to Baseten /chat/completions with Bearer header and mocked slug', async () => {
    process.env.MODEL_BASE_URL = 'https://inference.baseten.co/v1';
    process.env.MODEL_NAME = 'meta-models/muse-spark-open-1026';
    process.env.MODEL_API_KEY = 'baseten-test-sentinel-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
        }),
      };
    });

    try {
      const proxy = new ModelDevProxy();
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(res.usedFallback).toBe(false);
      expect(capturedUrl).toBe('https://inference.baseten.co/v1/chat/completions');
      expect(capturedHeaders['Authorization']).toBe('Bearer baseten-test-sentinel-key');
      expect(capturedBody.model).toBe('meta-models/muse-spark-open-1026');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles reasoning-only / empty / whitespace content -> schema_invalid fallback', async () => {
    process.env.MODEL_BASE_URL = 'https://inference.baseten.co/v1';
    process.env.MODEL_NAME = 'meta-models/muse-spark-open-1026';
    process.env.MODEL_API_KEY = 'baseten-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    const originalFetch = globalThis.fetch;
    let mockContent = '';
    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockContent } }],
      }),
    }));

    try {
      const proxy = new ModelDevProxy();

      // Empty string
      mockContent = '';
      const r1 = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(r1.usedFallback).toBe(true);
      expect(r1.fallbackReason === 'truncated' || r1.fallbackReason === 'schema_invalid').toBe(true);

      // Whitespace only (reasoning token exhaustion)
      mockContent = '   \n  \t  ';
      const r2 = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(r2.usedFallback).toBe(true);
      expect(r2.fallbackReason === 'truncated' || r2.fallbackReason === 'schema_invalid').toBe(true);

      // Reasoning path with empty content
      const r3 = await proxy.handleReasoning({
        candidates: [
          {
            id: 'plan-1',
            intentId: 'depart',
            confidence: 0.8,
            times: ['2:05 PM', '2:25 PM'],
            places: ['Piano Studio'],
            optionModes: ['drive', 'bus'],
            citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
            citedFactKeys: [],
          },
        ],
        availableSignalIds: ['calendar:2026-10-28T09:00:00Z'],
        confirmedFactKeys: [],
        timeZone: 'Asia/Tokyo',
      });
      expect(r3.usedFallback).toBe(true);
      expect(r3.fallbackReason === 'truncated' || r3.fallbackReason === 'schema_invalid').toBe(true);

      // Command path with empty content
      const r4 = await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
      });
      expect(r4.usedFallback).toBe(true);
      expect(r4.fallbackReason === 'truncated' || r4.fallbackReason === 'schema_invalid').toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles 401 and 429 errors -> error fallback with NO retry (exactly 1 call)', async () => {
    process.env.MODEL_BASE_URL = 'https://inference.baseten.co/v1';
    process.env.MODEL_API_KEY = 'baseten-key';
    process.env.MODEL_LIVE_ENABLED = '1';

    const originalFetch = globalThis.fetch;

    // 401 Unauthorized
    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return { ok: false, status: 401 };
    });

    try {
      const proxy = new ModelDevProxy();
      const r1 = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(r1.usedFallback).toBe(true);
      expect(r1.fallbackReason).toBe('error');
      expect(fetchCount).toBe(1); // 0 retries!

      // 429 Rate Limit
      fetchCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return { ok: false, status: 429 };
      });

      const r2 = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(r2.usedFallback).toBe(true);
      expect(r2.fallbackReason).toBe('error');
      expect(fetchCount).toBe(1); // 0 retries!
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('greps ledger file, diagnostics, and test results to guarantee no apiKey bytes leak', async () => {
    const SENTINEL_SECRET = 'sk-BASETEN-SECRET-SENTINEL-PROBE-999888777';
    process.env.MODEL_BASE_URL = 'https://inference.baseten.co/v1';
    process.env.MODEL_API_KEY = SENTINEL_SECRET;
    process.env.MODEL_LIVE_ENABLED = '1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
      }),
    });

    try {
      const proxy = new ModelDevProxy();
      const diag = proxy.getDiagnostics();
      const diagJson = JSON.stringify(diag);
      expect(diagJson).not.toContain(SENTINEL_SECRET);

      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(JSON.stringify(res)).not.toContain(SENTINEL_SECRET);

      // Read ledger from disk
      const ledgerPath = resolveLedgerPath();
      if (fs.existsSync(ledgerPath)) {
        const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8');
        expect(ledgerContent).not.toContain(SENTINEL_SECRET);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('S1-PREP-PROVIDER: Default Production Ledger Protection & Isolation (P1)', () => {
  const defaultProdLedger = getDefaultLedgerPath();
  const originalEnv = { ...process.env };
  const prodDir = path.dirname(defaultProdLedger);

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_TIMEOUT_MS'];
    delete process.env['MODEL_MAX_TOKENS'];
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
  });

  it('refuses to reset the default production ledger without allowProduction: true', () => {
    expect(() => resetLedger(defaultProdLedger)).toThrow(
      /refused to reset the default production ledger/
    );
  });

  it('pre-seeded default ledger survives running mocked live proxy tests under isolated MODEL_LIVE_LEDGER_PATH', async () => {
    // 1. If default production ledger already exists (e.g. pre-seeded by reviewer), preserve it.
    // Otherwise, create a synthetic pre-seeded ledger and clean it up in finally.
    const hadExisting = fs.existsSync(defaultProdLedger);
    let createdForTest = false;

    if (!hadExisting) {
      if (!fs.existsSync(prodDir)) {
        fs.mkdirSync(prodDir, { recursive: true });
      }
      const preSeededData = {
        version: 1,
        call_count: 10,
        reservations: [
          {
            id: 'preseeded-s1-live-reservation',
            timestamp: '2026-10-30T15:00:00.000Z',
            endpoint: 'refine',
            callIndex: 10,
          },
        ],
      };
      fs.writeFileSync(defaultProdLedger, JSON.stringify(preSeededData, null, 2), 'utf-8');
      createdForTest = true;
    }

    const initialContent = fs.readFileSync(defaultProdLedger, 'utf-8');

    // 2. Set test environment with isolated temp ledger path
    const isolatedTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-preseed-check-'));
    const isolatedLedgerPath = path.join(isolatedTempDir, 'isolated-ledger.json');
    process.env.MODEL_LIVE_LEDGER_PATH = isolatedLedgerPath;
    process.env.MODEL_API_KEY = 'sk-test-preseed-key';
    process.env.MODEL_LIVE_ENABLED = '1';
    resetLedger(isolatedLedgerPath);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ wording: 'Time: 2:25 PM' }) } }],
      }),
    });

    try {
      const proxy = new ModelDevProxy();
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(res.usedFallback).toBe(false);

      // 3. Assert isolated ledger recorded the call
      const isolatedState = readLedgerState(isolatedLedgerPath);
      expect(isolatedState.callCount).toBe(1);

      // 4. Critical check: default production ledger remains completely untouched (byte-identical)
      const finalContent = fs.readFileSync(defaultProdLedger, 'utf-8');
      expect(finalContent).toBe(initialContent);

      const prodState = readLedgerState(defaultProdLedger);
      expect(prodState.status).toBe('ok');
    } finally {
      globalThis.fetch = originalFetch;
      try {
        resetLedger(isolatedLedgerPath);
        if (fs.existsSync(isolatedTempDir)) {
          fs.rmSync(isolatedTempDir, { recursive: true, force: true });
        }
        if (createdForTest && fs.existsSync(defaultProdLedger)) {
          fs.unlinkSync(defaultProdLedger);
        }
      } catch {}
    }
  });
});

describe('S1-PREP-PROVIDER: loadEnvLocal test-mode regression tests (P2)', () => {
  const originalEnv = { ...process.env };
  const tempEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-loadenv-test-'));

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    fs.writeFileSync(
      path.join(tempEnvDir, '.env.local'),
      'MODEL_API_KEY="sk-secret-from-env-local-999"\n',
      'utf-8'
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempEnvDir)) {
        fs.rmSync(tempEnvDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('when VITEST is set: loadEnvLocal leaves MODEL_API_KEY unset (test runner protection)', () => {
    process.env.VITEST = 'true';
    delete process.env.NODE_ENV;
    delete process.env.MODEL_API_KEY;

    loadEnvLocal(tempEnvDir);
    expect(process.env.MODEL_API_KEY).toBeUndefined();
  });

  it('when NODE_ENV is "test": loadEnvLocal leaves MODEL_API_KEY unset', () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = 'test';
    delete process.env.MODEL_API_KEY;

    loadEnvLocal(tempEnvDir);
    expect(process.env.MODEL_API_KEY).toBeUndefined();
  });

  it('when neither VITEST nor NODE_ENV=test is set: loadEnvLocal loads MODEL_API_KEY from .env.local', () => {
    delete process.env.VITEST;
    delete process.env.NODE_ENV;
    delete process.env.MODEL_API_KEY;

    loadEnvLocal(tempEnvDir);
    expect(process.env.MODEL_API_KEY).toBe('sk-secret-from-env-local-999');
  });
});

describe('S1-LIVE: runLiveVerification unit tests (mocked)', () => {
  const originalEnv = { ...process.env };
  const suiteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-live-suite-'));
  const testLedger = path.join(suiteDir, 'live-test-ledger.json');
  const testReportMd = path.join(suiteDir, 'S1_LIVE_REPORT.md');
  const testReportJson = path.join(suiteDir, 's1-live-report.json');

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    delete process.env['MODEL_LIVE_ENABLED'];
    delete process.env['MODEL_LIVE_MAX_CALLS'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
    resetProcessLiveCallCount();
    resetLedger(testLedger);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    try {
      resetLedger(testLedger);
    } catch {}
  });

  afterAll(() => {
    try {
      if (fs.existsSync(suiteDir)) {
        fs.rmSync(suiteDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('refuses without --confirm-billed flag', async () => {
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = 'sk-mock-key';

    await expect(
      runLiveVerification({
        confirmBilled: false,
        tempLedgerPath: testLedger,
        skipPreconditions: true,
      })
    ).rejects.toThrow(/Missing mandatory --confirm-billed flag/);
  });

  it('stops on first 4xx response (e.g. 401 unauthorized or 429 rate limit) with no retry', async () => {
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = 'sk-mock-key';

    let fetchCount = 0;
    const mock401Fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: false,
        status: 401,
        clone: () => ({
          json: async () => ({ error: { message: 'Invalid API key', type: 'authentication_error' } }),
        }),
        json: async () => ({ error: { message: 'Invalid API key', type: 'authentication_error' } }),
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
      } as any;
    });

    const result = await runLiveVerification({
      confirmBilled: true,
      mockFetch: mock401Fetch as any,
      tempLedgerPath: testLedger,
      reportPath: testReportMd,
      jsonReportPath: testReportJson,
      skipPreconditions: true,
    });

    expect(result.ok).toBe(true);
    expect(result.report.executionStatus).toBe('hard_stop');
    expect(result.report.hardStopReason).toContain('401');
    expect(result.report.hardStopReason).toContain('authentication_error');
    // Exactly 1 call was attempted, zero retries!
    expect(fetchCount).toBe(1);
    expect(result.report.calls.length).toBe(1);
    expect(result.report.calls[0]!.httpStatus).toBe(401);
    expect(result.report.calls[0]!.usedFallback).toBe(true);
  });

  it('never exceeds ledger call cap', async () => {
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '3';
    process.env.MODEL_API_KEY = 'sk-mock-key';

    let fetchCount = 0;
    const mock200Fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        clone: () => ({
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM' }) } }],
            usage: { prompt_tokens: 45, completion_tokens: 15, total_tokens: 60 },
          }),
        }),
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM' }) } }],
          usage: { prompt_tokens: 45, completion_tokens: 15, total_tokens: 60 },
        }),
        text: async () => 'ok',
      } as any;
    });

    const result = await runLiveVerification({
      confirmBilled: true,
      mockFetch: mock200Fetch as any,
      tempLedgerPath: testLedger,
      reportPath: testReportMd,
      jsonReportPath: testReportJson,
      skipPreconditions: true,
    });

    expect(result.ok).toBe(true);
    expect(fetchCount).toBe(3);
    expect(result.report.totalCallsDispatched).toBe(3);
    expect(result.report.ledgerCallCount).toBe(3);
    const ledger = readLedgerState(testLedger);
    expect(ledger.callCount).toBe(3);
  });
});

describe('S1-DIAG: output extraction, shape handling, and diagnostic metadata tests', () => {
  const diagTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-diag-suite-'));
  const diagLedger = path.join(diagTempDir, 'model-live-ledger.json');
  const sentinelSecretKey = 'sk-meta-muse-spark-secret-sentinel-xyz123';
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetLedger(diagLedger);
    resetProcessLiveCallCount();
    process.env.MODEL_LIVE_LEDGER_PATH = diagLedger;
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = sentinelSecretKey;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.MODEL_LIVE_LEDGER_PATH;
    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
    delete process.env.MODEL_API_KEY;
    resetProcessLiveCallCount();
  });

  afterAll(() => {
    try {
      resetLedger(diagLedger);
      if (fs.existsSync(diagTempDir)) {
        fs.rmSync(diagTempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('stripCodeFences correctly extracts inner content from json and generic code fences', () => {
    expect(stripCodeFences('{"a": 1}')).toBe('{"a": 1}');
    expect(stripCodeFences('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(stripCodeFences('```\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(stripCodeFences('  ```JSON\n  {"a": 1}\n  ```  ')).toBe('{"a": 1}');
  });

  it('extractMessageContent extracts text from string and array-of-parts representations', () => {
    expect(extractMessageContent({ content: '{"wording": "test"}' })).toBe('{"wording": "test"}');
    expect(
      extractMessageContent({
        content: [
          { type: 'text', text: '{"word' },
          { type: 'text', text: 'ing": "test"}' },
        ],
      })
    ).toBe('{"wording": "test"}');
    expect(extractMessageContent({ content: '```json\n{"wording": "test"}\n```' })).toBe('{"wording": "test"}');
    expect(extractMessageContent({ reasoning_content: 'thinking...', content: '' })).toBeUndefined();
    expect(extractMessageContent({ content: undefined })).toBeUndefined();
    expect(extractMessageContent(null)).toBeUndefined();
  });

  it('handleRefine: accepts standard string JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 25,
          total_tokens: 135,
          completion_tokens_details: { reasoning_tokens: 10 },
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(res.usedFallback).toBe(false);
    expect(res.wording).toContain('Piano lesson at 3:00 PM');
    const diag = proxy.getDiagnostics();
    expect(diag.lastFinishReason).toBe('stop');
    expect(diag.lastReasoningTokens).toBe(10);
  });

  it('handleRefine: accepts content formatted as an array of parts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM',
                  }),
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 28,
          total_tokens: 138,
          reasoning_tokens: 12,
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(res.usedFallback).toBe(false);
    expect(res.wording).toContain('Piano lesson at 3:00 PM');
    expect(proxy.getDiagnostics().lastFinishReason).toBe('stop');
    expect(proxy.getDiagnostics().lastReasoningTokens).toBe(12);
  });

  it('handleRefine: accepts separate reasoning_content field without leaking reasoning into output', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: 'Step 1: Check facts. The piano lesson is at 3:00 PM. Invented time 9:99 PM.',
              content: JSON.stringify({
                wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 65,
          total_tokens: 175,
          completion_tokens_details: { reasoning_tokens: 40 },
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(res.usedFallback).toBe(false);
    expect(res.wording).toContain('Piano lesson at 3:00 PM');
    expect(res.wording).not.toContain('Step 1');
    expect(res.wording).not.toContain('9:99');
    expect(proxy.getDiagnostics().lastFinishReason).toBe('stop');
    expect(proxy.getDiagnostics().lastReasoningTokens).toBe(40);
  });

  it('handleRefine: strips markdown code fences from JSON output cleanly', async () => {
    const rawJson = JSON.stringify({
      wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${rawJson}\n\`\`\``,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 30,
          total_tokens: 140,
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(res.usedFallback).toBe(false);
    expect(res.wording).toContain('Piano lesson at 3:00 PM');
  });

  it('handleReasoning & handleCommand: strip code fences and parse structured JSON', async () => {
    const reasoningJson = JSON.stringify({
      orderedPlanIds: ['plan-1', 'plan-2'],
      rationale: [
        {
          planId: 'plan-1',
          citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
          citedFactKeys: ['habit_rain_transit'],
          reasonCodes: ['weather_adjusted'],
          text: 'Piano Studio leave at 2:25 PM.',
        },
      ],
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${reasoningJson}\n\`\`\``,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 50,
          total_tokens: 250,
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const reasonRes = await proxy.handleReasoning({
      candidates: [
        {
          id: 'plan-1',
          intentId: 'depart',
          confidence: 0.8,
          times: ['2:05 PM', '2:25 PM'],
          places: ['Piano Studio'],
          optionModes: ['drive', 'bus'],
          citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
          citedFactKeys: ['habit_rain_transit'],
        },
        {
          id: 'plan-2',
          intentId: 'lunch',
          confidence: 0.7,
          times: ['12:15 PM'],
          places: ['Green Bowl'],
          optionModes: ['walk'],
          citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
          citedFactKeys: ['taste_lunch_japanese'],
        },
      ],
      availableSignalIds: ['weather:2026-10-28T11:30:00Z', 'calendar:2026-10-28T09:00:00Z'],
      confirmedFactKeys: ['habit_rain_transit', 'taste_lunch_japanese'],
      timeZone: 'America/Los_Angeles',
    });

    expect(reasonRes.usedFallback).toBe(false);
    expect(reasonRes.result.orderedPlanIds).toEqual(['plan-1', 'plan-2']);

    const commandJson = JSON.stringify({
      intent: 'LEAVE_LATER',
      slots: { deltaMinutes: 20 },
      citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      reasonCodes: ['weather_adjusted'],
      explanation: 'Adjusted departure time later by 20 minutes.',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${commandJson}\n\`\`\``,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 40,
          total_tokens: 190,
        },
      }),
    } as any);

    const cmdRes = await proxy.handleCommand({
      utterance: 'Can I leave later?',
      availableModes: ['drive', 'bus'],
      knownFactKeys: ['habit_rain_transit'],
      confirmedFactKeys: ['habit_rain_transit'],
      availableSignalIds: ['weather:2026-10-28T11:30:00Z'],
      validTimes: ['2:45 PM', '2:50 PM'],
    });

    expect(cmdRes.usedFallback).toBe(false);
    expect(cmdRes.result?.intent).toBe('LEAVE_LATER');
  });

  it('resolveMaxTokensOverride enforces [1, 8192] clamp and falls back to undefined on 0/negative/non-numeric', () => {
    expect(MAX_TOKENS_CEILING).toBe(8192);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '8192' })).toBe(8192);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '8193' })).toBe(8192);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '10000' })).toBe(8192);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '1' })).toBe(1);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '0' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '-10' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: 'not-a-number' })).toBeUndefined();
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '' })).toBeUndefined();
    expect(resolveMaxTokensOverride({})).toBeUndefined();
  });

  it('resolveReasoningEffort supports documented Meta Model API values and omits unsupported/empty', () => {
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'minimal' })).toBe('minimal');
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'low' })).toBe('low');
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'medium' })).toBe('medium');
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'high' })).toBe('high');
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'xhigh' })).toBe('xhigh');
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'max' })).toBe('max');
    // 'none' causes HTTP 400 on Meta Muse reasoning models, so our resolver omits it
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'none' })).toBeUndefined();
    expect(resolveReasoningEffort({ MODEL_REASONING_EFFORT: 'invalid_value' })).toBeUndefined();
    expect(resolveReasoningEffort({})).toBeUndefined();
  });

  it('injects reasoning_effort and generous token budget into fetch body when configured', async () => {
    let capturedBody: any;
    globalThis.fetch = vi.fn().mockImplementation(async (_input: any, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ wording: 'Piano lesson at 3:00 PM' }) }, finish_reason: 'stop' }],
        }),
      } as any;
    });

    const proxyWithEffort = new ModelDevProxy({
      ledgerPath: diagLedger,
      apiKey: sentinelSecretKey,
      reasoningEffort: 'low',
      maxTokensOverride: 2048,
    });
    await proxyWithEffort.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });

    expect(capturedBody.reasoning_effort).toBe('low');
    expect(capturedBody.max_tokens).toBe(2048);

    // When reasoningEffort is omitted
    const proxyWithoutEffort = new ModelDevProxy({
      ledgerPath: diagLedger,
      apiKey: sentinelSecretKey,
    });
    await proxyWithoutEffort.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });

    expect(capturedBody.reasoning_effort).toBeUndefined();
    expect(capturedBody.max_tokens).toBe(4096); // endpoint default preserved (resolveD4MaxTokens)
  });

  it('parseMessageContent correctly distinguishes truncation, extraction_fault, and ok', () => {
    // Truncation: finish_reason='length'
    expect(parseMessageContent({ message: { content: '{"incomplete": ' }, finish_reason: 'length' })).toEqual({
      kind: 'truncated',
      reason: 'truncated',
    });
    // Truncation: finish_reason='length'
    expect(parseMessageContent({ message: { content: '' }, finish_reason: 'length' })).toEqual({
      kind: 'truncated',
      reason: 'truncated',
    });
    // Schema invalid: empty/missing visible content without finish_reason='length' and no reasoning
    expect(parseMessageContent({ message: { content: '' }, finish_reason: 'stop' })).toEqual({
      kind: 'schema_invalid',
      reason: 'schema_invalid',
    });
    expect(parseMessageContent({ message: { content: '   ' }, finish_reason: 'stop' })).toEqual({
      kind: 'schema_invalid',
      reason: 'schema_invalid',
    });
    expect(parseMessageContent({ message: { content: null }, finish_reason: 'stop' })).toEqual({
      kind: 'schema_invalid',
      reason: 'schema_invalid',
    });

    // Extraction fault: content in unexpected field or shape
    expect(parseMessageContent({ message: { reasoning_content: 'thinking...', content: undefined }, finish_reason: 'stop' })).toEqual({
      kind: 'extraction_fault',
      reason: 'extraction_fault',
    });
    expect(parseMessageContent({ message: { content: { nested: 'object' } }, finish_reason: 'stop' })).toEqual({
      kind: 'extraction_fault',
      reason: 'extraction_fault',
    });
    expect(parseMessageContent({ message: { content: [{ malformed: 123 }] }, finish_reason: 'stop' })).toEqual({
      kind: 'extraction_fault',
      reason: 'extraction_fault',
    });
    expect(parseMessageContent(undefined)).toEqual({
      kind: 'extraction_fault',
      reason: 'extraction_fault',
    });

    // OK: standard string, parts array, code-fenced
    expect(parseMessageContent({ message: { content: '{"ok": true}' }, finish_reason: 'stop' })).toEqual({
      kind: 'ok',
      content: '{"ok": true}',
    });
    expect(parseMessageContent({ message: { content: [{ type: 'text', text: '{"ok": true}' }] }, finish_reason: 'stop' })).toEqual({
      kind: 'ok',
      content: '{"ok": true}',
    });
  });

  it('handleRefine: returns fallbackReason: truncated on finish_reason=length', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"wording": "Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by',
            },
            finish_reason: 'length',
          },
        ],
        usage: {
          prompt_tokens: 114,
          completion_tokens: 1024,
          total_tokens: 1138,
          completion_tokens_details: { reasoning_tokens: 950 },
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe('truncated');
    expect(res.wording).toBe('Piano lesson at 3:00 PM');

    const diag = proxy.getDiagnostics();
    expect(diag.lastFinishReason).toBe('length');
    expect(diag.lastReasoningTokens).toBe(950);
  });

  it('handleRefine: returns fallbackReason: extraction_fault when content is in unexpected field or shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: 'thinking only, content field omitted',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });

    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe('extraction_fault');
  });

  it('handleRefine: returns fallbackReason: schema_invalid when visible content fails JSON parse or schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"wrong_key": "some text"}',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });

    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe('schema_invalid');
  });

  it('handleReasoning & handleCommand: return distinct fallback reasons for truncation, extraction, and schema faults', async () => {
    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });

    const sampleReasoningInput = {
      candidates: [
        {
          id: 'plan-1',
          intentId: 'depart',
          confidence: 0.8,
          times: ['2:05 PM'],
          places: ['Piano Studio'],
          optionModes: ['drive'],
          citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
          citedFactKeys: ['habit_rain_transit'],
        },
      ],
      availableSignalIds: ['weather:2026-10-28T11:30:00Z'],
      confirmedFactKeys: ['habit_rain_transit'],
      timeZone: 'America/Los_Angeles',
    };

    // 1. Truncation on reasoning
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"orderedPlanIds": ["plan-' }, finish_reason: 'length' }],
      }),
    } as any);
    const reasonTrunc = await proxy.handleReasoning(sampleReasoningInput);
    expect(reasonTrunc.usedFallback).toBe(true);
    expect(reasonTrunc.fallbackReason).toBe('truncated');

    // 2. Extraction fault on reasoning
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { reasoning_content: 'thinking only', content: undefined }, finish_reason: 'stop' }],
      }),
    } as any);
    const reasonExtract = await proxy.handleReasoning(sampleReasoningInput);
    expect(reasonExtract.usedFallback).toBe(true);
    expect(reasonExtract.fallbackReason).toBe('extraction_fault');

    // 3. Schema fault on reasoning
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{ invalid json for reasoning ' }, finish_reason: 'stop' }],
      }),
    } as any);
    const reasonSchema = await proxy.handleReasoning(sampleReasoningInput);
    expect(reasonSchema.usedFallback).toBe(true);
    expect(reasonSchema.fallbackReason).toBe('schema_invalid');

    // 4. Truncation on command
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"intent": "depart' }, finish_reason: 'length' }],
      }),
    } as any);
    const cmdTrunc = await proxy.handleCommand({
      utterance: 'leave later',
      knownFactKeys: ['habit_rain_transit'],
    });
    expect(cmdTrunc.usedFallback).toBe(true);
    expect(cmdTrunc.fallbackReason).toBe('truncated');

    // 5. Extraction fault on command
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { reasoning_content: 'thought', content: undefined }, finish_reason: 'stop' }],
      }),
    } as any);
    const cmdExtract = await proxy.handleCommand({
      utterance: 'leave later',
      knownFactKeys: ['habit_rain_transit'],
    });
    expect(cmdExtract.usedFallback).toBe(true);
    expect(cmdExtract.fallbackReason).toBe('extraction_fault');

    // 6. Schema fault on command (invalid JSON syntax)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{ not json syntax }' }, finish_reason: 'stop' }],
      }),
    } as any);
    const cmdSchema = await proxy.handleCommand({
      utterance: 'leave later',
      knownFactKeys: ['habit_rain_transit'],
    });
    expect(cmdSchema.usedFallback).toBe(true);
    expect(cmdSchema.fallbackReason).toBe('schema_invalid');
  });

  it('resets diagnostic finish_reason and reasoning_tokens at the start of each handler invocation', async () => {
    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });

    // Step 1: Call refine that sets finish_reason and reasoning_tokens
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"wording": "Piano lesson at 3:00 PM"}' }, finish_reason: 'stop' }],
        usage: { completion_tokens_details: { reasoning_tokens: 350 } },
      }),
    } as any);

    await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });
    expect(proxy.getLastFinishReason()).toBe('stop');
    expect(proxy.getLastReasoningTokens()).toBe(350);

    // Step 2: Next call fails with network error before receiving JSON; diagnostics must be cleared (not stale)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM' },
    });
    expect(proxy.getLastFinishReason()).toBeUndefined();
    expect(proxy.getLastReasoningTokens()).toBeUndefined();
  });

  it('diagnostic metadata and LiveVerificationCallRecord NEVER contain raw content or secret keys', async () => {
    const rawSecretMessageContent = 'RAW MODEL SECRET THINKING AND PRIVATE OUTPUT TEXT 987654321';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: rawSecretMessageContent,
              content: '{"wording": "Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM"}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 110,
          completion_tokens: 1024,
          total_tokens: 1134,
          completion_tokens_details: { reasoning_tokens: 888 },
        },
      }),
    } as any);

    const proxy = new ModelDevProxy({ ledgerPath: diagLedger, apiKey: sentinelSecretKey });
    await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    const diag = proxy.getDiagnostics();
    const serializedDiag = JSON.stringify(diag);

    // Assert key hygiene and zero raw content leakage
    expect(serializedDiag).not.toContain(sentinelSecretKey);
    expect(serializedDiag).not.toContain(rawSecretMessageContent);
    expect(serializedDiag).not.toContain('987654321');
    expect(diag.lastFinishReason).toBe('stop');
    expect(diag.lastReasoningTokens).toBe(888);
  });
});

describe('S1-CAP50: Lifetime allowance 50, per-run cap separation, and stop safeguards', () => {
  // D4 raised the code ceiling to 200 (operating cap 200); this block keeps proving the S1 mechanics
  // with an explicitly LOWERED lifetime cap of 50, which the lowering-only rule permits.
  const S1_LOWERED_CAP = 50;
  const cap50Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-cap50-'));
  const cap50Ledger = path.join(cap50Dir, 'model-live-ledger.json');

  beforeEach(() => {
    resetLedger(cap50Ledger);
    resetProcessLiveCallCount();
    process.env.MODEL_LIFETIME_MAX_CALLS = String(S1_LOWERED_CAP);
  });

  afterEach(() => {
    delete process.env.MODEL_LIFETIME_MAX_CALLS;
  });

  afterAll(() => {
    try {
      resetLedger(cap50Ledger);
      if (fs.existsSync(cap50Dir)) {
        fs.rmSync(cap50Dir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('pre-seeded call_count 10 allows exactly 40 more; the 51st is blocked at lifetime cap', async () => {
    // Seed ledger with 10 existing calls (simulating S1-LIVE reservations)
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify(
        {
          version: 1,
          call_count: 10,
          reservations: Array.from({ length: 10 }, (_, i) => ({
            id: `seed-${i + 1}`,
            timestamp: new Date().toISOString(),
            endpoint: 'refine',
            callIndex: i + 1,
          })),
        },
        null,
        2
      ),
      'utf-8'
    );

    // Make 40 reservations with lifetime cap 50
    for (let i = 11; i <= 50; i++) {
      const res = await reserveLedgerSlot(cap50Ledger, 50, 'refine', () => {}, S1_LOWERED_CAP, 10);
      expect(res.success).toBe(true);
      expect(res.callCount).toBe(i);
    }

    // 51st reservation is blocked by lifetime cap
    const blockedRes = await reserveLedgerSlot(cap50Ledger, 50, 'refine', () => {}, S1_LOWERED_CAP, 10);
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.error).toBe('cap_exceeded');
    expect(blockedRes.callCount).toBe(50);

    const finalState = readLedgerState(cap50Ledger);
    expect(finalState.callCount).toBe(50);
  });

  it('per-run cap 31 is refused (clamped in resolveMaxCalls, rejected in runLiveVerification)', async () => {
    // resolveMaxCalls clamps any value above MODEL_PER_RUN_MAX_CALLS (30) to 30
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '31' })).toBe(30);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '50' })).toBe(30);

    // runLiveVerification strictly refuses per-run cap > 30
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '31';
    await expect(
      runLiveVerification({
        confirmBilled: true,
        skipPreconditions: true,
        tempLedgerPath: cap50Ledger,
      })
    ).rejects.toThrow('MODEL_LIVE_MAX_CALLS must be between 1 and 30');
    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
  });

  it('a per-run cap above the remainder is refused (e.g. seeded 45, cap 10 -> refuse)', async () => {
    // Seed ledger with 45 calls (5 remaining under 50 lifetime cap)
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify(
        {
          version: 1,
          call_count: 45,
          reservations: Array.from({ length: 45 }, (_, i) => ({
            id: `seed-${i + 1}`,
            timestamp: new Date().toISOString(),
            endpoint: 'refine',
            callIndex: i + 1,
          })),
        },
        null,
        2
      ),
      'utf-8'
    );

    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10'; // 10 requested > 5 remaining
    process.env.MODEL_API_KEY = 'sk-mock-key';

    await expect(
      runLiveVerification({
        confirmBilled: true,
        skipPreconditions: true,
        tempLedgerPath: cap50Ledger,
      })
    ).rejects.toThrow(/exceeds lifetime remaining calls \(5\/50\)/);

    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
    delete process.env.MODEL_API_KEY;
  });

  it('concurrent reservations at 49 -> exactly one succeeds, exceeding reservations blocked', async () => {
    // Seed ledger with 49 calls
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify(
        {
          version: 1,
          call_count: 49,
          reservations: Array.from({ length: 49 }, (_, i) => ({
            id: `seed-${i + 1}`,
            timestamp: new Date().toISOString(),
            endpoint: 'refine',
            callIndex: i + 1,
          })),
        },
        null,
        2
      ),
      'utf-8'
    );

    // Launch 10 concurrent reservation attempts at the boundary of 50
    const attempts = Array.from({ length: 10 }, () =>
      reserveLedgerSlot(cap50Ledger, 10, 'refine', () => {}, S1_LOWERED_CAP, 49)
    );
    const results = await Promise.all(attempts);

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    expect(succeeded).toHaveLength(1);
    expect(succeeded[0]!.callCount).toBe(50);
    expect(failed).toHaveLength(9);
    for (const f of failed) {
      expect(f.error).toBe('cap_exceeded');
    }

    const finalState = readLedgerState(cap50Ledger);
    expect(finalState.callCount).toBe(50);
  });

  it('stop-on-first-accepted: runner halts after achieving accepted output on each objective', async () => {
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = 'sk-mock-test-key';

    // Mock fetch that always returns valid accepted JSON for all 3 endpoints
    const mockFetch = vi.fn().mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(init.body);
      const isReason = body.messages.some((m: any) => m.content?.includes('plan-1'));
      const isCommand = body.messages.some((m: any) => m.content?.includes('Can I leave later'));

      let contentStr = '';
      if (isCommand) {
        contentStr = JSON.stringify({
          intent: 'LEAVE_LATER',
          slots: { deltaMinutes: 20 },
          citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
          citedFactKeys: ['habit_rain_transit'],
          reasonCodes: ['weather_adjusted'],
          explanation: 'Leaving later by 20 minutes.',
        });
      } else if (isReason) {
        contentStr = JSON.stringify({ orderedPlanIds: ['plan-1', 'plan-2'], rationale: [{ planId: 'plan-1', citedSignalIds: ['weather:2026-10-28T11:30:00Z'], citedFactKeys: ['habit_rain_transit'], reasonCodes: ['weather_adjusted'], text: 'Piano Studio prepare at 2:10 PM.' }] });
      } else {
        contentStr = JSON.stringify({ wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM' });
      }

      return {
        ok: true,
        status: 200,
        clone: () => ({
          json: async () => ({
            choices: [{ message: { content: contentStr }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        }),
        json: async () => ({
          choices: [{ message: { content: contentStr }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      } as any;
    });

    const reportPath = path.join(cap50Dir, 'test-stop-report.md');
    const jsonReportPath = path.join(cap50Dir, 'test-stop-report.json');

    const { ok, report } = await runLiveVerification({
      confirmBilled: true,
      skipPreconditions: true,
      tempLedgerPath: cap50Ledger,
      mockFetch: mockFetch as any,
      reportPath,
      jsonReportPath,
    });

    expect(ok).toBe(true);
    // Dispatched calls should be exactly 3 (1 refine, 1 reason, 1 command), NOT all 10 planned calls!
    expect(report.totalCallsDispatched).toBe(3);
    expect(report.calls).toHaveLength(3);
    expect(report.calls[0]!.endpoint).toBe('refine');
    expect(report.calls[0]!.factCheckOutcome).toBe('accepted');
    expect(report.calls[1]!.endpoint).toBe('reason');
    expect(report.calls[1]!.factCheckOutcome).toBe('accepted');
    expect(report.calls[2]!.endpoint).toBe('command');
    expect(report.calls[2]!.factCheckOutcome).toBe('accepted');

    // Report records preRunLedgerCount and lifetimeRemaining
    expect(report.preRunLedgerCount).toBe(0);
    expect(report.lifetimeCap).toBe(50);
    expect(report.lifetimeRemaining).toBe(47);
    expect(report.ledgerDelta).toBe(3);
    expect(report.totalCallsDispatched).toBe(report.ledgerDelta);
    expect(report.ledgerReconciled).toBe(true);

    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
    delete process.env.MODEL_API_KEY;
  });

  it('seeded ledger (10) with per-run cap 10 allows 10 dispatches through ModelDevProxy, 11th blocked', async () => {
    // Seed ledger with 10 existing calls
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify({
        call_count: 10,
        reservations: Array.from({ length: 10 }, (_, i) => ({
          call_index: i + 1,
          endpoint: 'refine',
          timestamp: new Date().toISOString(),
        })),
      }),
      'utf-8'
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"wording": "Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    } as any);

    const proxy = new ModelDevProxy({
      ledgerPath: cap50Ledger,
      apiKey: 'sk-test-seed-key',
      liveEnabled: true,
      maxCalls: 10,
    });

    // All 10 calls in this run should succeed and reach fetch
    for (let i = 1; i <= 10; i++) {
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
      });
      expect(res.usedFallback).toBe(false);
      expect(proxy.getCallCount()).toBe(i);
    }

    // Ledger count has moved from 10 to 20
    const stateAfter10 = readLedgerState(cap50Ledger);
    expect(stateAfter10.callCount).toBe(20);

    // 11th call in this run is blocked locally by per-run cap (falls back to deterministic)
    const call11 = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });
    expect(call11.usedFallback).toBe(true);
    expect(call11.fallbackReason).toBe('disabled');
    expect(readLedgerState(cap50Ledger).callCount).toBe(20);
  });

  it('runLiveVerification on seeded ledger (10) reconciles dispatched == ledgerDelta (10 -> 13)', async () => {
    // Seed ledger with 10 existing calls
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify({
        call_count: 10,
        reservations: Array.from({ length: 10 }, (_, i) => ({
          call_index: i + 1,
          endpoint: 'refine',
          timestamp: new Date().toISOString(),
        })),
      }),
      'utf-8'
    );

    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = 'sk-mock-seeded-runner-key';

    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_input: any, init: any) => {
      fetchCount++;
      const body = JSON.parse(init.body);
      const isReason = body.messages.some((m: any) => m.content?.includes('plan-1'));
      const isCommand = body.messages.some((m: any) => m.content?.includes('Can I leave later'));

      let contentStr = '';
      if (isCommand) {
        contentStr = JSON.stringify({
          intent: 'LEAVE_LATER',
          slots: { deltaMinutes: 20 },
          citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
          citedFactKeys: ['habit_rain_transit'],
          reasonCodes: ['weather_adjusted'],
          explanation: 'Leaving later by 20 minutes.',
        });
      } else if (isReason) {
        contentStr = JSON.stringify({
          orderedPlanIds: ['plan-1', 'plan-2'],
          rationale: [{ planId: 'plan-1', citedSignalIds: ['weather:2026-10-28T11:30:00Z'], citedFactKeys: ['habit_rain_transit'], reasonCodes: ['weather_adjusted'], text: 'Piano Studio prepare at 2:10 PM.' }],
        });
      } else {
        contentStr = JSON.stringify({ wording: 'Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM' });
      }

      return {
        ok: true,
        status: 200,
        clone: () => ({
          json: async () => ({
            choices: [{ message: { content: contentStr }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        }),
        json: async () => ({
          choices: [{ message: { content: contentStr }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      } as any;
    });

    const reportPath = path.join(cap50Dir, 'test-seeded-reconcile-report.md');
    const jsonReportPath = path.join(cap50Dir, 'test-seeded-reconcile-report.json');

    const { ok, report } = await runLiveVerification({
      confirmBilled: true,
      skipPreconditions: true,
      tempLedgerPath: cap50Ledger,
      mockFetch: mockFetch as any,
      reportPath,
      jsonReportPath,
    });

    expect(ok).toBe(true);
    expect(fetchCount).toBe(3);
    expect(report.totalCallsDispatched).toBe(3);
    expect(report.preRunLedgerCount).toBe(10);
    expect(report.ledgerCallCount).toBe(13);
    expect(report.ledgerDelta).toBe(3);
    expect(report.totalCallsDispatched).toBe(report.ledgerDelta);
    expect(report.ledgerReconciled).toBe(true);
    expect(report.lifetimeRemaining).toBe(37);
    expect(report.calls).toHaveLength(3);

    const finalState = readLedgerState(cap50Ledger);
    expect(finalState.callCount).toBe(13);

    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
    delete process.env.MODEL_API_KEY;
  });

  it('seeded ledger (45) with per-run cap 5 allows exactly 5 dispatches (ledger 45->50), 6th blocked by lifetime cap', async () => {
    // Seed ledger with 45 calls (5 remaining under lifetime cap 50)
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify({
        call_count: 45,
        reservations: Array.from({ length: 45 }, (_, i) => ({
          call_index: i + 1,
          endpoint: 'refine',
          timestamp: new Date().toISOString(),
        })),
      }),
      'utf-8'
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"wording": "Piano lesson at 3:00 PM: Prepare at 2:05 PM, leave by 2:25 PM"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    } as any);

    const proxy = new ModelDevProxy({
      ledgerPath: cap50Ledger,
      apiKey: 'sk-test-seed-45-key',
      liveEnabled: true,
      maxCalls: 5,
    });

    // 5 calls succeed
    for (let i = 1; i <= 5; i++) {
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
      });
      expect(res.usedFallback).toBe(false);
      expect(proxy.getCallCount()).toBe(i);
    }

    // Ledger reaches exactly 50
    expect(readLedgerState(cap50Ledger).callCount).toBe(50);

    // 6th call blocked by lifetime cap (50/50)
    const call6 = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });
    expect(call6.usedFallback).toBe(true);
    expect(call6.fallbackReason).toBe('disabled');
    expect(readLedgerState(cap50Ledger).callCount).toBe(50);
  });

  it('hard stop on truncated: runner halts immediately when response is truncated', async () => {
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_API_KEY = 'sk-mock-trunc-key';

    // Mock fetch that returns truncated on call 1
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      clone: () => ({
        json: async () => ({
          choices: [{ message: { content: '{"incomplete":' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 100, completion_tokens: 1024, total_tokens: 1124 },
        }),
      }),
      json: async () => ({
        choices: [{ message: { content: '{"incomplete":' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 100, completion_tokens: 1024, total_tokens: 1124 },
      }),
    } as any);

    const reportPath = path.join(cap50Dir, 'test-trunc-report.md');
    const jsonReportPath = path.join(cap50Dir, 'test-trunc-report.json');

    const { ok, report } = await runLiveVerification({
      confirmBilled: true,
      skipPreconditions: true,
      tempLedgerPath: cap50Ledger,
      mockFetch: mockFetch as any,
      reportPath,
      jsonReportPath,
    });

    expect(ok).toBe(true);
    // Halts after call 1!
    expect(report.totalCallsDispatched).toBe(1);
    expect(report.executionStatus).toBe('hard_stop');
    expect(report.hardStopReason).toContain('fallbackReason: truncated');
    expect(report.calls[0]!.fallbackReason).toBe('truncated');

    delete process.env.MODEL_LIVE_ENABLED;
    delete process.env.MODEL_LIVE_MAX_CALLS;
    delete process.env.MODEL_API_KEY;
  });

  it('D4: env MODEL_LIFETIME_MAX_CALLS=250 / MODEL_OPERATING_CAP=250 cannot raise the hard stop above 200 (ledger at 200 blocks fetches)', async () => {
    // Seed ledger with 200 calls
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify({
        version: 1,
        call_count: 200,
        reservations: Array.from({ length: 200 }, (_, i) => ({
          call_index: i + 1,
          endpoint: 'refine',
          timestamp: new Date().toISOString(),
        })),
      }),
      'utf-8'
    );

    process.env.MODEL_API_KEY = 'sk-test-env-60';
    process.env.MODEL_LIVE_ENABLED = '1';
    process.env.MODEL_LIVE_MAX_CALLS = '10';
    process.env.MODEL_LIFETIME_MAX_CALLS = '250';
    process.env.MODEL_OPERATING_CAP = '250';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"wording": "Piano lesson at 3:00 PM"}' }, finish_reason: 'stop' }],
      }),
    });
    globalThis.fetch = fetchSpy as any;

    try {
      const proxy = new ModelDevProxy({ ledgerPath: cap50Ledger });
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('disabled');
      expect(readLedgerState(cap50Ledger).callCount).toBe(200);
    } finally {
      delete process.env.MODEL_API_KEY;
      delete process.env.MODEL_LIVE_ENABLED;
      delete process.env.MODEL_LIVE_MAX_CALLS;
      delete process.env.MODEL_LIFETIME_MAX_CALLS;
      delete process.env.MODEL_OPERATING_CAP;
    }
  });

  it('D4: customConfig.lifetimeMaxCalls=250 cannot raise the hard stop above the operating cap 200 (ledger at 200 -> blocked, 0 fetches)', async () => {
    // Seed ledger with 200 calls
    fs.writeFileSync(
      cap50Ledger,
      JSON.stringify({
        version: 1,
        call_count: 200,
        reservations: Array.from({ length: 200 }, (_, i) => ({
          call_index: i + 1,
          endpoint: 'refine',
          timestamp: new Date().toISOString(),
        })),
      }),
      'utf-8'
    );

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"wording": "Piano lesson at 3:00 PM"}' }, finish_reason: 'stop' }],
      }),
    });
    globalThis.fetch = fetchSpy as any;

    const proxy = new ModelDevProxy({
      ledgerPath: cap50Ledger,
      apiKey: 'sk-test-custom-60',
      liveEnabled: true,
      maxCalls: 10,
      lifetimeMaxCalls: 250,
    });

    const res = await proxy.handleRefine({
      templateId: 'depart',
      facts: { headline: 'Piano lesson at 3:00 PM', times: ['2:05 PM', '2:25 PM', '3:00 PM'], places: ['Piano Studio'] },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe('disabled');
    expect(readLedgerState(cap50Ledger).callCount).toBe(200);
  });

  describe('S1-CMD-RC: handleCommand reason code telemetry & LiveVerification runner integration', () => {
    const s1cmdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-s1cmd-proxy-'));
    const s1cmdLedger = path.join(s1cmdDir, 's1cmd-ledger.json');

    beforeEach(() => {
      resetLedger(s1cmdLedger);
    });

    afterEach(() => {
      try {
        resetLedger(s1cmdLedger);
      } catch {}
    });

    afterAll(() => {
      try {
        if (fs.existsSync(s1cmdDir)) {
          fs.rmSync(s1cmdDir, { recursive: true, force: true });
        }
      } catch {}
    });

    it('handleCommand records rejectedReasonCodes on validation failure and preserves them in diagnostics', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'LEAVE_LATER',
                  slots: { deltaMinutes: 15 },
                  citedSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
                  citedFactKeys: ['habit_rain_transit'],
                  reasonCodes: ['custom_nonexistent_code', 'UPPERCASE_CODE'],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }),
      });
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy({
        ledgerPath: s1cmdLedger,
        apiKey: 'sk-test-s1cmd-key',
        liveEnabled: true,
        maxCalls: 10,
      });

      const res = await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
        confirmedFactKeys: ['habit_rain_transit'],
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        validTimes: ['2:45 PM'],
      });

      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('invalid_reason_code');
      expect(res.rejectedReasonCodes).toEqual([
        { field: 'reasonCodes[0]', code: 'custom_nonexistent_code' },
        { field: 'reasonCodes[1]', code: '<nonconforming len=14>' },
      ]);

      expect(proxy.getLastRejectedReasonCodes()).toEqual(res.rejectedReasonCodes);
      const diag = proxy.getDiagnostics();
      expect(diag.lastRejectedReasonCodes).toEqual(res.rejectedReasonCodes);
    });

    it('handleCommand preserves fallbackReason=truncated when finish_reason=length', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { content: '{"intent": "LEAVE_LATER", "slots":' },
              finish_reason: 'length',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 2048, total_tokens: 2098 },
        }),
      });
      globalThis.fetch = fetchSpy as any;

      const proxy = new ModelDevProxy({
        ledgerPath: s1cmdLedger,
        apiKey: 'sk-test-s1cmd-key',
        liveEnabled: true,
        maxCalls: 10,
      });

      const res = await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
        confirmedFactKeys: ['habit_rain_transit'],
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
      });

      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('truncated');
      expect(proxy.getLastFinishReason()).toBe('length');
    });

    it('runLiveVerification records rejectedReasonCodes in LiveVerificationCallRecord and report MD/JSON', async () => {
      const testReportMd = path.join(s1cmdDir, 'test-s1cmd-report.md');
      const testReportJson = path.join(s1cmdDir, 'test-s1cmd-report.json');

      process.env.MODEL_API_KEY = 'sk-mock-s1cmd-key';
      process.env.MODEL_LIVE_ENABLED = '1';
      process.env.MODEL_LIVE_MAX_CALLS = '10';

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        const isCommand = body.messages.some((m: any) => m.content && m.content.includes('decision_command'));

        if (isCommand) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      intent: 'LEAVE_LATER',
                      slots: { deltaMinutes: 15 },
                      citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
                      citedFactKeys: ['habit_rain_transit'],
                      reasonCodes: ['novel_reason_code_abc'],
                    }),
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            }),
          } as any;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ wording: 'Piano lesson at 3:00 PM' }) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        } as any;
      });

      const { ok, report } = await runLiveVerification({
        confirmBilled: true,
        skipPreconditions: true,
        tempLedgerPath: s1cmdLedger,
        mockFetch: mockFetch as any,
        reportPath: testReportMd,
        jsonReportPath: testReportJson,
      });

      expect(ok).toBe(true);
      const commandCall = report.calls.find(c => c.endpoint === 'command');
      expect(commandCall).toBeDefined();
      expect(commandCall?.fallbackReason).toBe('invalid_reason_code');
      expect(commandCall?.rejectedReasonCodes).toEqual([
        { field: 'reasonCodes[0]', code: 'novel_reason_code_abc' },
      ]);

      // Check written JSON
      const writtenJson = JSON.parse(fs.readFileSync(testReportJson, 'utf-8'));
      const jsonCommandCall = writtenJson.calls.find((c: any) => c.endpoint === 'command');
      expect(jsonCommandCall.rejectedReasonCodes).toEqual([
        { field: 'reasonCodes[0]', code: 'novel_reason_code_abc' },
      ]);

      // Check written Markdown
      const writtenMd = fs.readFileSync(testReportMd, 'utf-8');
      expect(writtenMd).toContain('### Rejected Reason Codes Telemetry');
      expect(writtenMd).toContain('`reasonCodes[0]`');
      expect(writtenMd).toContain('`novel_reason_code_abc`');

      delete process.env.MODEL_API_KEY;
      delete process.env.MODEL_LIVE_ENABLED;
      delete process.env.MODEL_LIVE_MAX_CALLS;
    });

    it('command live mode refuses when MODEL_TIMEOUT_MS is below 20000 with 0 fetches, and passes with 20000 and MODEL_MAX_TOKENS=4096', async () => {
      const timeoutTestReportMd = path.join(s1cmdDir, 'test-timeout-guard-report.md');
      const timeoutTestReportJson = path.join(s1cmdDir, 'test-timeout-guard-report.json');

      process.env.MODEL_API_KEY = 'sk-mock-timeout-key';
      process.env.MODEL_LIVE_ENABLED = '1';
      process.env.MODEL_LIVE_MAX_CALLS = '6';
      process.env.MODEL_MAX_TOKENS = '4096';
      delete process.env.MODEL_TIMEOUT_MS; // default timeout is 2000ms < 20000ms

      let fetchCount = 0;
      const stubbedFetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          clone: () => ({
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      intent: 'LEAVE_LATER',
                      slots: { deltaMinutes: 15 },
                      citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
                      citedFactKeys: ['habit_rain_transit'],
                      reasonCodes: ['weather_adjusted'],
                    }),
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            }),
          }),
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'LEAVE_LATER',
                    slots: { deltaMinutes: 15 },
                    citedSignalIds: ['weather:2026-10-28T11:30:00Z'],
                    citedFactKeys: ['habit_rain_transit'],
                    reasonCodes: ['weather_adjusted'],
                  }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        } as any;
      });

      // 1. Without MODEL_TIMEOUT_MS (or < 20000): must refuse with 0 fetches
      await expect(
        runLiveVerification({
          only: 'command',
          confirmBilled: true,
          skipPreconditions: true,
          mockFetch: stubbedFetch as any,
          tempLedgerPath: s1cmdLedger,
          reportPath: timeoutTestReportMd,
          jsonReportPath: timeoutTestReportJson,
        })
      ).rejects.toThrow(/MODEL_TIMEOUT_MS must be at least 20000/);

      expect(fetchCount).toBe(0);

      // 2. With MODEL_TIMEOUT_MS=20000 and MODEL_MAX_TOKENS=4096: must pass the guard
      process.env.MODEL_TIMEOUT_MS = '20000';
      const result = await runLiveVerification({
        only: 'command',
        confirmBilled: true,
        skipPreconditions: true,
        mockFetch: stubbedFetch as any,
        tempLedgerPath: s1cmdLedger,
        reportPath: timeoutTestReportMd,
        jsonReportPath: timeoutTestReportJson,
      });

      expect(result.ok).toBe(true);
      expect(fetchCount).toBeGreaterThan(0);

      delete process.env.MODEL_TIMEOUT_MS;
      delete process.env.MODEL_MAX_TOKENS;
      delete process.env.MODEL_API_KEY;
      delete process.env.MODEL_LIVE_ENABLED;
      delete process.env.MODEL_LIVE_MAX_CALLS;
    });
  });
});

afterAll(() => {
  try {
    resetLedger(suiteLedgerPath);
    if (fs.existsSync(suiteTempDir)) {
      fs.rmSync(suiteTempDir, { recursive: true, force: true });
    }
  } catch {}
  delete process.env.MODEL_LIVE_LEDGER_PATH;
});
