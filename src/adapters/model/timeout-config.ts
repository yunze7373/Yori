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
