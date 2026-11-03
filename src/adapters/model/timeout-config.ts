/**
 * Shared Model Timeout Configuration (APP-LIVE-RUNTIME / AC-LIVE-1)
 *
 * Provides a unified, bounded timeout configuration for live model calls
 * across client model port, conversational interpreter, and server dev proxy.
 *
 * Invariants:
 * - Live model path default: 15000 ms (15.0s)
 * - Clamped strictly to [2000, 30000] ms
 * - Scripted-fixture / offline path stays instant (0ms / sync)
 */

export const DEFAULT_LIVE_MODEL_TIMEOUT_MS = 15000;
export const MIN_MODEL_TIMEOUT_MS = 2000;
export const MAX_MODEL_TIMEOUT_MS = 30000;

/**
 * Resolves the effective model timeout in milliseconds.
 * Respects env overrides (e.g. MODEL_TIMEOUT_MS / VITE_MODEL_TIMEOUT_MS)
 * and clamps strictly between MIN_MODEL_TIMEOUT_MS (2000) and MAX_MODEL_TIMEOUT_MS (30000).
 */
export function resolveModelTimeoutMs(
  rawEnvVal?: string | number | undefined,
  defaultTimeoutMs: number = DEFAULT_LIVE_MODEL_TIMEOUT_MS
): number {
  if (rawEnvVal === undefined || rawEnvVal === null) {
    return defaultTimeoutMs;
  }
  const str = String(rawEnvVal).trim();
  if (str === '') {
    return defaultTimeoutMs;
  }
  const parsed = parseInt(str, 10);
  if (isNaN(parsed) || parsed < 0) {
    return defaultTimeoutMs;
  }
  return Math.max(MIN_MODEL_TIMEOUT_MS, Math.min(MAX_MODEL_TIMEOUT_MS, parsed));
}

/**
 * D4 (Reviewer ae9b0e30): the live candidates route may wait up to 30 s, because a Muse Spark answer
 * of 1.5k-2k completion tokens takes 17-22 s. MODEL_TIMEOUT_MS can only lower it.
 */
export const CANDIDATES_MODEL_TIMEOUT_MS = MAX_MODEL_TIMEOUT_MS;
export function resolveCandidatesTimeoutMs(rawEnvVal?: string | number | undefined): number {
  if (rawEnvVal === undefined || rawEnvVal === null || String(rawEnvVal).trim() === '') {
    return CANDIDATES_MODEL_TIMEOUT_MS;
  }
  return Math.min(CANDIDATES_MODEL_TIMEOUT_MS, resolveModelTimeoutMs(rawEnvVal));
}

/**
 * D4: how long the app waits for a billed model call. Every server timeout is clamped to at most
 * MAX_MODEL_TIMEOUT_MS, so this wait always outlasts the server and a paid answer is never thrown
 * away by the client. The app declares it in CLIENT_WAIT_HEADER; the server refuses to bill a call
 * whose declared wait is missing or shorter than its own timeout.
 */
export const MODEL_CLIENT_WAIT_MS = MAX_MODEL_TIMEOUT_MS + 1000;
export const CLIENT_WAIT_HEADER = 'x-yori-client-wait-ms';

/** True only when the declared client wait is at least the server's timeout for that route. */
export function clientCanAwaitServer(clientWaitMs: number | null | undefined, serverTimeoutMs: number): boolean {
  return typeof clientWaitMs === 'number' && Number.isFinite(clientWaitMs) && clientWaitMs >= serverTimeoutMs;
}

/**
 * D8: the labelled Baseten fallback runs only AFTER the candidates deadline fires, with its own
 * timeout. The candidates/why request therefore waits for both plus a margin, and declares that
 * wait; the server reserves Baseten only when the remaining declared wait still covers its timeout
 * plus the margin (otherwise it is skipped: labelled offline, nothing billed).
 */
export const BASETEN_FALLBACK_TIMEOUT_MS = 8000;
export const CLIENT_WAIT_MARGIN_MS = 1000;
export const CANDIDATES_CLIENT_WAIT_MS = CANDIDATES_MODEL_TIMEOUT_MS + BASETEN_FALLBACK_TIMEOUT_MS + 2 * CLIENT_WAIT_MARGIN_MS;

/** D8: may a Baseten attempt start now, given the client's declared wait and the time already used? */
export function remainingWaitCoversFallback(clientWaitMs: number | null | undefined, elapsedMs: number): boolean {
  return (
    typeof clientWaitMs === 'number' &&
    Number.isFinite(clientWaitMs) &&
    clientWaitMs - elapsedMs >= BASETEN_FALLBACK_TIMEOUT_MS + CLIENT_WAIT_MARGIN_MS
  );
}

