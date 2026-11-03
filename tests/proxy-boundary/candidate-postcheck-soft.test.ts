/**
 * UI-QUIET-PRECISION defect (a) (TID INBOX-20261103-A22CFB): owner live preview 17:07 JST, Muse
 * Spark call #38 (candidates, 1725 completion tokens) was billed and then discarded, so the owner
 * saw the offline answer. Its raw reply was never recorded (the proxy logger is a no-op and the
 * usage log had no outcome), so these SYNTHETIC replies reproduce the reviewer's hypotheses. Each
 * one failed the old post-check; honest phrasing now passes, while invented facts still fail.
 * Zero billed calls (fake fetch only).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ModelDevProxy, resetProcessLiveCallCount } from '../../src/adapters/model/server-proxy.js';
import {
  parseCandidateJson,
  validateCandidateReasoningOutput,
  type CandidateReasoningInput,
} from '../../src/adapters/model/candidate-reasoning.js';
import { CANDIDATES_CLIENT_WAIT_MS } from '../../src/adapters/model/timeout-config.js';

const INPUT: CandidateReasoningInput = {
  request: 'rank',
  candidates: [
    { id: 'google-A', name: 'Soba Ichi', cuisine: 'soba', distanceMeters: 347, openNow: true, rating: 4.46, userRatingCount: 1204, priceLevel: 1, source: 'google' },
    { id: 'google-B', name: 'Curry Ten', cuisine: 'curry', distanceMeters: 612, openNow: true, rating: 4.1, userRatingCount: 310, source: 'google' },
  ],
  confirmedFacts: [{ key: 'taste_preference', value: 'soba' }],
};

const ok = (reason: string, order: unknown[] = ['google-A', 'google-B']) => validateCandidateReasoningOutput({ order, reason, citedFactKeys: [] }, INPUT);

describe('defect (a): honest phrasing that the old post-check rejected now passes', () => {
  it.each([
    ['a walking time consistent with the distance', 'Soba Ichi is open now and about a 5-minute walk away.'],
    ['a rounded distance', 'Soba Ichi is open now, roughly 350 m away.'],
    ['a distance in km', 'Soba Ichi is 0.35 km away and open now.'],
    ['a rounded rating', 'Soba Ichi is open now and rated 4.5 stars.'],
    ['a rounded review count', 'Soba Ichi has over 1,200 reviews and is open now.'],
    ['a review count in thousands', 'Soba Ichi is open now with 1.2k reviews.'],
  ])('%s', (_name, reason) => {
    const out = ok(reason);
    expect(out.valid, JSON.stringify(out)).toBe(true);
  });

  it('a candidate given by its exact name instead of its id', () => {
    const out = ok('Soba Ichi is open now and close by.', ['Soba Ichi', 'google-B']);
    expect(out.valid).toBe(true);
    if (out.valid) expect(out.data.order).toEqual(['google-A', 'google-B']);
  });

  it('a long two-sentence reason is cut at the sentence end (never mid-word)', () => {
    const reason =
      'Soba Ichi is open now and only 347 m away, so it is the quickest good lunch from here. ' +
      'It also has a strong rating of 4.46 from 1,204 people, which is higher than Curry Ten and its 310 reviews nearby.';
    expect(reason.length).toBeGreaterThan(180);
    const out = ok(reason);
    expect(out.valid).toBe(true);
    if (out.valid) expect(out.data.reason).toBe('Soba Ichi is open now and only 347 m away, so it is the quickest good lunch from here.');
  });

  it('the JSON object inside prose or a code fence is extracted', () => {
    const body = { order: ['google-A'], reason: 'Soba Ichi is open now.', citedFactKeys: [] };
    expect(parseCandidateJson(`Here is my answer:\n${JSON.stringify(body)}`)).toEqual(body);
    expect(parseCandidateJson('```json\n' + JSON.stringify(body) + '\n```')).toEqual(body);
    expect(parseCandidateJson('no json here')).toBeUndefined();
  });
});

describe('defect (a): an unverifiable numeral fails soft (its clause is dropped, the rest re-checked)', () => {
  it.each([
    ['comma clause', 'Soba Ichi is open now, only 30 m away.', 'Soba Ichi is open now.'],
    ['and-clause', 'Soba Ichi is open now and opens until 22:00 tonight.', 'Soba Ichi is open now.'],
    ['second sentence', 'Soba Ichi is open now and close by. It is rated 4.9 by locals.', 'Soba Ichi is open now, close by.'],
  ])('%s', (_name, reason, shown) => {
    const out = ok(reason);
    expect(out.valid, JSON.stringify(out)).toBe(true);
    if (out.valid) {
      expect(out.data.reason).toBe(shown);
      expect(out.data.postCheck).toBe('numeral_stripped');
      expect(out.data.reason).not.toMatch(/30|22|4\.9/);
    }
  });

  it('nothing honest left -> rejected (never an empty or made-up reason)', () => {
    expect(ok('Only 30 m away.')).toMatchObject({ valid: false, detail: 'unverified_number' });
    expect(ok('Rated 4.9, 30 m away.')).toMatchObject({ valid: false, detail: 'unverified_number' });
  });

  it('an out-of-set id stays strictly rejected even when the reason is fine', () => {
    expect(ok('Soba Ichi is open now.', ['google-Z'])).toMatchObject({ valid: false, reason: 'fact_check_failed', detail: 'unknown_id' });
  });
});

describe('defect (a): invented facts still fail, with a content-free detail code', () => {
  it.each([
    ['an invented distance (one clause)', ok('Only 30 m away.'), 'unverified_number'],
    ['invented opening hours (one clause)', ok('Open until 22:00 tonight.'), 'unverified_number'],
    ['an invented rating (one clause)', ok('Rated 4.9 by locals.'), 'unverified_number'],
    ['an unknown place', ok('Sushi Zen is the best pick.', ['Sushi Zen']), 'unknown_id'],
    ['a URL', ok('See https://example.com for Soba Ichi.'), 'url_or_key'],
    ['a reason too long to cut', ok('x'.repeat(500)), 'reason_too_long'],
    ['a too-short reason', ok('ok'), 'reason_too_short'],
  ])('%s', (_name, out, detail) => {
    expect(out).toMatchObject({ valid: false, detail });
  });

  it('an unconfirmed fact key', () => {
    const out = validateCandidateReasoningOutput({ order: ['google-A'], reason: 'Soba Ichi matches your love of soba.', citedFactKeys: ['soba_love'] }, INPUT);
    expect(out).toMatchObject({ valid: false, reason: 'fact_check_failed', detail: 'unknown_fact_key' });
  });
});

describe('defect (a): every billed answer leaves a content-free outcome line', () => {
  let dir: string;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yori-defect-a-'));
    fs.writeFileSync(path.join(dir, 'model-ledger.json'), JSON.stringify({ version: 1, call_count: 38, reservations: [] }));
    resetProcessLiveCallCount();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const reply = (content: string, finish = 'stop') => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 315, completion_tokens: 1725 } }),
    })) as any;
  };
  const run = async () => {
    const logs: string[] = [];
    const p = new ModelDevProxy({ apiKey: 'sk-FAKE-defect-a-0123456789', liveEnabled: true, maxCalls: 5, ledgerPath: path.join(dir, 'model-ledger.json') }, m => logs.push(m));
    const r = await p.handleCandidates(INPUT, { clientWaitMs: CANDIDATES_CLIENT_WAIT_MS });
    const lines = fs.readFileSync(path.join(dir, 'model-usage-log.jsonl'), 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    return { r, line: lines[lines.length - 1], logs, raw: fs.readFileSync(path.join(dir, 'model-usage-log.jsonl'), 'utf-8') };
  };

  it('a rejected answer is logged with reason, detail and finish reason, never its content', async () => {
    reply(JSON.stringify({ order: ['google-A'], reason: 'Soba Ichi is only 30 m away from Shinjuku Gyoen.', citedFactKeys: [] }));
    const { r, line, logs, raw } = await run();
    expect(r).toMatchObject({ engineStatus: 'offline_deterministic', fallbackReason: 'fact_check_failed' });
    expect(line).toMatchObject({ endpoint: 'candidates', outcome: 'rejected', rejectReason: 'fact_check_failed', rejectDetail: 'unverified_number', finishReason: 'stop', completionTokens: 1725 });
    expect(logs.join('\n')).toContain('fact_check_failed/unverified_number');
    for (const leak of ['Soba Ichi', 'Shinjuku', '30 m', 'google-A', 'sk-FAKE']) expect(raw, leak).not.toContain(leak);
  });

  it('an honest reply that the old check rejected is now shown live (accepted line)', async () => {
    reply('Here is my answer:\n' + JSON.stringify({ order: ['google-A', 'google-B'], reason: 'Soba Ichi is open now and about a 5-minute walk away.', citedFactKeys: [] }));
    const { r, line } = await run();
    expect(r).toMatchObject({ engineStatus: 'meta_model_live', usedFallback: false });
    expect(r.result.reason).toBe('Soba Ichi is open now and about a 5-minute walk away.');
    expect(line).toMatchObject({ outcome: 'accepted', finishReason: 'stop' });
  });

  it('a soft-stripped answer is shown live and logged accepted with the content-free code', async () => {
    reply(JSON.stringify({ order: ['google-A', 'google-B'], reason: 'Soba Ichi is open now, only 30 m away.', citedFactKeys: [] }));
    const { r, line, raw } = await run();
    expect(r).toMatchObject({ engineStatus: 'meta_model_live' });
    expect(r.result.reason).toBe('Soba Ichi is open now.');
    expect(line).toMatchObject({ outcome: 'accepted', rejectDetail: 'numeral_stripped', finishReason: 'stop' });
    for (const leak of ['Soba', '30 m', 'google-A']) expect(raw, leak).not.toContain(leak);
  });

  it('a truncated or non-JSON reply is logged with its extraction outcome', async () => {
    reply('{"order":["google-A"],"reason":"Soba', 'length');
    expect((await run()).line).toMatchObject({ outcome: 'rejected', rejectReason: 'truncated', finishReason: 'length' });
    reply('I think Soba Ichi is best.');
    expect((await run()).line).toMatchObject({ outcome: 'rejected', rejectReason: 'schema_invalid', rejectDetail: 'not_json' });
  });
});
