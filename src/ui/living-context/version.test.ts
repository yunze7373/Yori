import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveUiVersion,
  getEffectiveUiVersion,
} from './app.js';

describe('V-ANCHOR: UI Versioning & Fallback Anchor Contract', () => {
  const originalEnv = process.env.VITE_YORI_UI;

  beforeEach(() => {
    delete process.env.VITE_YORI_UI;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VITE_YORI_UI = originalEnv;
    } else {
      delete process.env.VITE_YORI_UI;
    }
  });

  describe('resolveUiVersion', () => {
    it('resolves valid v2 tokens case-insensitively with trimming', () => {
      expect(resolveUiVersion('v2')).toBe('v2');
      expect(resolveUiVersion('V2')).toBe('v2');
      expect(resolveUiVersion('  v2  ')).toBe('v2');
      expect(resolveUiVersion('  V2\n')).toBe('v2');
    });

    it('defaults to v1 for explicit v1 tokens', () => {
      expect(resolveUiVersion('v1')).toBe('v1');
      expect(resolveUiVersion('V1')).toBe('v1');
      expect(resolveUiVersion('  v1  ')).toBe('v1');
    });

    it('fails closed to v1 for missing, empty, or invalid tokens without throwing', () => {
      expect(resolveUiVersion(undefined)).toBe('v1');
      expect(resolveUiVersion(null)).toBe('v1');
      expect(resolveUiVersion('')).toBe('v1');
      expect(resolveUiVersion('   ')).toBe('v1');
      expect(resolveUiVersion('v3')).toBe('v1');
      expect(resolveUiVersion('invalid')).toBe('v1');
      expect(resolveUiVersion('null')).toBe('v1');
      expect(resolveUiVersion('undefined')).toBe('v1');
      expect(resolveUiVersion('beta')).toBe('v1');
    });
  });

  describe('getEffectiveUiVersion', () => {
    it('defaults to v1 when environment variable is unset', () => {
      expect(getEffectiveUiVersion()).toBe('v1');
    });

    it('returns v2 when process.env.VITE_YORI_UI is v2', () => {
      process.env.VITE_YORI_UI = 'v2';
      expect(getEffectiveUiVersion()).toBe('v2');
    });

    it('falls back to v1 when process.env.VITE_YORI_UI is invalid or v1', () => {
      process.env.VITE_YORI_UI = 'invalid-token';
      expect(getEffectiveUiVersion()).toBe('v1');

      process.env.VITE_YORI_UI = 'v1';
      expect(getEffectiveUiVersion()).toBe('v1');
    });
  });
});
