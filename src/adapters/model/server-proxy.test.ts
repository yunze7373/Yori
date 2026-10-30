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
import {
  ModelDevProxy,
  resolveModelConfig,
  resolveMaxCalls,
  resetProcessLiveCallCount,
  getProcessLiveCallCount,
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
    resetProcessLiveCallCount();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
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
    resetProcessLiveCallCount();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
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
    resetProcessLiveCallCount();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProcessLiveCallCount();
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
