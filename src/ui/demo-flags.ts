/**
 * DEMO-XMEMO-FREE (owner directive 2026-11-03 15:52 JST): demo-recording flags read from the
 * server. YORI_DEMO_HIDE_XMEMO=1 on the server adds `demo: { hideXmemo: true }` to the existing
 * /api/weather/status payload (fetched once at startup in every mode). While that answer is pending,
 * every XMemo request waits on `demoFlagsReady`, so a hidden build never sends /api/xmemo/*. Off by
 * default: no `demo` field means normal behaviour, unchanged.
 */

let hideXmemo = false;
let resolveReady: (() => void) | null = null;
const DEMO_FLAGS_TIMEOUT_MS = 5000;

export const demoFlagsReady: Promise<void> = new Promise(resolve => {
  resolveReady = resolve;
  // Never block XMemo forever if the status request never runs (normal builds only lose a delay).
  setTimeout(resolve, DEMO_FLAGS_TIMEOUT_MS);
});

/** Applies the flags from a /api/weather/status payload (or null when that request failed). */
export function applyDemoStatus(payload: unknown): void {
  const demo = (payload as { demo?: { hideXmemo?: unknown } } | null)?.demo;
  hideXmemo = demo?.hideXmemo === true;
  resolveReady?.();
}

/** True only when the server switched XMemo off for a demo recording. */
export function isXmemoHidden(): boolean {
  return hideXmemo;
}
