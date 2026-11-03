/**
 * D8-BASETEN-FALLBACK boundary tests (DEMO_RESCUE rev12, TID INBOX-20261103-037D63).
 * Fake fetch only: no live Muse Spark or Baseten call (netguard blocks real fetches).
 * - A PROVEN Muse Spark timeout (our deadline fired) routes exactly once to Baseten; the answer
 *   is labelled 'Baseten fallback · <family>' with engineStatus baseten_fallback.
 * - 400/401/429/5xx, schema_invalid and budget refusals never touch Baseten.
 * - Payload: prompt + admitted facts only (no coordinates, no identifiers).
 * - Baseten ledger refuses BEFORE the call at the call cap or the USD sub-cap.
 * - Missing key / missing or malformed slug / Baseten failure -> labelled offline answer.
 * - Keys never appear in responses or logs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ModelDevProxy, resetProcessLiveCallCount } from '../../src/adapters/model/server-proxy.js';
import {
  resolveBasetenConfig,
  resolveBasetenLiveEnabled,
  readBasetenLedger,
  basetenWorstCaseUsd,
  BASETEN_BASE_URL,
  BASETEN_OPERATING_CAP_DEFAULT,
  BASETEN_USD_SUBCAP,
} from '../../src/adapters/model/baseten-fallback.js';
import {
  BASETEN_FALLBACK_TIMEOUT_MS,
  CANDIDATES_CLIENT_WAIT_MS,
  CANDIDATES_MODEL_TIMEOUT_MS,
  CLIENT_WAIT_MARGIN_MS,
  MODEL_CLIENT_WAIT_MS,
  clientCanAwaitServer,
} from '../../src/adapters/model/timeout-config.js';
import type { CandidateReasoningInput } from '../../src/adapters/model/candidate-reasoning.js';

const MUSE_KEY = 'sk-FAKE-muse-d8-0123456789';
const BASETEN_KEY = 'bt-FAKE-baseten-d8-SECRET-0123456789';
const SLUG = 'openai/gpt-oss-120b';

const INPUT: CandidateReasoningInput = {
  request: 'rank',
  candidates: [
    { id: 'google-A', name: 'Near Cafe', cuisine: 'cafe', distanceMeters: 45, openNow: true, rating: 4.6, userRatingCount: 1204, priceLevel: 2, source: 'google' },
    { id: 'google-B', name: 'Mid Ramen', cuisine: 'ramen', distanceMeters: 125, openNow: null, rating: 4.2, userRatingCount: 310, source: 'google' },
  ],
  confirmedFacts: [{ key: 'taste_preference', value: 'ramen' }],
};
const GOOD = { order: ['google-B', 'google-A'], reason: 'Mid Ramen matches your confirmed taste for ramen and is 125 m away.', citedFactKeys: ['taste_preference'] };

let dir: string;
let ledgerPath: string;
let basetenLedgerPath: string;
const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function baseten(extra: Record<string, string> = {}) {
  return resolveBasetenConfig({ BASETEN_LIVE_ENABLED: '1', BASETEN_API_KEY: BASETEN_KEY, BASETEN_FALLBACK_MODEL: SLUG, BASETEN_LEDGER_PATH: basetenLedgerPath, ...extra });
}

type MuseMode = 'hang' | 400 | 401 | 429 | 500 | 'not_json' | 'network';

/** Routes fake fetch: Muse Spark per mode; Baseten returns `basetenReply` (or a status). */
function routeFetch(muse: MuseMode, basetenReply: unknown = GOOD, basetenStatus = 200) {
  const calls = { muse: 0, baseten: [] as any[] };
  globalThis.fetch = vi.fn((url: any, init: any) => {
    const u = String(url);
    if (u.startsWith(BASETEN_BASE_URL)) {
      calls.baseten.push({ url: u, headers: init.headers, body: JSON.parse(init.body) });
      return Promise.resolve({
        ok: basetenStatus === 200,
        status: basetenStatus,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(basetenReply) } }], usage: { prompt_tokens: 400, completion_tokens: 80 } }),
      } as any);
    }
    calls.muse += 1;
    if (muse === 'hang') {
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    if (muse === 'network') return Promise.reject(new TypeError('fetch failed'));
    if (muse === 'not_json') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'sure! here is my answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) } as any);
    }
    return Promise.resolve({ ok: false, status: muse, json: async () => ({ error: { message: 'x' } }) } as any);
  }) as any;
  return calls;
}

function proxy(b = baseten(), logs: string[] = []) {
  return new ModelDevProxy(
    { apiKey: MUSE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath, candidatesTimeoutMs: 2000, baseten: b },
    (m: string) => logs.push(m)
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-d8-'));
  ledgerPath = path.join(dir, 'model-ledger.json');
  basetenLedgerPath = path.join(dir, 'baseten-ledger.json');
  fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, call_count: 37, reservations: [] }));
  resetProcessLiveCallCount();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...savedEnv };
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('D8 Baseten config', () => {
  it('presence-only config; missing key / missing or malformed slug / live off fail closed', () => {
    expect(baseten()).toMatchObject({ enabled: true, model: SLUG, label: 'Baseten fallback · gpt-oss-120b', operatingCap: 20, usdSubCap: 10 });
    expect(resolveBasetenConfig({ BASETEN_LIVE_ENABLED: '1', BASETEN_FALLBACK_MODEL: SLUG })).toMatchObject({ enabled: false, disabledReason: 'no_key' });
    expect(resolveBasetenConfig({ BASETEN_LIVE_ENABLED: '1', BASETEN_API_KEY: BASETEN_KEY })).toMatchObject({ enabled: false, disabledReason: 'no_model' });
    for (const bad of ['gpt-oss-120b', 'a/b/c', '../etc/passwd', 'org/model with space', '/model']) {
      expect(resolveBasetenConfig({ BASETEN_LIVE_ENABLED: '1', BASETEN_API_KEY: BASETEN_KEY, BASETEN_FALLBACK_MODEL: bad }), bad).toMatchObject({ enabled: false, disabledReason: 'bad_model_slug' });
    }
    expect(baseten({ BASETEN_LIVE_ENABLED: '0' })).toMatchObject({ enabled: false, disabledReason: 'live_off' });
    expect(resolveBasetenLiveEnabled({ VITEST: 'true' })).toBe(false);
    expect(resolveBasetenLiveEnabled({ BASETEN_LIVE_ENABLED: 'true' })).toBe(false);
    expect(resolveBasetenLiveEnabled({})).toBe(true);
    // Caps are lowering-only.
    expect(baseten({ BASETEN_OPERATING_CAP: '500', BASETEN_USD_SUBCAP: '99' })).toMatchObject({ operatingCap: BASETEN_OPERATING_CAP_DEFAULT, usdSubCap: BASETEN_USD_SUBCAP });
    expect(baseten({ BASETEN_OPERATING_CAP: '3' }).operatingCap).toBe(3);
  });
});

describe('D8 proven-timeout-only fallback on /api/model/candidates', () => {
  it('a PROVEN Muse Spark timeout routes exactly once to Baseten; labelled, never Muse Spark', async () => {
    const calls = routeFetch('hang');
    const logs: string[] = [];
    const r = await proxy(baseten(), logs).handleCandidates(INPUT);
    expect(calls.muse).toBe(1);
    expect(calls.baseten).toHaveLength(1);
    expect(r).toMatchObject({
      usedFallback: false,
      engineStatus: 'baseten_fallback',
      engineLabel: 'Baseten fallback · gpt-oss-120b',
      primaryFailure: 'timeout',
      result: { order: ['google-B', 'google-A'] },
    });
    expect(JSON.stringify(r)).not.toMatch(/Muse Spark|meta_model_live/);
    expect(calls.baseten[0].headers.Authorization).toBe(`Bearer ${BASETEN_KEY}`);
    const ledger = readBasetenLedger(basetenLedgerPath);
    expect(ledger.call_count).toBe(1);
    expect(ledger.reservations[0]).toMatchObject({ tokens_in: 400, tokens_out: 80, usd_precharge: 0 });
    const all = JSON.stringify(r) + logs.join('\n') + fs.readFileSync(basetenLedgerPath, 'utf-8');
    expect(all).not.toContain(BASETEN_KEY);
    expect(all).not.toContain(MUSE_KEY);
  }, 15000);

  it('non-timeout failures (400/401/429/500, schema_invalid, network error) never touch Baseten', async () => {
    for (const mode of [400, 401, 429, 500, 'not_json', 'network'] as const) {
      resetProcessLiveCallCount();
      const calls = routeFetch(mode);
      const r = await proxy().handleCandidates(INPUT);
      expect(calls.baseten, String(mode)).toHaveLength(0);
      expect(r.engineStatus, String(mode)).toBe('offline_deterministic');
    }
    expect(fs.existsSync(basetenLedgerPath)).toBe(false);
  });

  it('a budget refusal (Muse ledger at cap) never touches Baseten', async () => {
    fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, call_count: 100, reservations: [] }));
    const calls = routeFetch('hang');
    const r = await proxy().handleCandidates(INPUT);
    expect(r).toMatchObject({ fallbackReason: 'budget_exhausted', engineStatus: 'offline_deterministic' });
    expect(calls.muse).toBe(0);
    expect(calls.baseten).toHaveLength(0);
  });

  it('payload is the prompt + admitted facts only: no coordinates, no identifiers', async () => {
    const calls = routeFetch('hang');
    await proxy().handleCandidates(INPUT);
    const body = calls.baseten[0].body;
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model']);
    expect(body.model).toBe(SLUG);
    expect(body.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
    const user = JSON.parse(body.messages[1].content);
    expect(Object.keys(user).sort()).toEqual(['candidates', 'confirmedFacts', 'task']);
    const allowed = ['id', 'name', 'cuisine', 'distanceMeters', 'openNow', 'rating', 'userRatingCount', 'priceLevel', 'source'];
    for (const c of user.candidates) for (const k of Object.keys(c)) expect(allowed, k).toContain(k);
    expect(user.confirmedFacts).toEqual([{ key: 'taste_preference', value: 'ramen' }]);
    expect(JSON.stringify(body)).not.toMatch(/lat|lng|coord|email|userId|user_id|deviceId/i);
  }, 15000);

  it('Baseten ledger refuses BEFORE the call at the call cap and at the USD sub-cap', async () => {
    fs.writeFileSync(basetenLedgerPath, JSON.stringify({ version: 1, call_count: 20, usd_estimate: 0, reservations: [] }));
    let calls = routeFetch('hang');
    let r = await proxy().handleCandidates(INPUT);
    expect(calls.baseten).toHaveLength(0);
    expect(r).toMatchObject({ engineStatus: 'offline_deterministic', fallbackReason: 'timeout' });
    fs.writeFileSync(basetenLedgerPath, JSON.stringify({ version: 1, call_count: 0, usd_estimate: BASETEN_USD_SUBCAP - basetenWorstCaseUsd() / 2, reservations: [] }));
    resetProcessLiveCallCount();
    calls = routeFetch('hang');
    r = await proxy().handleCandidates(INPUT);
    expect(calls.baseten).toHaveLength(0);
    expect(r.engineStatus).toBe('offline_deterministic');
  }, 15000);

  it('missing key or slug, Baseten HTTP error or a post-check failure -> labelled offline answer, at most one attempt', async () => {
    for (const cfg of [baseten({ BASETEN_API_KEY: '' }), baseten({ BASETEN_FALLBACK_MODEL: '' })]) {
      resetProcessLiveCallCount();
      const calls = routeFetch('hang');
      const r = await proxy(cfg).handleCandidates(INPUT);
      expect(calls.baseten).toHaveLength(0);
      expect(r).toMatchObject({ engineStatus: 'offline_deterministic', fallbackReason: 'timeout' });
    }
    resetProcessLiveCallCount();
    let calls = routeFetch('hang', GOOD, 503);
    let r = await proxy().handleCandidates(INPUT);
    expect(calls.baseten).toHaveLength(1);
    expect(r.engineStatus).toBe('offline_deterministic');
    resetProcessLiveCallCount();
    calls = routeFetch('hang', { order: ['google-A'], reason: 'Near Cafe is 30 m away and rated 4.9.', citedFactKeys: [] });
    r = await proxy().handleCandidates(INPUT);
    expect(calls.baseten).toHaveLength(1);
    expect(r.engineStatus).toBe('offline_deterministic'); // invented numbers fail the same post-check
  }, 30000);
});

describe('D8 timing on the REAL default constants (fake timers; no shortened timeouts)', () => {
  /** Muse hangs until its 30 s deadline aborts it; Baseten answers after `basetenMs` (or hangs). */
  function timedFetch(basetenMs: number | 'hang') {
    const calls = { muse: 0, baseten: 0 };
    globalThis.fetch = vi.fn((url: any, init: any) => {
      if (String(url).startsWith(BASETEN_BASE_URL)) {
        calls.baseten += 1;
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          if (basetenMs !== 'hang') {
            setTimeout(
              () => resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(GOOD) } }], usage: { prompt_tokens: 400, completion_tokens: 80 } }) } as any),
              basetenMs
            );
          }
        });
      }
      calls.muse += 1;
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }) as any;
    return calls;
  }
  /** The real defaults: no candidatesTimeoutMs override (30 s), the real Baseten timeout (8 s). */
  const realProxy = () => new ModelDevProxy({ apiKey: MUSE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath, baseten: baseten() });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the declared candidates wait covers the worst case: Muse deadline + Baseten timeout + margin', () => {
    expect((realProxy() as any).config.candidatesTimeoutMs).toBe(CANDIDATES_MODEL_TIMEOUT_MS);
    expect(CANDIDATES_MODEL_TIMEOUT_MS).toBe(30_000);
    expect(BASETEN_FALLBACK_TIMEOUT_MS).toBe(8_000);
    const worstServerMs = CANDIDATES_MODEL_TIMEOUT_MS + BASETEN_FALLBACK_TIMEOUT_MS + CLIENT_WAIT_MARGIN_MS;
    expect(clientCanAwaitServer(CANDIDATES_CLIENT_WAIT_MS, worstServerMs)).toBe(true);
    // The old D5 wait could not: this is the reviewer's finding.
    expect(clientCanAwaitServer(MODEL_CLIENT_WAIT_MS, worstServerMs)).toBe(false);
  });

  it('a real 30 s timeout then a 7 s Baseten answer reaches the client inside its declared wait', async () => {
    const calls = timedFetch(7_000);
    const pending = realProxy().handleCandidates(INPUT, { clientWaitMs: CANDIDATES_CLIENT_WAIT_MS });
    await vi.advanceTimersByTimeAsync(CANDIDATES_MODEL_TIMEOUT_MS);
    expect(calls.baseten).toBe(1);
    await vi.advanceTimersByTimeAsync(7_000);
    const r = await pending;
    expect(r).toMatchObject({ engineStatus: 'baseten_fallback', primaryFailure: 'timeout' });
    expect(r.latencyMs!).toBeGreaterThanOrEqual(CANDIDATES_MODEL_TIMEOUT_MS + 7_000);
    expect(r.latencyMs!).toBeLessThan(CANDIDATES_CLIENT_WAIT_MS);
  });

  it('a declared wait too short for the fallback never reserves or bills Baseten (labelled offline)', async () => {
    const calls = timedFetch(1_000);
    const pending = realProxy().handleCandidates(INPUT, { clientWaitMs: MODEL_CLIENT_WAIT_MS }); // 31 s
    await vi.advanceTimersByTimeAsync(CANDIDATES_MODEL_TIMEOUT_MS + 2_000);
    const r = await pending;
    expect(calls.muse).toBe(1);
    expect(calls.baseten).toBe(0);
    expect(fs.existsSync(basetenLedgerPath)).toBe(false);
    expect(r).toMatchObject({ engineStatus: 'offline_deterministic', fallbackReason: 'timeout' });
  });

  it('a Baseten call that hangs ends at its own timeout, still inside the client wait (labelled offline)', async () => {
    const calls = timedFetch('hang');
    const pending = realProxy().handleCandidates(INPUT, { clientWaitMs: CANDIDATES_CLIENT_WAIT_MS });
    await vi.advanceTimersByTimeAsync(CANDIDATES_MODEL_TIMEOUT_MS + BASETEN_FALLBACK_TIMEOUT_MS);
    const r = await pending;
    expect(calls.baseten).toBe(1);
    expect(r).toMatchObject({ engineStatus: 'offline_deterministic', fallbackReason: 'timeout' });
    expect(r.latencyMs!).toBeLessThan(CANDIDATES_CLIENT_WAIT_MS);
  });
});

