/**
 * Unit Tests for XMemo OAuth Redirect and Loopback Allowlist (APP-LIVE-RUNTIME / AC-LIVE-2)
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isAllowlistedLoopbackHost,
  resolveXMemoRedirectUri,
  getAllowedLoopbackRedirectUris,
  ALLOWLISTED_LOOPBACK_PORTS,
  ALLOWLISTED_LOOPBACK_HOSTNAMES,
} from './loopback-allowlist.js';
import { XMemoDevProxy } from './server-proxy.js';

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

  describe('getAllowedLoopbackRedirectUris', () => {
    it('returns all allowlisted combinations and puts custom URI first if provided', () => {
      const uris = getAllowedLoopbackRedirectUris('http://127.0.0.1:5173/api/xmemo/callback');
      expect(uris).toContain('http://127.0.0.1:4174/api/xmemo/callback');
      expect(uris).toContain('http://127.0.0.1:4173/api/xmemo/callback');
      expect(uris).toContain('http://127.0.0.1:5173/api/xmemo/callback');
      expect(uris).toContain('http://localhost:4174/api/xmemo/callback');
      expect(uris).toContain('http://localhost:4173/api/xmemo/callback');
      expect(uris).toContain('http://localhost:5173/api/xmemo/callback');
      expect(uris[0]).toBe('http://127.0.0.1:5173/api/xmemo/callback');
    });

    it('custom URI is included first when configured', () => {
      const custom = 'https://my-custom-vault.test/callback';
      const uris = getAllowedLoopbackRedirectUris(custom);
      expect(uris[0]).toBe(custom);
      expect(uris).toContain('http://127.0.0.1:4174/api/xmemo/callback');
    });
  });

  describe('OAuth Dynamic Registration & Auth URL Verification (Reviewer Findings)', () => {
    it('registration payload contains the 4174 callback and all allowlisted loopbacks', async () => {
      let registrationPayload: any;
      const mockFetch: any = vi.fn(async (url: string, init?: any) => {
        if (url.includes('.well-known/oauth-authorization-server')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              authorization_endpoint: 'https://xmemo.dev/oauth/authorize',
              token_endpoint: 'https://xmemo.dev/oauth/token',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          registrationPayload = JSON.parse(init.body);
          return {
            ok: true,
            status: 201,
            json: async () => ({
              client_id: 'test-dcr-client-4174',
              redirect_uris: registrationPayload.redirect_uris,
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          issuer: 'https://xmemo.dev',
        },
        () => {},
        undefined,
        mockFetch
      );

      const regResult = await proxy.ensureRegistered(mockFetch);
      expect(regResult.success).toBe(true);
      expect(regResult.clientId).toBe('test-dcr-client-4174');
      expect(registrationPayload.redirect_uris).toContain('http://127.0.0.1:4174/api/xmemo/callback');
      expect(registrationPayload.redirect_uris).toContain('http://localhost:4174/api/xmemo/callback');
      expect(registrationPayload.redirect_uris).toContain('http://127.0.0.1:5173/api/xmemo/callback');

      // Auth URL for 127.0.0.1:4174 uses the registered 4174 URI
      const authResult = proxy.createAuthUrl('http://127.0.0.1:4174/api/xmemo/callback');
      expect(authResult.authUrl).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A4174%2Fapi%2Fxmemo%2Fcallback');
      expect(authResult.authUrl).toContain('client_id=test-dcr-client-4174');
    });

    it('re-registers if persisted registration does not contain the required redirect URI', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-xmemo-dcr-test-'));
      const stateFile = path.join(tmpDir, 'client.json');

      // Write an old persisted registration that only has 5173
      fs.writeFileSync(
        stateFile,
        JSON.stringify({
          client_id: 'old-5173-only-client',
          issuer: 'https://xmemo.dev',
          redirect_uri: 'http://127.0.0.1:5173/api/xmemo/callback',
          redirect_uris: ['http://127.0.0.1:5173/api/xmemo/callback'],
        })
      );

      let dcrCalled = false;
      let newPayload: any;
      const mockFetch: any = vi.fn(async (url: string, init?: any) => {
        if (url.includes('.well-known/oauth-authorization-server')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://xmemo.dev',
              authorization_endpoint: 'https://xmemo.dev/oauth/authorize',
              token_endpoint: 'https://xmemo.dev/oauth/token',
              registration_endpoint: 'https://xmemo.dev/oauth/register',
            }),
          };
        }
        if (url.includes('/oauth/register')) {
          dcrCalled = true;
          newPayload = JSON.parse(init.body);
          return {
            ok: true,
            status: 201,
            json: async () => ({
              client_id: 'new-multi-uri-client',
              redirect_uris: newPayload.redirect_uris,
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const proxy = new XMemoDevProxy(
        {
          enabled: true,
          issuer: 'https://xmemo.dev',
          clientStoragePath: stateFile,
        },
        () => {},
        undefined,
        mockFetch
      );

      // When asked to ensure registered for 4174 callback, the old registration missing 4174 is ignored
      const regResult = await proxy.ensureRegistered(mockFetch, 'http://127.0.0.1:4174/api/xmemo/callback');
      expect(regResult.success).toBe(true);
      expect(dcrCalled).toBe(true);
      expect(regResult.clientId).toBe('new-multi-uri-client');
      expect(newPayload.redirect_uris).toContain('http://127.0.0.1:4174/api/xmemo/callback');

      // Clean up temp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
