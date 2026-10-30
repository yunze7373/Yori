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

  it('defaults call cap to 10 and clamps any higher value to at most 10', () => {
    expect(resolveMaxCalls({})).toBe(10);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '' })).toBe(10);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '5' })).toBe(5);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '10' })).toBe(10);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '100' })).toBe(10);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '999' })).toBe(10);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: '0' })).toBe(0);
    expect(resolveMaxCalls({ MODEL_LIVE_MAX_CALLS: 'invalid' })).toBe(10);
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

  it('verifies max_tokens <= 300 in request body across refine, reason, and command endpoints', async () => {
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
      for (const body of capturedBodies) {
        expect(body.max_tokens).toBeLessThanOrEqual(300);
      }
      expect(capturedBodies[0].max_tokens).toBe(150);
      expect(capturedBodies[1].max_tokens).toBe(250);
      expect(capturedBodies[2].max_tokens).toBe(300);
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

  it('verifies timeout clamp values: 100->500, 99999->20000, "abc"->2000, negative->2000, empty->2000', () => {
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '100' })).toBe(500);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '99999' })).toBe(20000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: 'abc' })).toBe(2000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '-500' })).toBe(2000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '' })).toBe(2000);
    expect(resolveTimeoutMs({})).toBe(2000);
    expect(resolveTimeoutMs({ MODEL_TIMEOUT_MS: '5000' })).toBe(5000);
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

  it('verifies max_tokens clamp values: 0->1, 2000->1024, "x"->undefined, empty->undefined', () => {
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '0' })).toBe(1);
    expect(resolveMaxTokensOverride({ MODEL_MAX_TOKENS: '2000' })).toBe(1024);
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
      expect(r1.fallbackReason).toBe('schema_invalid');

      // Whitespace only (reasoning token exhaustion)
      mockContent = '   \n  \t  ';
      const r2 = await proxy.handleRefine({
        templateId: 'depart',
        facts: { prepareTime: '2:05 PM', leaveTime: '2:25 PM', times: ['2:25 PM'] },
      });
      expect(r2.usedFallback).toBe(true);
      expect(r2.fallbackReason).toBe('schema_invalid');

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
      expect(r3.fallbackReason).toBe('schema_invalid');

      // Command path with empty content
      const r4 = await proxy.handleCommand({
        utterance: 'Can I leave later?',
        availableModes: ['drive', 'bus'],
        knownFactKeys: ['habit_rain_transit'],
      });
      expect(r4.usedFallback).toBe(true);
      expect(r4.fallbackReason).toBe('schema_invalid');
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

  it('handleRefine: truncated JSON with finish_reason=length safely falls back and records diagnostics', async () => {
    // Model generation truncated midway through json
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
    expect(res.fallbackReason).toBe('schema_invalid');
    expect(res.wording).toBe('Piano lesson at 3:00 PM');

    const diag = proxy.getDiagnostics();
    expect(diag.lastFinishReason).toBe('length');
    expect(diag.lastReasoningTokens).toBe(950);
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

afterAll(() => {
  try {
    resetLedger(suiteLedgerPath);
    if (fs.existsSync(suiteTempDir)) {
      fs.rmSync(suiteTempDir, { recursive: true, force: true });
    }
  } catch {}
  delete process.env.MODEL_LIVE_LEDGER_PATH;
});
