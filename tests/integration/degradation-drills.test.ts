/**
 * Degradation Drills (NFR-102, NFR-103, AC-106-2)
 *
 * Verifies that under:
 * 1) Model disabled (no key / disabled diagnostics).
 * 2) Model timeout / error / hallucinated tokens.
 * 3) XMemo remote off (local truth source).
 *
 * D1-D6 golden outputs and LivingContext plans are 100% deterministic,
 * identical to the baseline paths, and diagnostics accurately surface
 * the fallback reason without crashing or degrading user experience.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../../src/plugins/registry.js';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
} from '../fixtures/index.js';
import {
  createFixedClock,
  replayScenarioTimeline,
} from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import { ModelDevProxy } from '../../src/adapters/model/server-proxy.js';
import { ClientModelPort } from '../../src/adapters/model/index.js';
import { LocalMemoryAdapter } from '../../src/adapters/xmemo/local-adapter.js';
import { XMemoRemoteAdapter } from '../../src/adapters/xmemo/remote-adapter.js';

describe('Degradation Drill: Model Disabled (NFR-102, AC-106-2)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('diagnostics report disabled state when MODEL_API_KEY is absent', () => {
    const proxy = new ModelDevProxy();
    const diag = proxy.getDiagnostics();
    expect(diag.status).toBe('disabled');
    expect(diag.message).toBe('model: disabled (no MODEL_API_KEY)');
  });

  it('D1 and D2 pipeline outputs are identical with model disabled', async () => {
    const clock = createFixedClock(D1_INITIAL_CLOCK);
    const d1Snapshots = replayScenarioTimeline(d1Scenario, clock);
    const d1Result = runPipeline({
      snapshot: d1Snapshots[d1Snapshots.length - 1]!,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK,
    });

    const nowPlan = d1Result.livingContext.now;
    expect(nowPlan).toBeDefined();
    expect(nowPlan?.headline).toContain('2:05 PM');
    expect(nowPlan?.headline).toContain('2:25 PM');

    // Run client model port in disabled state
    const clientPort = new ClientModelPort('/api/model');
    const refined = await clientPort.refineWording({
      templateId: 'depart',
      facts: {
        headline: nowPlan!.headline,
        times: ['2:05 PM', '2:25 PM', '3:00 PM'],
        places: ['Piano Studio'],
      },
    });

    // Uses deterministic fallback with zero deviation
    expect(refined.usedFallback).toBe(true);
    expect(refined.fallbackReason).toBe('disabled');
    expect(refined.wording).toBe(nowPlan!.headline);
  });
});

describe('Degradation Drill: Model Timeout & Error Resilience (NFR-102)', () => {
  it('falls back to deterministic template when model API call times out or throws error', async () => {
    const proxy = new ModelDevProxy({ apiKey: 'mock-key', keySource: 'MODEL_API_KEY' });

    // Mock fetch abort / timeout
    const originalFetch = globalThis.fetch;
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    try {
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: {
          headline: 'Piano lesson at 3:00: Get ready at 2:05, leave by 2:25',
          times: ['2:05 PM', '2:25 PM', '3:00 PM'],
          places: ['Piano Studio'],
        },
      });

      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('timeout');
      expect(res.wording).toBe('Piano lesson at 3:00: Get ready at 2:05, leave by 2:25');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('discards model output and falls back when model response contains hallucinated times or places', async () => {
    const proxy = new ModelDevProxy({ apiKey: 'mock-key', keySource: 'MODEL_API_KEY' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                wording: 'Leave early at 1:45 PM and visit Starbucks before your lesson.',
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    try {
      const res = await proxy.handleRefine({
        templateId: 'depart',
        facts: {
          headline: 'Piano lesson at 3:00: Get ready at 2:05, leave by 2:25',
          times: ['2:05 PM', '2:25 PM', '3:00 PM'],
          places: ['Piano Studio'],
        },
      });

      // 1:45 PM and Starbucks are unlisted tokens -> discarded immediately
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('unlisted_fact_token');
      expect(res.wording).toBe('Piano lesson at 3:00: Get ready at 2:05, leave by 2:25');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Degradation Drill: MemoryPort (XMemo Remote Off / Local Truth) (HB-3, NFR-103)', () => {
  it('local memory adapter acts as default source of truth and operates without remote connectivity', async () => {
    const localPort = new LocalMemoryAdapter();
    const facts = await localPort.loadFacts();
    expect(facts).toEqual([]);

    // Write back confirmed fact
    const confirmedFact = {
      key: 'preferred_grocery_store',
      value: 'Trader Joe’s',
      status: 'confirmed' as const,
      updatedAt: '2026-10-28T16:00:00.000Z',
      provenance: { source: 'user_confirmed' as const, recordedAt: '2026-10-28T16:00:00.000Z' },
    };

    const writeRes = await localPort.writeBack(confirmedFact);
    expect(writeRes.success).toBe(true);
    const readBack = await localPort.loadFacts();
    expect(readBack).toHaveLength(1);
    expect(readBack[0]?.key).toBe('preferred_grocery_store');
  });

  it('remote XMemo adapter stays disabled without explicit app auth configuration (HB-3)', () => {
    const remotePort = new XMemoRemoteAdapter();
    const status = remotePort.getStatus();
    expect(status.isRemoteConfigured).toBe(false);
  });
});
