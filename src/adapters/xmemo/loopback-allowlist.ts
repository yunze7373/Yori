/**
 * Loopback Host Allowlist for XMemo OAuth Redirect and Local Proxies (APP-LIVE-RUNTIME / AC-LIVE-2)
 *
 * Enforces strict security constraints on OAuth callback redirect URIs and server proxies:
 * - Only loopback origins (127.0.0.1 or localhost) on allowlisted ports (4173, 4174, 5173)
 *   are permitted to be derived dynamically from request Host headers.
 * - Any other Host header (e.g. evil.example, 0.0.0.0, non-allowlisted ports) is strictly rejected
 *   to eliminate OAuth authorization code leakage and open-redirect vulnerabilities.
 * - An explicit env value (XMEMO_REDIRECT_URI) always wins over dynamic Host derivation.
 */

export const ALLOWLISTED_LOOPBACK_PORTS = Object.freeze([4173, 4174, 5173] as const);
export const ALLOWLISTED_LOOPBACK_HOSTNAMES = Object.freeze(['127.0.0.1', 'localhost'] as const);

export type AllowlistedLoopbackPort = (typeof ALLOWLISTED_LOOPBACK_PORTS)[number];
export type AllowlistedLoopbackHostname = (typeof ALLOWLISTED_LOOPBACK_HOSTNAMES)[number];

/**
 * Checks whether a given host header matches the allowlisted loopback origins.
 * Format expected: "hostname:port" (e.g. "127.0.0.1:4174" or "localhost:5173").
 */
export function isAllowlistedLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();

  // Strip IPv6 enclosing brackets if present (e.g. "[::1]:4174")
  let hostPart = trimmed;
  let portPart: string | undefined;

  const colonIdx = hostPart.lastIndexOf(':');
  if (colonIdx === -1) {
    return false; // Port is mandatory for the preview/dev server allowlist
  }

  hostPart = trimmed.slice(0, colonIdx);
  portPart = trimmed.slice(colonIdx + 1);

  if (hostPart.startsWith('[') && hostPart.endsWith(']')) {
    hostPart = hostPart.slice(1, -1);
  }

  const port = parseInt(portPart, 10);
  if (isNaN(port) || String(port) !== portPart) {
    return false;
  }

  const isAllowedHost = ALLOWLISTED_LOOPBACK_HOSTNAMES.includes(
    hostPart as AllowlistedLoopbackHostname
  );
  const isAllowedPort = ALLOWLISTED_LOOPBACK_PORTS.includes(
    port as AllowlistedLoopbackPort
  );

  return isAllowedHost && isAllowedPort;
}

/**
 * Resolves the XMemo callback redirect URI:
 * 1. Explicit env `XMEMO_REDIRECT_URI` always wins if present and non-empty.
 * 2. If unset and a hostHeader is provided:
 *    - Validates hostHeader against loopback allowlist (127.0.0.1/localhost on 4173/4174/5173).
 *    - If valid, returns `http://${hostHeader}/api/xmemo/callback`.
 *    - If invalid, throws an Error rejecting the disallowed host.
 * 3. If unset and no hostHeader is provided, defaults safely to `http://127.0.0.1:5173/api/xmemo/callback`.
 */
export function resolveXMemoRedirectUri(
  hostHeader: string | undefined,
  env: Record<string, string | undefined> = process.env
): string {
  const envVal = env['XMEMO_REDIRECT_URI'];
  if (envVal && envVal.trim() !== '') {
    return envVal.trim();
  }

  if (hostHeader && hostHeader.trim() !== '') {
    const trimmedHost = hostHeader.trim();
    if (!isAllowlistedLoopbackHost(trimmedHost)) {
      throw new Error(
        `Disallowed or non-loopback host for XMemo OAuth callback: '${trimmedHost}'. ` +
        `Only 127.0.0.1 and localhost on ports 4173, 4174, and 5173 are permitted.`
      );
    }
    return `http://${trimmedHost}/api/xmemo/callback`;
  }

  return 'http://127.0.0.1:5173/api/xmemo/callback';
}

/**
 * Returns all allowlisted loopback callback redirect URIs.
 * If an explicit redirect URI is provided, it is included as the primary URI.
 */
export function getAllowedLoopbackRedirectUris(explicitRedirectUri?: string): string[] {
  const uris: string[] = [];
  if (explicitRedirectUri && explicitRedirectUri.trim() !== '') {
    uris.push(explicitRedirectUri.trim());
  }
  for (const host of ALLOWLISTED_LOOPBACK_HOSTNAMES) {
    for (const port of ALLOWLISTED_LOOPBACK_PORTS) {
      const uri = `http://${host}:${port}/api/xmemo/callback`;
      if (!uris.includes(uri)) {
        uris.push(uri);
      }
    }
  }
  return uris;
}
