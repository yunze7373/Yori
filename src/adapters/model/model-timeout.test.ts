/**
 * Unit Tests for Shared Model Timeout & In-flight State (APP-LIVE-RUNTIME / AC-LIVE-1)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_LIVE_MODEL_TIMEOUT_MS,
  MIN_MODEL_TIMEOUT_MS,
  MAX_MODEL_TIMEOUT_MS,
  resolveModelTimeoutMs,
} from './timeout-config.js';
import { ClientModelPort } from './index.js';
import { resolveTimeoutMs } from './server-proxy.js';
import { ModelCommandInterpreter } from '../../ui/conversation/model-interpreter.js';
import { FIXTURE_CMD_LEAVE_15_MIN } from '../../../tests/fixtures/model-command-fixtures.js';

describe('Shared Model Timeout Configuration (AC-LIVE-1)', () => {
  describe('resolveModelTimeoutMs & Bounded Clamping', () => {
    it('exports bounded constants [2000, 30000] and default 15000', () => {
      expect(DEFAULT_LIVE_MODEL_TIMEOUT_MS).toBe(15000);
      expect(MIN_MODEL_TIMEOUT_MS).toBe(2000);
      expect(MAX_MODEL_TIMEOUT_MS).toBe(30000);
    });

    it('defaults to 15000ms when unset or empty', () => {
      expect(resolveModelTimeoutMs(undefined)).toBe(15000);
      expect(resolveModelTimeoutMs('')).toBe(15000);
      expect(resolveModelTimeoutMs('   ')).toBe(15000);
      expect(resolveModelTimeoutMs('invalid')).toBe(15000);
      expect(resolveModelTimeoutMs(-100)).toBe(15000);
    });

    it('clamps strictly between 2000ms and 30000ms', () => {
      // Below min (2000ms)
      expect(resolveModelTimeoutMs('500')).toBe(2000);
      expect(resolveModelTimeoutMs('1000')).toBe(2000);
      expect(resolveModelTimeoutMs('1999')).toBe(2000);

      // In range
      expect(resolveModelTimeoutMs('2000')).toBe(2000);
      expect(resolveModelTimeoutMs('9400')).toBe(9400);
      expect(resolveModelTimeoutMs('15000')).toBe(15000);
      expect(resolveModelTimeoutMs('25000')).toBe(25000);
      expect(resolveModelTimeoutMs('30000')).toBe(30000);

      // Above max (30000ms)
      expect(resolveModelTimeoutMs('35000')).toBe(30000);
      expect(resolveModelTimeoutMs('60000')).toBe(30000);
      expect(resolveModelTimeoutMs('99999')).toBe(30000);
    });

    it('ensures client and server ceiling configurations agree by default', () => {
      const clientDefault = resolveModelTimeoutMs();
      const serverDefault = resolveTimeoutMs({});
      expect(clientDefault).toBe(15000);
      expect(serverDefault).toBe(15000);
      expect(clientDefault).toBe(serverDefault);

      // Environment override consistency
      const env = { MODEL_TIMEOUT_MS: '22000' };
      expect(resolveModelTimeoutMs(env.MODEL_TIMEOUT_MS)).toBe(resolveTimeoutMs(env));
    });
  });

  describe('ClientModelPort timeout configuration', () => {
    it('initializes with default 15000ms timeout', () => {
      const port = new ClientModelPort('/api/model');
      expect(port.getTimeoutMs()).toBe(15000);
    });

    it('respects constructor timeoutMs and clamps to [2000, 30000]', () => {
      const portLow = new ClientModelPort('/api/model', 500);
      expect(portLow.getTimeoutMs()).toBe(2000);

      const portHigh = new ClientModelPort('/api/model', 50000);
      expect(portHigh.getTimeoutMs()).toBe(30000);

      const portExact = new ClientModelPort('/api/model', 9400);
      expect(portExact.getTimeoutMs()).toBe(9400);
    });
  });

  describe('ModelCommandInterpreter Live Mode & In-Flight Tracking', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    });

    it('completes a simulated 9.4s response when timeout is 15000ms', async () => {
      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: '/api/model/command',
        timeoutMs: 15000,
      });

      // Mock fetch resolving after a simulated delay
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: FIXTURE_CMD_LEAVE_15_MIN,
          }),
        };
      });

      const promise = interpreter.interpretAsync('Leave 15 minutes later', {
        availableModes: ['drive', 'bus'],
        availableSignalIds: [
          'weather:2026-10-28T20:35:00.000Z',
          'calendar:2026-10-28T17:00:00.000Z',
        ],
        confirmedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
      });

      const res = await promise;
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.engineStatus).toBe('meta_model_live');
      expect(interpreter.isInFlight()).toBe(false);
    });

    it('aborts and discards to deterministic fallback on timeout (> 15000ms)', async () => {
      vi.useFakeTimers();

      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: '/api/model/command',
        timeoutMs: 15000,
      });

      globalThis.fetch = vi.fn().mockImplementation((_url, options: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = interpreter.interpretAsync('Can I leave later?', {
        availableModes: ['drive', 'bus'],
      });

      expect(interpreter.isInFlight()).toBe(true);

      // Advance timers past timeout ceiling (15000ms)
      vi.advanceTimersByTime(15100);

      const res = await promise;
      // Discarded to deterministic fallback
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.engineStatus).toBe('offline_deterministic');
      expect(interpreter.isInFlight()).toBe(false);
    });

    it('cancels in-flight call cleanly via cancelInFlight()', async () => {
      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: '/api/model/command',
        timeoutMs: 15000,
      });

      let abortObserved = false;
      globalThis.fetch = vi.fn().mockImplementation((_url, options: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            abortObserved = true;
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = interpreter.interpretAsync('Can I leave later?');
      expect(interpreter.isInFlight()).toBe(true);

      // Trigger user cancellation
      interpreter.cancelInFlight();
      expect(abortObserved).toBe(true);
      expect(interpreter.isInFlight()).toBe(false);

      const res = await promise;
      // Discarded to deterministic fallback without crash or blank state
      expect(res.intent).toBe('LEAVE_LATER');
      expect(res.engineStatus).toBe('offline_deterministic');
    });

    it('defaults to 30000ms client timeout in live mode and respects env lowering', () => {
      const savedEnv = process.env.MODEL_TIMEOUT_MS;
      try {
        delete process.env.MODEL_TIMEOUT_MS;
        const defaultLiveInterpreter = new ModelCommandInterpreter({ mode: 'live' });
        expect(defaultLiveInterpreter.getTimeoutMs()).toBe(30000);

        process.env.MODEL_TIMEOUT_MS = '10000';
        const loweredInterpreter = new ModelCommandInterpreter({ mode: 'live' });
        expect(loweredInterpreter.getTimeoutMs()).toBe(10000);

        // Env cannot raise timeout above 30000ms
        process.env.MODEL_TIMEOUT_MS = '45000';
        const clampedInterpreter = new ModelCommandInterpreter({ mode: 'live' });
        expect(clampedInterpreter.getTimeoutMs()).toBe(30000);
      } finally {
        if (savedEnv !== undefined) {
          process.env.MODEL_TIMEOUT_MS = savedEnv;
        } else {
          delete process.env.MODEL_TIMEOUT_MS;
        }
      }
    });

    it('waits up to 30000ms before timing out in live mode by default', async () => {
      vi.useFakeTimers();
      const savedEnv = process.env.MODEL_TIMEOUT_MS;
      delete process.env.MODEL_TIMEOUT_MS;

      try {
        const interpreter = new ModelCommandInterpreter({
          mode: 'live',
          endpoint: '/api/model/command',
        });
        expect(interpreter.getTimeoutMs()).toBe(30000);

        globalThis.fetch = vi.fn().mockImplementation((_url, options: { signal: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const err = new Error('This operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          });
        });

        const promise = interpreter.interpretAsync('Can I leave later?', {
          availableModes: ['drive', 'bus'],
        });

        expect(interpreter.isInFlight()).toBe(true);

        // Advance 25 seconds: still in-flight, not timed out!
        vi.advanceTimersByTime(25000);
        expect(interpreter.isInFlight()).toBe(true);

        // Advance past 30 seconds: now timed out
        vi.advanceTimersByTime(5100);
        const res = await promise;
        expect(res.engineStatus).toBe('offline_deterministic');
        expect(interpreter.isInFlight()).toBe(false);
      } finally {
        if (savedEnv !== undefined) {
          process.env.MODEL_TIMEOUT_MS = savedEnv;
        } else {
          delete process.env.MODEL_TIMEOUT_MS;
        }
      }
    });
  });
});
