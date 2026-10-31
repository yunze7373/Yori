/**
 * CompositeMemoryAdapter Unit Tests
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, AC-203-2, and INBOX-20261031-E69766 (HB-3).
 *
 * Verifies:
 * 1. Local-first sovereign truth: local storage always loads first and takes precedence.
 * 2. Remote gating: remote is accessed only when status is enabled + connected.
 * 3. Read merge rules:
 *    - Remote confirmed facts for Yori-managed keys merge in cleanly.
 *    - Conflict: local confirmed facts take precedence without being overwritten.
 *    - Pending, rejected, and non-Yori keys are strictly ignored.
 *    - Remote provenance is truthful ('xmemo', note 'Synced from XMemo vault').
 * 4. Write invariant INV-107:
 *    - Only confirmed facts can be written back.
 *    - Throws on pending or rejected facts.
 *    - Writes to local first, then remote if connected.
 * 5. Failure modes & silent fallback:
 *    - Bounded timeout, 401, 403, 5xx, network error, or invalid JSON fall back silently to local storage.
 *    - Truthful connectionState ('off' | 'connected-mock' | 'error-fallback').
 * 6. Security assertions:
 *    - Zero requests to external hosts (xmemo.dev).
 *    - Zero Authorization headers from client.
 */

import { describe, it, expect, vi } from 'vitest';
import { CompositeMemoryAdapter } from './composite-adapter.js';
import { XMemoRemoteAdapter } from './remote-adapter.js';
import { createCompositeMemoryPort } from './index.js';
import { YoriStorage, InMemoryStorageDriver } from '../../core/storage/index.js';
import { createMemoryFact, type MemoryFact } from '../../core/contracts/index.js';

describe('CompositeMemoryAdapter (XMEMO-PORT-WIRE)', () => {
  const makeFact = (
    key: string,
    value: any,
    status: 'confirmed' | 'pending' | 'rejected' = 'confirmed',
    source: any = 'user_confirmed'
  ): MemoryFact => {
    return createMemoryFact(
      key,
      value,
      status,
      { source, recordedAt: '2026-10-31T00:00:00.000Z' },
      '2026-10-31T00:00:00.000Z'
    );
  };

  const createMockStorage = (initialFacts: MemoryFact[] = []): YoriStorage => {
    const driver = new InMemoryStorageDriver();
    const storage = new YoriStorage(driver);
    storage.save(
      {
        memoryFacts: initialFacts,
        proposals: [],
        suppressions: [],
        promptBudget: { date: '2026-10-31', count: 0 },
        acceptedPlanIds: [],
      },
      '2026-10-31T00:00:00.000Z'
    );
    return storage;
  };

  describe('1. Local-first sovereign truth & remote gating', () => {
    it('loads local facts when remote is disabled (flag off)', async () => {
      const localFact = makeFact('prep_buffer_minutes', 15, 'confirmed');
      const storage = createMockStorage([localFact]);
      const adapter = createCompositeMemoryPort(storage, {
        statusChecker: async () => ({ enabled: false, connected: false }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('prep_buffer_minutes');
      expect(facts[0]?.value).toBe(15);

      const status = adapter.getStatus();
      expect(status.adapter).toBe('composite');
      expect(status.isRemoteConfigured).toBe(false);
      expect(status.connectionState).toBe('off');
    });

    it('loads local facts when remote is enabled but disconnected', async () => {
      const localFact = makeFact('taste_preference', 'ramen', 'confirmed');
      const storage = createMockStorage([localFact]);
      const adapter = new CompositeMemoryAdapter({
        storage,
        statusChecker: async () => ({ enabled: true, connected: false }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('taste_preference');

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('off');
    });
  });

  describe('2. Read merge contract & conflict resolution', () => {
    it('merges remote confirmed facts for Yori-managed keys into local memory', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/preferences')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                key: 'rain_transport_preference',
                value: 'drive',
                status: 'confirmed',
                note: 'Synced from XMemo vault',
              },
            ],
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(2);

      // Local fact preserved
      const prepFact = facts.find(f => f.key === 'prep_buffer_minutes');
      expect(prepFact).toBeDefined();
      expect(prepFact?.value).toBe(10);

      // Remote fact merged with truthful provenance
      const rainFact = facts.find(f => f.key === 'rain_transport_preference');
      expect(rainFact).toBeDefined();
      expect(rainFact?.value).toBe('drive');
      expect(rainFact?.status).toBe('confirmed');
      expect(rainFact?.provenance.source).toBe('xmemo');
      expect(rainFact?.provenance.note).toBe('Synced from XMemo vault');

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('connected-mock');
    });

    it('resolves conflicts in favor of local confirmed facts (local sovereignty)', async () => {
      // Local has rain_transport_preference = 'train'
      const localFact = makeFact('rain_transport_preference', 'train', 'confirmed');
      const storage = createMockStorage([localFact]);

      // Remote attempts to provide rain_transport_preference = 'drive'
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              key: 'rain_transport_preference',
              value: 'drive',
              status: 'confirmed',
            },
          ],
        } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('rain_transport_preference');
      expect(facts[0]?.value).toBe('train'); // Local won!
    });

    it('ignores remote pending, rejected, and non-Yori keys (never auto-confirms)', async () => {
      const storage = createMockStorage([]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => [
            // Valid Yori key, but pending: MUST BE IGNORED
            {
              key: 'rain_transport_preference',
              value: 'drive',
              status: 'pending',
            },
            // Valid Yori key, but rejected: MUST BE IGNORED
            {
              key: 'favorite_cuisine',
              value: 'thai',
              status: 'rejected',
            },
            // Foreign unmanaged key: MUST BE IGNORED
            {
              key: 'arbitrary_foreign_secret',
              value: 'pass123',
              status: 'confirmed',
            },
            // Valid Yori key and confirmed: MUST BE MERGED
            {
              key: 'taste_preference',
              value: 'sushi',
              status: 'confirmed',
            },
          ],
        } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('taste_preference');
      expect(facts[0]?.value).toBe('sushi');
      expect(facts[0]?.status).toBe('confirmed');
    });

    it('handles nested MCP tool result format correctly', async () => {
      const storage = createMockStorage([]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify([
                    {
                      key: 'favorite_cuisine',
                      value: 'ramen',
                      status: 'confirmed',
                    },
                  ]),
                },
              ],
            },
          }),
        } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('favorite_cuisine');
      expect(facts[0]?.value).toBe('ramen');
    });
  });

  describe('3. Write-back invariant INV-107 & local-first synchronization', () => {
    it('throws fail-closed on attempt to write back pending fact', async () => {
      const adapter = new CompositeMemoryAdapter({
        storage: createMockStorage(),
      });
      const pendingFact = makeFact('taste_preference', 'ramen', 'pending');

      await expect(adapter.writeBack(pendingFact)).rejects.toThrow(
        /MemoryPort invariant violation \(INV-107\)/
      );
    });

    it('throws fail-closed on attempt to write back rejected fact', async () => {
      const adapter = new CompositeMemoryAdapter({
        storage: createMockStorage(),
      });
      const rejectedFact = makeFact('taste_preference', 'ramen', 'rejected');

      await expect(adapter.writeBack(rejectedFact)).rejects.toThrow(
        /MemoryPort invariant violation \(INV-107\)/
      );
    });

    it('writes confirmed fact to local storage and dispatches to remote proxy when connected', async () => {
      const storage = createMockStorage();
      let remotePayload: any = null;

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/confirmed-facts')) {
          remotePayload = JSON.parse(init?.body as string);
          return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const confirmedFact = makeFact('prep_buffer_minutes', 20, 'confirmed');
      const result = await adapter.writeBack(confirmedFact);

      expect(result.success).toBe(true);

      // Verify local storage was updated
      const localFacts = storage.load()?.payload.memoryFacts ?? [];
      expect(localFacts).toHaveLength(1);
      expect(localFacts[0]?.key).toBe('prep_buffer_minutes');
      expect(localFacts[0]?.value).toBe(20);

      // Verify remote dispatch was made
      expect(remotePayload).toBeDefined();
      expect(remotePayload.key).toBe('prep_buffer_minutes');
      expect(remotePayload.value).toBe(20);
      expect(remotePayload.status).toBe('confirmed');
    });

    it('writes locally without error when remote is disabled', async () => {
      const storage = createMockStorage();
      const mockFetch = vi.fn();

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: false, connected: false }),
      });

      const confirmedFact = makeFact('taste_preference', 'curry', 'confirmed');
      const result = await adapter.writeBack(confirmedFact);

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();

      const localFacts = storage.load()?.payload.memoryFacts ?? [];
      expect(localFacts).toHaveLength(1);
      expect(localFacts[0]?.value).toBe('curry');
    });
  });

  describe('4. Silent local fallback across all failure modes', () => {
    it('falls back silently to local on HTTP 500 server error', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return { ok: false, status: 500 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('prep_buffer_minutes');

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });

    it('falls back silently to local on HTTP 401 unauthorized', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return { ok: false, status: 401 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });

    it('falls back silently to local on HTTP 403 forbidden', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return { ok: false, status: 403 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });

    it('falls back silently to local on network throw / fetch error', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      const mockFetch: typeof fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });

    it('falls back silently on timeout with bounded AbortController', async () => {
      const localFact = makeFact('prep_buffer_minutes', 10, 'confirmed');
      const storage = createMockStorage([localFact]);

      // Mock fetch that hangs until aborted
      const mockFetch: typeof fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted.'));
            });
          }
        });
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        timeoutMs: 50, // Short timeout for unit test
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('prep_buffer_minutes');

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });

    it('preserves local write success when remote write fails with 500', async () => {
      const storage = createMockStorage();

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        return { ok: false, status: 500 } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage,
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      const fact = makeFact('prep_buffer_minutes', 25, 'confirmed');
      const result = await adapter.writeBack(fact);

      // Local write succeeded
      expect(result.success).toBe(true);
      expect(result.error).toContain('Remote write fallback');

      // Local storage has the new fact
      const localFacts = storage.load()?.payload.memoryFacts ?? [];
      expect(localFacts).toHaveLength(1);
      expect(localFacts[0]?.value).toBe(25);

      const status = adapter.getStatus();
      expect(status.connectionState).toBe('error-fallback');
    });
  });

  describe('5. Client security & zero-token static invariants', () => {
    it('ensures client fetch never sends Authorization header or credentials', async () => {
      const headersSeen: Record<string, string>[] = [];
      const urlsSeen: string[] = [];

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        urlsSeen.push(url);
        headersSeen.push((init?.headers as Record<string, string>) || {});
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as Response;
      });

      const adapter = new CompositeMemoryAdapter({
        storage: createMockStorage(),
        fetchFn: mockFetch,
        statusChecker: async () => ({ enabled: true, connected: true }),
      });

      await adapter.loadFacts();

      const writeFact = makeFact('taste_preference', 'ramen', 'confirmed');
      await adapter.writeBack(writeFact);

      // Verify all requests are same-origin /api/xmemo
      for (const url of urlsSeen) {
        expect(url).toMatch(/^\/api\/xmemo\//);
        expect(url).not.toContain('xmemo.dev');
      }

      // Verify NO Authorization headers were sent
      for (const headers of headersSeen) {
        expect(headers['Authorization']).toBeUndefined();
        expect(headers['authorization']).toBeUndefined();
      }
    });

    it('XMemoRemoteAdapter strips appAuthToken in browser environment', () => {
      // Temporarily mock window
      const originalWindow = (global as any).window;
      try {
        (global as any).window = {};

        const remote = new XMemoRemoteAdapter('forbidden-client-token');
        const status = remote.getStatus();
        // Since window is defined, token must be neutralized and isRemoteConfigured false
        expect(status.isRemoteConfigured).toBe(false);
      } finally {
        if (originalWindow !== undefined) {
          (global as any).window = originalWindow;
        } else {
          delete (global as any).window;
        }
      }
    });
  });
});
