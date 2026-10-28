import { describe, it, expect } from 'vitest';
import { formatProvenanceSource } from './me-view.js';
import type { MemorySource } from '../../core/contracts/memory.js';

describe('Me View: Provenance Humanization (UI-POLISH-P3)', () => {
  it('maps all defined MemorySource contract values correctly', () => {
    const userConfirmed: MemorySource = 'user_confirmed';
    const userFeedback: MemorySource = 'user_feedback';
    const seed: MemorySource = 'seed';
    const inferred: MemorySource = 'inferred';

    expect(formatProvenanceSource(userConfirmed)).toBe('Source: you confirmed');
    expect(formatProvenanceSource(userFeedback)).toBe('Source: your adjustment');
    expect(formatProvenanceSource(seed)).toBe('Source: sample profile');
    expect(formatProvenanceSource(inferred)).toBe('Source: suggested habit');
  });

  it('maps external xmemo and assistant reasoning sources honestly without claiming local confirmation', () => {
    expect(formatProvenanceSource('xmemo')).toBe('Source: synced from XMemo');
    expect(formatProvenanceSource('model_reasoning')).toBe('Source: suggested by assistant');
  });

  it('maps unknown, legacy, or tampered source tokens to neutral non-claiming default and never claims user confirmed', () => {
    const unknownSamples = [
      'unknown',
      'remote_sync',
      'legacy_v0',
      'corrupt',
      '',
      'custom_provider',
      'tampered_key',
    ];

    for (const token of unknownSamples) {
      const formatted = formatProvenanceSource(token);
      expect(formatted).toBe('Source: other');
      expect(formatted).not.toContain('you confirmed');
      expect(formatted).not.toContain('user_confirmed');
    }
  });
});
