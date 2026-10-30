/**
 * Vitest NetGuard Setup
 * Enforces zero unmocked external network calls across all test suites.
 * Throws immediately if any test attempts a non-loopback network fetch.
 */

const originalFetch = globalThis.fetch;

function isLoopback(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  } catch {
    // Relative or internal URLs are treated as loopback
    return true;
  }
}

globalThis.fetch = async function netguardFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : typeof (input as any)?.url === 'string'
      ? (input as any).url
      : String(input);

  if (!isLoopback(urlStr)) {
    throw new Error(`[NETGUARD] Blocked unmocked non-loopback network fetch to: ${urlStr}`);
  }
  return originalFetch(input, init);
};
