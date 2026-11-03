/**
 * D4-MODEL-REASONING-ON boundary tests (DEMO_RESCUE rev12, TID INBOX-20261102-0CA653).
 * Zero billed calls: every "live" response here is a mocked fetch.
 * - Budget: code ceiling 200 (lowering-only), operating cap 100 (lowering-only), hard stop from the
 *   ledger with a labelled deterministic answer, zero outbound calls when MODEL_LIVE_ENABLED is off.
 * - Security: /api/model/* refuses LAN hosts even with DEV_DEVICE_TESTING=true.
 * - /api/model/candidates: live answer only after the post-check; the key never appears in the
 *   response or the usage log; tokens are logged per call; usage math inside USD 20.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  ModelDevProxy,
  createModelProxyMiddleware,
  readLedgerState,
  resetProcessLiveCallCount,
  MODEL_LIFETIME_MAX_CALLS,
  MODEL_OPERATING_CAP_DEFAULT,
  MODEL_USD_GUARDRAIL,
  estimateModelSpendUsd,
  resolveOperatingCap,
  resolveModelLiveEnabled,
  readLedgerSpend,
  worstCaseCallUsd,
} from '../../src/adapters/model/server-proxy.js';
import {
  validateCandidateReasoningInput,
  validateCandidateReasoningOutput,
  deterministicCandidateReasoning,
  type CandidateReasoningInput,
} from '../../src/adapters/model/candidate-reasoning.js';

const FAKE_KEY = 'sk-FAKE-d4-candidates-0123456789';

const INPUT: CandidateReasoningInput = {
  request: 'rank',
  candidates: [
    { id: 'google-A', name: 'Near Cafe', cuisine: 'cafe', distanceMeters: 45, openNow: true, rating: 4.6, userRatingCount: 1204, priceLevel: 2, source: 'google' },
    { id: 'google-B', name: 'Mid Ramen', cuisine: 'ramen', distanceMeters: 125, openNow: null, rating: 4.2, userRatingCount: 310, source: 'google' },
    { id: 'overpass-node-9', name: 'OSM Soba', distanceMeters: 300, openNow: true, source: 'osm' },
  ],
  confirmedFacts: [{ key: 'taste_preference', value: 'ramen' }],
};

function modelReply(content: unknown, usage = { prompt_tokens: 410, completion_tokens: 62 }) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: 'stop' }], usage }),
  }));
}

function reqRes(url: string, host: string, bodyObj?: unknown, method = 'POST') {
  const bodyStr = bodyObj !== undefined ? JSON.stringify(bodyObj) : '';
  const req: any = {
    url,
    method,
    headers: { host, 'content-type': 'application/json' },
    on: (event: string, handler: (...a: any[]) => void) => {
      if (event === 'data' && bodyStr) handler(Buffer.from(bodyStr));
      if (event === 'end') handler();
    },
  };
  const response = { statusCode: 200, body: '' };
  const res: any = { setHeader: vi.fn(), end: vi.fn((d?: string) => { if (d) response.body = d; }) };
  Object.defineProperty(res, 'statusCode', { get: () => response.statusCode, set: (v: number) => { response.statusCode = v; } });
  return { req, res, next: vi.fn(), response };
}

describe('D4 candidate reasoning: input/output post-check', () => {
  it('accepts a valid permutation with an in-data reason and confirmed citation', () => {
    const out = validateCandidateReasoningOutput(
      { order: ['google-B', 'google-A'], reason: 'Mid Ramen matches your confirmed taste for ramen and is 125 m away.', citedFactKeys: ['taste_preference'] },
      INPUT
    );
    expect(out.valid).toBe(true);
    if (out.valid) expect(out.data.order).toEqual(['google-B', 'google-A', 'overpass-node-9']);
  });

  it.each([
    [{ order: ['ghost'], reason: 'A fine pick for lunch today.', citedFactKeys: [] }, 'fact_check_failed'],
    [{ order: ['google-A'], reason: 'Near Cafe is only 30 m away.', citedFactKeys: [] }, 'fact_check_failed'],
    [{ order: ['google-A'], reason: 'Rated 4.9 by thousands of people.', citedFactKeys: [] }, 'fact_check_failed'],
    [{ order: ['google-A'], reason: 'See https://example.com for the menu.', citedFactKeys: [] }, 'fact_check_failed'],
    [{ order: ['google-A'], reason: 'Matches your confirmed love of sushi.', citedFactKeys: ['sushi_love'] }, 'fact_check_failed'],
    [{ order: ['google-A'], reason: 'ok' }, 'schema_invalid'],
    [{ reason: 'No order supplied here at all.' }, 'schema_invalid'],
  ])('rejects %j (%s)', (raw, reason) => {
    const out = validateCandidateReasoningOutput(raw, INPUT);
    expect(out).toEqual({ valid: false, reason });
  });

  it("'closer' must put the nearest first", () => {
    const closer = { ...INPUT, request: 'closer' as const };
    expect(validateCandidateReasoningOutput({ order: ['google-B'], reason: 'Mid Ramen is close to you.', citedFactKeys: [] }, closer)).toEqual({ valid: false, reason: 'request_mismatch' });
    expect(validateCandidateReasoningOutput({ order: ['google-A'], reason: 'Near Cafe is the closest at 45 m.', citedFactKeys: [] }, closer).valid).toBe(true);
  });

  it('input schema rejects bad ids, too many candidates, unknown sources, bad facts', () => {
    expect(validateCandidateReasoningInput({ ...INPUT }).valid).toBe(true);
    expect(validateCandidateReasoningInput({ ...INPUT, request: 'book' }).valid).toBe(false);
    expect(validateCandidateReasoningInput({ ...INPUT, candidates: Array(6).fill(INPUT.candidates[0]) }).valid).toBe(false);
    expect(validateCandidateReasoningInput({ ...INPUT, candidates: [{ ...INPUT.candidates[0], id: 'a b<' }] }).valid).toBe(false);
    expect(validateCandidateReasoningInput({ ...INPUT, candidates: [{ ...INPUT.candidates[0], source: 'yelp' }] }).valid).toBe(false);
    expect(validateCandidateReasoningInput({ ...INPUT, confirmedFacts: [{ key: 'Bad Key', value: 'x' }] }).valid).toBe(false);
  });

  it('deterministic answer: closer sorts by distance; quieter says noise data is absent', () => {
    expect(deterministicCandidateReasoning({ ...INPUT, request: 'closer' }).order[0]).toBe('google-A');
    expect(deterministicCandidateReasoning({ ...INPUT, request: 'quieter' }).reason).toMatch(/^No noise information is available/);
  });
});

describe('D4 budget, hard stop, security and spend math', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-d4-'));
  const ledgerPath = path.join(tempDir, 'model-live-ledger.json');
  const originalFetch = globalThis.fetch;
  const savedEnv = { ...process.env };

  function seed(n: number) {
    fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, call_count: n, reservations: [] }));
  }

  beforeEach(() => {
    resetProcessLiveCallCount();
    try { fs.rmSync(path.join(tempDir, 'model-usage-log.jsonl')); } catch {}
    seed(22);
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...savedEnv };
  });

  it('ceiling 200 / operating cap 100, and the usage math stays inside USD 20', () => {
    expect(MODEL_LIFETIME_MAX_CALLS).toBe(200);
    expect(MODEL_OPERATING_CAP_DEFAULT).toBe(100);
    expect(resolveOperatingCap({ MODEL_OPERATING_CAP: '500' })).toBe(100);
    expect(estimateModelSpendUsd(MODEL_OPERATING_CAP_DEFAULT)).toBe(0.5);
    expect(estimateModelSpendUsd(MODEL_LIFETIME_MAX_CALLS)).toBeLessThanOrEqual(MODEL_USD_GUARDRAIL);
  });

  it("MODEL_LIVE_ENABLED: default ON for the demo, only '1' enables explicitly, any other value off, never the default in unit runs", () => {
    expect(resolveModelLiveEnabled({})).toBe(true);
    expect(resolveModelLiveEnabled({ MODEL_LIVE_ENABLED: '' })).toBe(true);
    expect(resolveModelLiveEnabled({ MODEL_LIVE_ENABLED: '0' })).toBe(false);
    expect(resolveModelLiveEnabled({ MODEL_LIVE_ENABLED: 'false' })).toBe(false);
    expect(resolveModelLiveEnabled({ MODEL_LIVE_ENABLED: 'true' })).toBe(false);
    expect(resolveModelLiveEnabled({ MODEL_LIVE_ENABLED: '1' })).toBe(true);
    expect(resolveModelLiveEnabled({ VITEST: 'true' })).toBe(false);
    expect(resolveModelLiveEnabled({ NODE_ENV: 'test' })).toBe(false);
  });

  it('MODEL_LIVE_ENABLED off: labelled deterministic answer, zero outbound calls, ledger unchanged', async () => {
    const fetchSpy = modelReply({ order: ['google-B'], reason: 'unused', citedFactKeys: [] });
    globalThis.fetch = fetchSpy as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: false, ledgerPath });
    const res = await proxy.handleCandidates(INPUT);
    expect(res).toMatchObject({ usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readLedgerState(ledgerPath).callCount).toBe(22);
  });

  it('live (mocked): post-checked answer, ledger 22 -> 23 of 100, tokens logged, no key anywhere', async () => {
    const fetchSpy = modelReply({ order: ['google-B', 'google-A'], reason: 'Mid Ramen matches your confirmed taste for ramen.', citedFactKeys: ['taste_preference'] });
    globalThis.fetch = fetchSpy as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    const res = await proxy.handleCandidates(INPUT);
    expect(res.engineStatus).toBe('meta_model_live');
    expect(res.usedFallback).toBe(false);
    expect(res.result.order[0]).toBe('google-B');
    expect(res.ledger).toEqual({ callCount: 23, cap: 100 });
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as any)[1].body));
    expect(body.max_tokens).toBe(300);
    expect(JSON.stringify(res)).not.toContain(FAKE_KEY);
    const usage = fs.readFileSync(path.join(tempDir, 'model-usage-log.jsonl'), 'utf-8');
    expect(JSON.parse(usage.trim())).toMatchObject({ endpoint: 'candidates', promptTokens: 410, completionTokens: 62, callCount: 23 });
    expect(usage).not.toContain(FAKE_KEY);
    expect(usage).not.toContain('Near Cafe');
  });

  it('a live output that fails the post-check is discarded for the deterministic answer (still counted)', async () => {
    globalThis.fetch = modelReply({ order: ['google-A'], reason: 'Near Cafe is only 30 m away and rated 4.9.', citedFactKeys: [] }) as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    const res = await proxy.handleCandidates(INPUT);
    expect(res).toMatchObject({ usedFallback: true, fallbackReason: 'fact_check_failed', engineStatus: 'offline_deterministic' });
    expect(res.result.reason).not.toContain('4.9');
    expect(readLedgerState(ledgerPath).callCount).toBe(23);
  });

  it('hard stop: ledger at the operating cap -> labelled fallback, zero fetches, survives restart', async () => {
    seed(100);
    const fetchSpy = modelReply({ order: ['google-B'], reason: 'unused reason text', citedFactKeys: [] });
    globalThis.fetch = fetchSpy as any;
    for (let restart = 0; restart < 2; restart++) {
      resetProcessLiveCallCount();
      const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath, lifetimeMaxCalls: 200 });
      const res = await proxy.handleCandidates(INPUT);
      expect(res).toMatchObject({ usedFallback: true, fallbackReason: 'budget_exhausted', ledger: { callCount: 100, cap: 100 } });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readLedgerState(ledgerPath).callCount).toBe(100);
  });

  it('owner can lower the cap at runtime (MODEL_OPERATING_CAP=23): one call then stop', async () => {
    process.env.MODEL_OPERATING_CAP = '23';
    const fetchSpy = modelReply({ order: ['google-A'], reason: 'Near Cafe is open now and 45 m away.', citedFactKeys: [] });
    globalThis.fetch = fetchSpy as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath, reasoningBudgetCeiling: 23 });
    expect((await proxy.handleCandidates(INPUT)).engineStatus).toBe('meta_model_live');
    expect((await proxy.handleCandidates(INPUT)).fallbackReason).toBe('budget_exhausted');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('SECURITY: LAN hosts get 403 on /api/model/candidates even with DEV_DEVICE_TESTING=true', async () => {
    process.env.DEV_DEVICE_TESTING = 'true';
    const fetchSpy = modelReply({});
    globalThis.fetch = fetchSpy as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    const mw = createModelProxyMiddleware(proxy);
    for (const host of ['192.168.31.45:4443', '100.123.60.65:4174', 'evil.example:4174', 'localhost:4294']) {
      const { req, res, next, response } = reqRes('/api/model/candidates', host, INPUT);
      await mw(req, res, next);
      expect(response.statusCode, host).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readLedgerState(ledgerPath).callCount).toBe(22);
    // Surface E (phone via ssh -R) arrives as loopback on an allowlisted port and is served.
    const ok = reqRes('/api/model/candidates', 'localhost:4174', INPUT);
    await mw(ok.req, ok.res, ok.next);
    expect(ok.response.statusCode).toBe(200);
  });

  it('USD: tokens recorded per call; the worst-case pre-charge is corrected to actual', async () => {
    fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, call_count: 22, reservations: [], usd_estimate: 0.5 }));
    globalThis.fetch = modelReply({ order: ['google-A'], reason: 'Near Cafe is open now and 45 m away.', citedFactKeys: [] }) as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    expect((await proxy.handleCandidates(INPUT)).engineStatus).toBe('meta_model_live');
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    const entry = raw.reservations.find((r: any) => r.callIndex === 23);
    expect(entry).toMatchObject({ endpoint: 'candidates', tokens_in: 410, tokens_out: 62, usd_precharge: 0 });
    expect(entry.usd).toBeCloseTo(((410 + 62) * 2) / 1e6, 9);
    const spend = readLedgerSpend(ledgerPath)!;
    expect(spend).toMatchObject({ callCount: 23, tokensIn: 410, tokensOut: 62 });
    expect(spend.usdEstimate).toBeCloseTo(0.5 + (472 * 2) / 1e6, 6);
  });

  it('USD: a ledger without spend data is backfilled at the per-call worst case (conservative)', async () => {
    seed(32);
    globalThis.fetch = modelReply({ order: ['google-A'], reason: 'Near Cafe is open now and 45 m away.', citedFactKeys: [] }) as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    await proxy.handleCandidates(INPUT);
    const spend = readLedgerSpend(ledgerPath)!;
    expect(spend.callCount).toBe(33);
    expect(spend.usdEstimate).toBeCloseTo(32 * worstCaseCallUsd() + (472 * 2) / 1e6, 6);
  });

  it('USD guard: a call that could reach USD 20 cumulative is refused before any fetch', async () => {
    fs.writeFileSync(ledgerPath, JSON.stringify({ version: 1, call_count: 40, reservations: [], usd_estimate: 19.99 }));
    const fetchSpy = modelReply({ order: ['google-A'], reason: 'unused reason text', citedFactKeys: [] });
    globalThis.fetch = fetchSpy as any;
    const proxy = new ModelDevProxy({ apiKey: FAKE_KEY, liveEnabled: true, maxCalls: 10, ledgerPath });
    const res = await proxy.handleCandidates(INPUT);
    expect(res).toMatchObject({ usedFallback: true, fallbackReason: 'budget_exhausted' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readLedgerSpend(ledgerPath)).toMatchObject({ callCount: 40, usdEstimate: 19.99 });
  });
});

