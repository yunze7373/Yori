/**
 * Core Storage Unit Tests
 * Governed by Invariant INV-110 and AC-104-4.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  YoriStorage,
  InMemoryStorageDriver,
  WebStorageDriver,
  StorageCorruptionError,
  CURRENT_STORAGE_SCHEMA_VERSION,
  type YoriStorageState,
  type StorageDriver,
} from './index.js';
import { createMemoryFact, type MemoryFact, type SuppressionReason } from '../contracts/index.js';

describe('Storage Engine (AC-104-4, INV-110)', () => {
  const sampleFacts: readonly MemoryFact[] = [
    createMemoryFact(
      'taste_preference',
      'ramen',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    ),
  ];

  const sampleProposals: readonly MemoryFact[] = [
    createMemoryFact(
      'suppress_lunch_recommendations',
      'user_requested_today',
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T11:00:00Z' },
      '2026-10-28T11:00:00Z'
    ),
  ];

  const sampleSuppressions: readonly SuppressionReason[] = [
    {
      code: 'user_busy',
      reason: 'Calendar event in progress',
      scope: 'this_event',
      recordedAt: '2026-10-28T12:00:00Z',
    },
  ];

  const sampleState: YoriStorageState = {
    memoryFacts: sampleFacts,
    proposals: sampleProposals,
    suppressions: sampleSuppressions,
    promptBudget: {
      date: '2026-10-28',
      count: 2,
    },
  };

  it('performs clean round-trip save and load with versioned envelope', () => {
    const driver = new InMemoryStorageDriver();
    const storage = new YoriStorage(driver);

    storage.save(sampleState, '2026-10-28T12:00:00.000Z');
    const loaded = storage.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(CURRENT_STORAGE_SCHEMA_VERSION);
    expect(loaded?.createdAt).toBe('2026-10-28T12:00:00.000Z');
    expect(loaded?.payload.memoryFacts).toHaveLength(1);
    expect(loaded?.payload.memoryFacts[0]?.key).toBe('taste_preference');
    expect(loaded?.payload.proposals).toHaveLength(1);
    expect(loaded?.payload.proposals[0]?.status).toBe('pending');
    expect(loaded?.payload.suppressions).toHaveLength(1);
    expect(loaded?.payload.promptBudget.count).toBe(2);
  });

  it('enforces write-then-read-back verify on save (fails if driver tampers bytes)', () => {
    const faultyDriver: StorageDriver = {
      getItem: () => 'corrupted-readback',
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };

    const storage = new YoriStorage(faultyDriver);
    expect(() => storage.save(sampleState, '2026-10-28T12:00:00.000Z')).toThrow(
      /Write-read-back verification failed/
    );
  });

  it('surfaces explicit StorageCorruptionError on corrupt JSON without silent wipe (INV-110)', () => {
    const driver = new InMemoryStorageDriver();
    const corruptedPayload = '{ bad json syntax !!!';
    driver.setItem('yori_state_v1', corruptedPayload);

    const storage = new YoriStorage(driver);
    let thrownError: StorageCorruptionError | null = null;

    try {
      storage.load();
    } catch (e) {
      if (e instanceof StorageCorruptionError) {
        thrownError = e;
      }
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('JSON parse error');
    // Raw data is preserved, NEVER wiped
    expect(thrownError?.rawData).toBe(corruptedPayload);
    expect(driver.getItem('yori_state_v1')).toBe(corruptedPayload);

    // Can export raw data
    expect(thrownError?.exportData()).toBe(corruptedPayload);

    // Can explicitly reset if user chooses
    thrownError?.reset();
    expect(driver.getItem('yori_state_v1')).toBeNull();
  });

  it('surfaces explicit StorageCorruptionError on unknown future schemaVersion without wipe', () => {
    const driver = new InMemoryStorageDriver();
    const futureEnvelope = JSON.stringify({
      schemaVersion: 999,
      createdAt: '2026-10-28T10:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
      payload: sampleState,
    });
    driver.setItem('yori_state_v1', futureEnvelope);

    const storage = new YoriStorage(driver);
    expect(() => storage.load()).toThrow(/Unknown future storage schemaVersion 999/);

    // Stored bytes are preserved, NOT wiped
    expect(driver.getItem('yori_state_v1')).toBe(futureEnvelope);
  });

  it('exportRaw and reset work as designed', () => {
    const driver = new InMemoryStorageDriver();
    const storage = new YoriStorage(driver);

    storage.save(sampleState, '2026-10-28T12:00:00.000Z');
    expect(storage.exportRaw()).toContain('schemaVersion');

    storage.reset();
    expect(storage.load()).toBeNull();
    expect(storage.exportRaw()).toBeNull();
  });

  it('persists acceptedPlanIds in storage state and WebStorageDriver works in memory fallback', () => {
    const driver = new WebStorageDriver();
    const storage = new YoriStorage(driver);

    const stateWithAccepted: YoriStorageState = {
      ...sampleState,
      acceptedPlanIds: ['depart-plan-1', 'lunch-plan-2'],
    };

    storage.save(stateWithAccepted, '2026-10-28T12:00:00.000Z');
    const loaded = storage.load();
    expect(loaded?.payload.acceptedPlanIds).toEqual(['depart-plan-1', 'lunch-plan-2']);
  });

  it('static audit: ensures src/core/storage contains zero ambient clock calls (Date.now / new Date())', () => {
    const storageDir = path.resolve('src/core/storage');
    const files = fs
      .readdirSync(storageDir)
      .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(storageDir, file), 'utf-8');
      expect(content).not.toMatch(/\bDate\.now\(\)/);
      expect(content).not.toMatch(/\bnew\s+Date\(\)/);
    }
  });
});
