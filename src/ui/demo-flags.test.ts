/**
 * DEMO-XMEMO-FREE (Reviewer 51c59ea7): a recording build (marker VITE_YORI_DEMO_HIDE_XMEMO=1)
 * fails CLOSED: hidden synchronously, ready at once, and no server answer (missing, failed, or one
 * without the demo field) can bring XMemo back. Unmarked builds follow the server flag.
 */

import { describe, it, expect } from 'vitest';
import { createDemoFlagState, BUILD_HIDES_XMEMO, isXmemoHidden } from './demo-flags.js';

describe('demo flags', () => {
  it('marked build: hidden immediately, ready at once, never un-hidden by any server answer', async () => {
    const s = createDemoFlagState(true);
    expect(s.isXmemoHidden()).toBe(true);
    await expect(Promise.race([s.ready.then(() => 'ready'), new Promise(r => setTimeout(() => r('waiting'), 20))])).resolves.toBe('ready');
    for (const payload of [null, {}, { enabled: true }, { demo: { hideXmemo: false } }]) {
      s.apply(payload);
      expect(s.isXmemoHidden(), JSON.stringify(payload)).toBe(true);
    }
  });

  it('unmarked build: shown unless the server flag says hidden; waits for the answer (bounded)', async () => {
    const s = createDemoFlagState(false, 30);
    expect(s.isXmemoHidden()).toBe(false);
    s.apply(null);
    expect(s.isXmemoHidden()).toBe(false);
    s.apply({ demo: { hideXmemo: true } });
    expect(s.isXmemoHidden()).toBe(true);
    const t = createDemoFlagState(false, 30);
    await expect(t.ready).resolves.toBeUndefined(); // resolves by the timeout even with no answer
  });

  it('this unit-test build carries no marker (normal default)', () => {
    expect(BUILD_HIDES_XMEMO).toBe(false);
    expect(isXmemoHidden()).toBe(false);
  });
});
