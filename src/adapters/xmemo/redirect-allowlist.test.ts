/**
 * Unit Tests for XMemo OAuth Redirect and Loopback Allowlist (APP-LIVE-RUNTIME / AC-LIVE-2)
 */

import { describe, it, expect } from 'vitest';
import {
  isAllowlistedLoopbackHost,
  resolveXMemoRedirectUri,
  ALLOWLISTED_LOOPBACK_PORTS,
  ALLOWLISTED_LOOPBACK_HOSTNAMES,
} from './loopback-allowlist.js';

describe('Loopback Allowlist & XMemo Redirect Resolution (AC-LIVE-2)', () => {
  it('exports valid allowlist arrays', () => {
    expect(ALLOWLISTED_LOOPBACK_PORTS).toEqual([4173, 4174, 5173]);
    expect(ALLOWLISTED_LOOPBACK_HOSTNAMES).toEqual(['127.0.0.1', 'localhost']);
  });

  describe('isAllowlistedLoopbackHost', () => {
    it('accepts allowlisted loopback combinations', () => {
      expect(isAllowlistedLoopbackHost('127.0.0.1:4174')).toBe(true);
      expect(isAllowlistedLoopbackHost('127.0.0.1:4173')).toBe(true);
      expect(isAllowlistedLoopbackHost('127.0.0.1:5173')).toBe(true);
      expect(isAllowlistedLoopbackHost('localhost:4174')).toBe(true);
      expect(isAllowlistedLoopbackHost('localhost:4173')).toBe(true);
      expect(isAllowlistedLoopbackHost('localhost:5173')).toBe(true);
    });

    it('rejects foreign domains, 0.0.0.0, LAN addresses, and non-allowlisted ports', () => {
      // Foreign domains
      expect(isAllowlistedLoopbackHost('evil.example:4174')).toBe(false);
      expect(isAllowlistedLoopbackHost('attacker.com:5173')).toBe(false);

      // Non-loopback IPs
      expect(isAllowlistedLoopbackHost('0.0.0.0:4174')).toBe(false);
      expect(isAllowlistedLoopbackHost('192.168.1.100:4174')).toBe(false);
      expect(isAllowlistedLoopbackHost('10.0.0.1:5173')).toBe(false);

      // Non-allowlisted ports
      expect(isAllowlistedLoopbackHost('127.0.0.1:8080')).toBe(false);
      expect(isAllowlistedLoopbackHost('localhost:3000')).toBe(false);
      expect(isAllowlistedLoopbackHost('localhost:80')).toBe(false);
      expect(isAllowlistedLoopbackHost('127.0.0.1:443')).toBe(false);

      // Missing port
      expect(isAllowlistedLoopbackHost('127.0.0.1')).toBe(false);
      expect(isAllowlistedLoopbackHost('localhost')).toBe(false);

      // Malformed / undefined
      expect(isAllowlistedLoopbackHost('')).toBe(false);
      expect(isAllowlistedLoopbackHost(undefined)).toBe(false);
      expect(isAllowlistedLoopbackHost('invalid:port:extra')).toBe(false);
    });
  });

  describe('resolveXMemoRedirectUri', () => {
    it('dynamically derives redirect URI from valid allowlisted loopback host', () => {
      expect(resolveXMemoRedirectUri('127.0.0.1:4174', {})).toBe(
        'http://127.0.0.1:4174/api/xmemo/callback'
      );
      expect(resolveXMemoRedirectUri('localhost:4173', {})).toBe(
        'http://localhost:4173/api/xmemo/callback'
      );
      expect(resolveXMemoRedirectUri('127.0.0.1:5173', {})).toBe(
        'http://127.0.0.1:5173/api/xmemo/callback'
      );
    });

    it('explicit env variable XMEMO_REDIRECT_URI always wins over request Host', () => {
      const customUri = 'https://custom.internal.host/callback';
      expect(
        resolveXMemoRedirectUri('127.0.0.1:4174', { XMEMO_REDIRECT_URI: customUri })
      ).toBe(customUri);
      expect(
        resolveXMemoRedirectUri('evil.example:8080', { XMEMO_REDIRECT_URI: customUri })
      ).toBe(customUri);
    });

    it('defaults safely to 5173 when host is omitted and env is unset', () => {
      expect(resolveXMemoRedirectUri(undefined, {})).toBe(
        'http://127.0.0.1:5173/api/xmemo/callback'
      );
      expect(resolveXMemoRedirectUri('', {})).toBe(
        'http://127.0.0.1:5173/api/xmemo/callback'
      );
    });

    it('strictly throws on disallowed or non-loopback host headers', () => {
      expect(() => resolveXMemoRedirectUri('evil.example:4174', {})).toThrow(
        /Disallowed or non-loopback host for XMemo OAuth callback/
      );
      expect(() => resolveXMemoRedirectUri('0.0.0.0:4174', {})).toThrow(
        /Disallowed or non-loopback host for XMemo OAuth callback/
      );
      expect(() => resolveXMemoRedirectUri('localhost:8080', {})).toThrow(
        /Disallowed or non-loopback host for XMemo OAuth callback/
      );
      expect(() => resolveXMemoRedirectUri('127.0.0.1:3000', {})).toThrow(
        /Disallowed or non-loopback host for XMemo OAuth callback/
      );
    });
  });
});
