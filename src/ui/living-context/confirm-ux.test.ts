/**
 * Honest Confirm & Reject UX Tests
 * Governed by BACKLOG-20261031-XKEYDEL-P2.
 *
 * Verifies:
 * 1. Remote writeBack 403 / failure -> no 'Preference confirmed' message, proposal stays pending, calm failure notice.
 * 2. Remote writeBack exception -> no 'Preference confirmed' message, proposal stays pending.
 * 3. Sanitized log reason: console.warn contains no key value, PII, or tokens.
 * 4. Local mode behavior is completely unchanged (honest confirmation & rejection).
 * 5. Grocery proposal keys are covered and handled cleanly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleConfirmProposal, handleRejectProposal } from './app.js';
import { YoriStorage, InMemoryStorageDriver } from '../../core/storage/index.js';
import { createMemoryFact } from '../../core/contracts/index.js';
import { LocalMemoryAdapter } from '../../adapters/xmemo/local-adapter.js';
import type { MemoryPort } from '../../adapters/xmemo/types.js';

describe('Honest Confirm & Reject UX (XKEYDEL-P2)', () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('remote writeBack 403: does not show "Preference confirmed", proposal stays pending, calm failure message shown', async () => {
    const storageDriver = new InMemoryStorageDriver();
    const storage = new YoriStorage(storageDriver);

    const pendingFact = createMemoryFact(
      'prep_buffer_preference',
      { prepMinutes: 20, bufferMinutes: 10 },
      'pending',
      { source: 'seed', recordedAt: '2026-10-31T00:00:00.000Z', note: 'Demo habit proposal' },
      '2026-10-31T00:00:00.000Z'
    );

    storage.save(
      {
        memoryFacts: [],
        proposals: [pendingFact],
        suppressions: [],
        promptBudget: { date: '2026-10-31', count: 0 },
        acceptedPlanIds: [],
      },
      '2026-10-31T00:00:00.000Z'
    );

    // Mock remote MemoryPort returning 403 failure
    const mockRemotePort: MemoryPort = {
      getStatus: () => ({
        adapter: 'xmemo_remote',
        isRemoteConfigured: true,
        statusText: 'Connected',
      }),
      loadFacts: async () => [],
      writeBack: vi.fn().mockResolvedValue({
        success: false,
        error: 'XMemo remote sync failed with status 403',
      }),
    };

    const outcome = await handleConfirmProposal(
      'prep_buffer_preference',
      storage,
      [pendingFact],
      mockRemotePort,
      '2026-10-31T00:00:00.000Z'
    );

    // 1. Assert failure outcome and calm, non-technical failure message
    expect(outcome.success).toBe(false);
    expect(outcome.message).not.toContain('Preference confirmed');
    expect(outcome.message).toBe('Unable to save preference right now. Your setting has not been saved.');

    // 2. Assert proposal remains pending in storage
    const envelope = storage.load();
    expect(envelope?.payload.proposals).toHaveLength(1);
    expect(envelope?.payload.proposals[0]?.key).toBe('prep_buffer_preference');
    expect(envelope?.payload.proposals[0]?.status).toBe('pending');

    // 3. Assert no confirmed fact was added to memoryFacts
    expect(envelope?.payload.memoryFacts).toHaveLength(0);

    // 4. Assert sanitized console warning logged (no fact value or token)
    expect(warnSpy).toHaveBeenCalled();
    const loggedWarning = warnSpy.mock.calls[0].join(' ');
    expect(loggedWarning).toContain('XMemo remote sync failed with status 403');
    expect(loggedWarning).not.toContain('prepMinutes');
    expect(loggedWarning).not.toContain('bufferMinutes');
  });

  it('remote writeBack throwing exception: fails safe, keeps proposal pending, shows calm failure notice', async () => {
    const storageDriver = new InMemoryStorageDriver();
    const storage = new YoriStorage(storageDriver);

    const pendingFact = createMemoryFact(
      'taste_preference',
      'ramen_or_salad',
      'pending',
      { source: 'seed', recordedAt: '2026-10-31T00:00:00.000Z', note: 'Taste proposal' },
      '2026-10-31T00:00:00.000Z'
    );

    storage.save(
      {
        memoryFacts: [],
        proposals: [pendingFact],
        suppressions: [],
        promptBudget: { date: '2026-10-31', count: 0 },
        acceptedPlanIds: [],
      },
      '2026-10-31T00:00:00.000Z'
    );

    const mockThrowingPort: MemoryPort = {
      getStatus: () => ({
        adapter: 'xmemo_remote',
        isRemoteConfigured: true,
        statusText: 'Connected',
      }),
      loadFacts: async () => [],
      writeBack: vi.fn().mockRejectedValue(new Error('Network offline or connection refused')),
    };

    const outcome = await handleConfirmProposal(
      'taste_preference',
      storage,
      [pendingFact],
      mockThrowingPort,
      '2026-10-31T00:00:00.000Z'
    );

    expect(outcome.success).toBe(false);
    expect(outcome.message).not.toContain('Preference confirmed');
    expect(outcome.message).toBe('Unable to save preference right now. Your setting has not been saved.');

    const envelope = storage.load();
    expect(envelope?.payload.proposals).toHaveLength(1);
    expect(envelope?.payload.proposals[0]?.status).toBe('pending');
    expect(envelope?.payload.memoryFacts).toHaveLength(0);
  });

  it('local mode confirm: succeeds honestly, promotes proposal, updates storage', async () => {
    const storageDriver = new InMemoryStorageDriver();
    const storage = new YoriStorage(storageDriver);
    const localPort = new LocalMemoryAdapter(storage);

    const pendingFact = createMemoryFact(
      'grocery_store_preference',
      'Nijiya Market',
      'pending',
      { source: 'seed', recordedAt: '2026-10-31T00:00:00.000Z', note: 'Grocery preference proposal' },
      '2026-10-31T00:00:00.000Z'
    );

    storage.save(
      {
        memoryFacts: [],
        proposals: [pendingFact],
        suppressions: [],
        promptBudget: { date: '2026-10-31', count: 0 },
        acceptedPlanIds: [],
      },
      '2026-10-31T00:00:00.000Z'
    );

    const outcome = await handleConfirmProposal(
      'grocery_store_preference',
      storage,
      [pendingFact],
      localPort,
      '2026-10-31T00:00:00.000Z'
    );

    expect(outcome.success).toBe(true);
    expect(outcome.message).toBe('Preference confirmed: grocery store preference');

    const envelope = storage.load();
    expect(envelope?.payload.proposals).toHaveLength(0);
    expect(envelope?.payload.memoryFacts).toHaveLength(1);
    expect(envelope?.payload.memoryFacts[0]?.key).toBe('grocery_store_preference');
    expect(envelope?.payload.memoryFacts[0]?.status).toBe('confirmed');
  });

  it('proposal rejection ("Not true"): marks fact rejected with audit note, removes from pending', () => {
    const storageDriver = new InMemoryStorageDriver();
    const storage = new YoriStorage(storageDriver);

    const pendingFact = createMemoryFact(
      'preferred_grocery_store',
      'Trader Joes',
      'pending',
      { source: 'seed', recordedAt: '2026-10-31T00:00:00.000Z', note: 'Grocery preference proposal' },
      '2026-10-31T00:00:00.000Z'
    );

    storage.save(
      {
        memoryFacts: [],
        proposals: [pendingFact],
        suppressions: [],
        promptBudget: { date: '2026-10-31', count: 0 },
        acceptedPlanIds: [],
      },
      '2026-10-31T00:00:00.000Z'
    );

    const outcome = handleRejectProposal(
      'preferred_grocery_store',
      storage,
      [pendingFact],
      '2026-10-31T00:00:00.000Z'
    );

    expect(outcome.success).toBe(true);
    expect(outcome.message).toBe('Proposal marked not true: preferred grocery store');

    const envelope = storage.load();
    expect(envelope?.payload.proposals).toHaveLength(1);
    expect(envelope?.payload.proposals[0]?.key).toBe('preferred_grocery_store');
    expect(envelope?.payload.proposals[0]?.status).toBe('rejected');
    expect(envelope?.payload.proposals[0]?.provenance.note).toBe('Declined by user');
  });
});
