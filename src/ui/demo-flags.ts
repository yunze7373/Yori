/**
 * DEMO-XMEMO-FREE (owner directive 2026-11-03 15:52 JST): demo-recording flags read from the
 * server. YORI_DEMO_HIDE_XMEMO=1 on the server adds `demo: { hideXmemo: true }` to the existing
 * /api/weather/status payload (fetched once at startup in every mode). While that answer is pending,
 * every XMemo request waits on `demoFlagsReady`, so a hidden build never sends /api/xmemo/*. Off by
 * default: no `demo` field means normal behaviour, unchanged.
 */

/**
 * Fail-closed recording builds (Reviewer 51c59ea7): `npm run demo:record` (and every documented
 * phone command) builds with the non-secret marker VITE_YORI_DEMO_HIDE_XMEMO=1. A marked build hides
 * XMemo from the first instant and never waits for, or is overridden by, any server answer, so a
 * failed, aborted or slow status request cannot bring XMemo back. Unmarked builds keep the
 * server-flag behaviour below (default: shown).
 */
export const BUILD_HIDES_XMEMO: boolean = (import.meta as any).env?.VITE_YORI_DEMO_HIDE_XMEMO === '1';

const DEMO_FLAGS_TIMEOUT_MS = 5000;

export interface DemoFlagState {
  readonly ready: Promise<void>;
  isXmemoHidden(): boolean;
  apply(payload: unknown): void;
}

/** The flag state for a build; `buildHides` = the build carries the recording marker. */
export function createDemoFlagState(buildHides: boolean, timeoutMs: number = DEMO_FLAGS_TIMEOUT_MS): DemoFlagState {
  let hidden = buildHides;
  let resolveReady: (() => void) | null = null;
  const ready: Promise<void> = buildHides
    ? Promise.resolve()
    : new Promise(resolve => {
        resolveReady = resolve;
        // Never block XMemo forever if the status request never runs (normal builds only lose a delay).
        setTimeout(resolve, timeoutMs);
      });
  return {
    ready,
    isXmemoHidden: () => hidden,
    apply(payload: unknown) {
      const demo = (payload as { demo?: { hideXmemo?: unknown } } | null)?.demo;
      // A marked recording build stays hidden whatever the server says.
      hidden = buildHides || demo?.hideXmemo === true;
      resolveReady?.();
    },
  };
}

const state = createDemoFlagState(BUILD_HIDES_XMEMO);

export const demoFlagsReady: Promise<void> = state.ready;

/** Applies the flags from a /api/weather/status payload (or null when that request failed). */
export function applyDemoStatus(payload: unknown): void {
  state.apply(payload);
}

/** True when this build is a recording build, or the server switched XMemo off for a demo. */
export function isXmemoHidden(): boolean {
  return state.isXmemoHidden();
}
