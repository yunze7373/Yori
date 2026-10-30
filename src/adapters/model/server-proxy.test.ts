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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  readLedgerState,
  resetProcessLiveCallCount,
  getProcessLiveCallCount,
  resetLedger,
} from './server-proxy.js';
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
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    delete process.env['MODEL_LIVE_LEDGER_PATH'];
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
    resetProcessLiveCallCount();
    resetLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
    resetLedger();
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
