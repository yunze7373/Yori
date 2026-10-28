/**
 * MemoryPort Unit Tests
 * Governed by Architecture Rev3 Section 9.2, AC-106-3, HB-3, AC-203-1, and AC-203-2.
 */

import { describe, it, expect } from 'vitest';
import { createMemoryPort, LocalMemoryAdapter, XMemoRemoteAdapter } from './index.js';
import { YoriStorage, InMemoryStorageDriver } from '../../core/storage/index.js';
import { createMemoryFact, type MemoryFact } from '../../core/contracts/index.js';

describe('MemoryPort (XMemo & Local Adapters)', () => {
  it('defaults to LocalMemoryAdapter and reports local status (HB-3)', () => {
    const memoryPort = createMemoryPort();
    const status = memoryPort.getStatus();
    expect(status.adapter).toBe('local');
    expect(status.isRemoteConfigured).toBe(false);
  });

  it('LocalMemoryAdapter writes back CONFIRMED facts to storage', async () => {
    const driver = new InMemoryStorageDriver();
    const storage = new YoriStorage(driver);
    const memoryPort = new LocalMemoryAdapter(storage);

    const confirmedFact: MemoryFact = createMemoryFact(
      'rain_transport_preference',
      'drive_first',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    const result = await memoryPort.writeBack(confirmedFact);
    expect(result.success).toBe(true);

    const loaded = await memoryPort.loadFacts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe('rain_transport_preference');
    expect(loaded[0]?.status).toBe('confirmed');
  });

  it('LocalMemoryAdapter strictly REJECTS write-back of pending facts (INV-107, AC-106-3)', async () => {
    const memoryPort = new LocalMemoryAdapter();

    const pendingFact: MemoryFact = createMemoryFact(
      'prep_buffer_preference',
      { prep: 25 },
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(memoryPort.writeBack(pendingFact)).rejects.toThrow(
      /MemoryPort invariant violation \(INV-107\): only confirmed facts can be written back/
    );
  });

  it('LocalMemoryAdapter strictly REJECTS write-back of rejected facts (INV-107, AC-106-3)', async () => {
    const memoryPort = new LocalMemoryAdapter();

    const rejectedFact: MemoryFact = createMemoryFact(
      'suppress_lunch',
      'never',
      'rejected',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(memoryPort.writeBack(rejectedFact)).rejects.toThrow(
      /MemoryPort invariant violation \(INV-107\): only confirmed facts can be written back/
    );
  });

  it('XMemoRemoteAdapter stays off unless app auth configured and rejects non-confirmed write-back (HB-3)', async () => {
    const unconfiguredRemote = new XMemoRemoteAdapter();
    expect(unconfiguredRemote.getStatus().isRemoteConfigured).toBe(false);

    const pendingFact: MemoryFact = createMemoryFact(
      'key',
      'val',
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(unconfiguredRemote.writeBack(pendingFact)).rejects.toThrow(
      /MemoryPort invariant violation/
    );
  });

  it('XMemoRemoteAdapter supports typed OAuth config surface for Workstream C (AC-203-1)', async () => {
    const oauthConfig = {
      issuer: 'https://xmemo.dev',
      authorizationEndpoint: 'https://xmemo.dev/oauth/authorize',
      tokenEndpoint: 'https://xmemo.dev/oauth/token',
      registrationEndpoint: 'https://xmemo.dev/oauth/register',
      revocationEndpoint: 'https://xmemo.dev/oauth/revoke',
      clientId: 'yori-demo-client',
      scopes: ['memory:read', 'memory:write'],
    };

    const adapter = new XMemoRemoteAdapter({
      oauth: oauthConfig,
      appAuthToken: 'token-abc',
    });

    expect(adapter.getStatus().isRemoteConfigured).toBe(true);
    expect(adapter.getOAuthConfig()).toEqual(oauthConfig);
    expect(adapter.getStatus().statusText).toBe('XMemo remote adapter configured');

    const unauthedAdapter = new XMemoRemoteAdapter({
      oauth: oauthConfig,
    });
    expect(unauthedAdapter.getStatus().isRemoteConfigured).toBe(false);
    expect(unauthedAdapter.getOAuthConfig()?.issuer).toBe('https://xmemo.dev');
  });

  describe('XMemoRemoteAdapter: Mocked Network / Fallback Verification (AC-203-2)', () => {
    const mockConfirmedFact: MemoryFact = createMemoryFact(
      'transit_pref',
      'drive',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    it('loadFacts maps recalled items to confirmed facts with xmemo provenance on 200', async () => {
      const mockFetch = (async (url: string) => {
        expect(url).toBe('/api/xmemo/preferences');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              memories: [
                {
                  key: 'rain_habit',
                  value: 'drive',
                  updatedAt: '2026-10-28T10:00:00Z',
                  note: 'Synced from XMemo vault',
                },
              ],
            },
          }),
        };
      }) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: mockFetch,
        appAuthToken: 'mock-token',
      });

      const facts = await adapter.loadFacts();
      expect(facts).toHaveLength(1);
      expect(facts[0]?.key).toBe('rain_habit');
      expect(facts[0]?.value).toBe('drive');
      expect(facts[0]?.status).toBe('confirmed');
      expect(facts[0]?.provenance.source).toBe('xmemo');
    });

    it('loadFacts silently falls back to empty array on 401 token expiry', async () => {
      const mock401Fetch = (async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'unauthorized' }),
      })) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: mock401Fetch,
        appAuthToken: 'expired-token',
      });

      const facts = await adapter.loadFacts();
      expect(facts).toEqual([]);
    });

    it('loadFacts silently falls back to empty array on 5xx server error', async () => {
      const mock500Fetch = (async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' }),
      })) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: mock500Fetch,
        appAuthToken: 'valid-token',
      });

      const facts = await adapter.loadFacts();
      expect(facts).toEqual([]);
    });

    it('loadFacts silently falls back to empty array on network failure (offline)', async () => {
      const networkFailFetch = (async () => {
        throw new Error('Failed to fetch (offline)');
      }) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: networkFailFetch,
        appAuthToken: 'valid-token',
      });

      const facts = await adapter.loadFacts();
      expect(facts).toEqual([]);
    });

    it('writeBack dispatches confirmed fact to confirmed-facts route on 200', async () => {
      let capturedBody: any;
      const mockFetch = (async (url: string, init: any) => {
        expect(url).toBe('/api/xmemo/confirmed-facts');
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      }) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: mockFetch,
        appAuthToken: 'valid-token',
      });

      const res = await adapter.writeBack(mockConfirmedFact);
      expect(res.success).toBe(true);
      expect(capturedBody.key).toBe('transit_pref');
      expect(capturedBody.value).toBe('drive');
      expect(capturedBody.status).toBe('confirmed');
    });

    it('writeBack returns error object on 401/5xx/network failure without throwing', async () => {
      const mock500Fetch = (async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Error' }),
      })) as any;

      const adapter = new XMemoRemoteAdapter({
        proxyEndpoint: '/api/xmemo',
        fetchFn: mock500Fetch,
        appAuthToken: 'valid-token',
      });

      const res = await adapter.writeBack(mockConfirmedFact);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('writeBack throws INV-107 error on pending fact even if remote configured', async () => {
      const pendingFact: MemoryFact = createMemoryFact(
        'pending_pref',
        'walking',
        'pending',
        { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
        '2026-10-28T10:00:00Z'
      );

      const adapter = new XMemoRemoteAdapter({
        appAuthToken: 'valid-token',
      });

      await expect(adapter.writeBack(pendingFact)).rejects.toThrow(
        /MemoryPort invariant violation \(INV-107\)/
      );
    });
  });
});
