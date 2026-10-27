/**
 * ModelPort Unit Tests
 * Governed by Architecture Rev3 Section 9.1 and AC-106-1, AC-106-2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateFactsInWording, parseTimeToMinutes } from './fact-checker.js';
import { ModelDevProxy, resolveModelConfig } from './server-proxy.js';
import type { ModelPortRequest } from './types.js';

describe('ModelPort Fact Checker (INV-103, AC-106-1)', () => {
  const sampleRequest: ModelPortRequest = {
    intentId: 'depart',
    templateWording: 'Piano lesson at 3:00 PM: Get ready at 2:05 PM, leave by 2:25 PM',
    suppliedFacts: {
      times: ['2:05 PM', '2:25 PM', '3:00 PM'],
      places: ['Piano Studio', '123 Harmony Way', 'Home'],
      contextSummary: 'Calendar departure with rain',
    },
  };

  it('correctly parses 12h and 24h time strings to minutes', () => {
    expect(parseTimeToMinutes('2:05 PM')).toBe(14 * 60 + 5);
    expect(parseTimeToMinutes('2:05 AM')).toBe(2 * 60 + 5);
    expect(parseTimeToMinutes('12:00 PM')).toBe(12 * 60);
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
    expect(parseTimeToMinutes('14:25')).toBe(14 * 60 + 25);
    expect(parseTimeToMinutes('3 PM')).toBe(15 * 60);
  });

  it('accepts wording with exact and matching time and place tokens', () => {
    const validWording = 'Time for Piano Studio! Get ready at 2:05 PM and leave by 2:25 PM for your 3:00 PM lesson.';
    const result = validateFactsInWording(validWording, sampleRequest.suppliedFacts);
    expect(result.valid).toBe(true);
    expect(result.unlistedTokens).toHaveLength(0);
  });

  it('discards wording containing an unlisted hallucinated time token', () => {
    // 2:45 PM is not in the supplied facts!
    const hallucinatedTimeWording = 'You should leave by 2:45 PM for your 3:00 PM lesson at Piano Studio.';
    const result = validateFactsInWording(hallucinatedTimeWording, sampleRequest.suppliedFacts);
    expect(result.valid).toBe(false);
    expect(result.unlistedTokens).toContain('2:45 PM');
  });

  it('discards wording containing an unlisted place or venue token', () => {
    // "Starbucks Cafe" or "Tokyo Dentist" is not in supplied places!
    const hallucinatedPlaceWording = 'Stop by Starbucks Cafe before heading to your 3:00 PM lesson.';
    const result = validateFactsInWording(hallucinatedPlaceWording, sampleRequest.suppliedFacts);
    expect(result.valid).toBe(false);
    expect(result.unlistedTokens.some(t => t.toLowerCase().includes('cafe') || t.toLowerCase().includes('starbucks'))).toBe(true);
  });
});

describe('ModelDevProxy Server Configuration & Diagnostics (AC-106-2)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['MODEL_API_KEY'];
    delete process.env['META_API_KEY'];
    delete process.env['MODEL_BASE_URL'];
    delete process.env['MODEL_NAME'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports disabled status when no API key is present', () => {
    const proxy = new ModelDevProxy();
    const diag = proxy.getDiagnostics();
    expect(diag.status).toBe('disabled');
    expect(diag.message).toBe('model: disabled (no MODEL_API_KEY)');
  });

  it('returns deterministic template wording when model is disabled (AC-106-2)', async () => {
    const proxy = new ModelDevProxy();
    const request: ModelPortRequest = {
      intentId: 'depart',
      templateWording: 'Piano lesson at 3:00 PM: Get ready at 2:05 PM, leave by 2:25 PM',
      suppliedFacts: {
        times: ['2:05 PM', '2:25 PM', '3:00 PM'],
        places: ['Piano Studio'],
      },
    };

    const res = await proxy.handleRefine(request);
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe('disabled');
    expect(res.wording).toBe(request.templateWording);
  });

  it('prefers MODEL_API_KEY over META_API_KEY alias and logs only variable name', () => {
    process.env['MODEL_API_KEY'] = 'secret-model-key-12345';
    process.env['META_API_KEY'] = 'secret-meta-key-67890';

    const loggedMessages: string[] = [];
    const config = resolveModelConfig(msg => loggedMessages.push(msg));

    expect(config.keySource).toBe('MODEL_API_KEY');
    expect(config.apiKey).toBe('secret-model-key-12345');

    // Asserts logging records ONLY the variable name, NEVER the secret value!
    expect(loggedMessages).toHaveLength(1);
    expect(loggedMessages[0]).toContain('MODEL_API_KEY');
    expect(loggedMessages[0]).not.toContain('secret-model-key-12345');
    expect(loggedMessages[0]).not.toContain('secret-meta-key-67890');
  });

  it('accepts META_API_KEY alias when MODEL_API_KEY is unset and logs variable name', () => {
    process.env['META_API_KEY'] = 'secret-meta-key-only';

    const loggedMessages: string[] = [];
    const config = resolveModelConfig(msg => loggedMessages.push(msg));

    expect(config.keySource).toBe('META_API_KEY');
    expect(config.apiKey).toBe('secret-meta-key-only');
    expect(loggedMessages[0]).toContain('META_API_KEY');
    expect(loggedMessages[0]).not.toContain('secret-meta-key-only');
  });

  it('discards hallucinated wording and returns deterministic template when model response has unlisted tokens', async () => {
    // Mock fetch returning hallucinated wording
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                wording: 'Depart at 2:45 PM for your lesson!', // 2:45 is hallucinated
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    try {
      const proxy = new ModelDevProxy({ apiKey: 'test-key', keySource: 'MODEL_API_KEY' });
      const request: ModelPortRequest = {
        intentId: 'depart',
        templateWording: 'Piano lesson: Get ready at 2:05 PM, leave by 2:25 PM',
        suppliedFacts: {
          times: ['2:05 PM', '2:25 PM', '3:00 PM'],
          places: ['Piano Studio'],
        },
      };

      const res = await proxy.handleRefine(request);
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('unlisted_fact_token');
      expect(res.wording).toBe(request.templateWording);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to deterministic template on fetch timeout or network error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    try {
      const proxy = new ModelDevProxy({ apiKey: 'test-key', keySource: 'MODEL_API_KEY' });
      const request: ModelPortRequest = {
        intentId: 'depart',
        templateWording: 'Piano lesson: Get ready at 2:05 PM, leave by 2:25 PM',
        suppliedFacts: { times: ['2:05 PM'], places: [] },
      };

      const res = await proxy.handleRefine(request);
      expect(res.usedFallback).toBe(true);
      expect(res.fallbackReason).toBe('error');
      expect(res.wording).toBe(request.templateWording);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
