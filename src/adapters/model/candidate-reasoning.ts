/**
 * D4 (DEMO_RESCUE rev12): live Muse Spark reasoning over the REAL nearby candidates.
 *
 * Bounded effect: the model may only (a) reorder the candidate ids it was given and (b) write ONE
 * short reason for the top pick. Everything is post-checked before it reaches the UI:
 * - order is a subset/permutation of the supplied ids (missing ids keep their original order);
 * - the reason cites only numbers present in the input (distances, ratings, counts, prices) and
 *   only confirmed fact keys; no URLs, no key-like strings, length-bounded;
 * - request 'closer' must put the nearest candidate first.
 * Any violation discards the output for the labelled deterministic answer.
 */

export type CandidateRequest = 'rank' | 'why' | 'closer' | 'quieter';

export interface CandidateReasoningCandidate {
  readonly id: string;
  readonly name: string;
  readonly cuisine?: string;
  readonly distanceMeters: number;
  readonly openNow?: boolean | null;
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: number;
  readonly source: 'google' | 'osm';
}

export interface CandidateReasoningInput {
  readonly request: CandidateRequest;
  readonly candidates: readonly CandidateReasoningCandidate[];
  readonly confirmedFacts: readonly { readonly key: string; readonly value: string }[];
}

export interface CandidateReasoningOutput {
  readonly order: readonly string[];
  readonly reason: string;
  readonly citedFactKeys: readonly string[];
}

export const CANDIDATE_REASON_MAX_CHARS = 180;
const ID_RE = /^[A-Za-z0-9_:.\-]{1,120}$/;

export function validateCandidateReasoningInput(
  raw: unknown
): { valid: true; data: CandidateReasoningInput } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') return { valid: false, error: 'not an object' };
  const r = raw as Record<string, unknown>;
  const request = r.request;
  if (request !== 'rank' && request !== 'why' && request !== 'closer' && request !== 'quieter') {
    return { valid: false, error: 'request must be rank|why|closer|quieter' };
  }
  if (!Array.isArray(r.candidates) || r.candidates.length < 1 || r.candidates.length > 5) {
    return { valid: false, error: 'candidates must have 1-5 entries' };
  }
  const candidates: CandidateReasoningCandidate[] = [];
  const seen = new Set<string>();
  for (const c of r.candidates as unknown[]) {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || !ID_RE.test(o.id) || seen.has(o.id)) return { valid: false, error: 'bad candidate id' };
    if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 80) return { valid: false, error: 'bad candidate name' };
    if (typeof o.distanceMeters !== 'number' || !Number.isFinite(o.distanceMeters) || o.distanceMeters < 0 || o.distanceMeters > 5000) {
      return { valid: false, error: 'bad distance' };
    }
    if (o.source !== 'google' && o.source !== 'osm') return { valid: false, error: 'bad source' };
    seen.add(o.id);
    candidates.push({
      id: o.id,
      name: o.name.trim(),
      cuisine: typeof o.cuisine === 'string' && o.cuisine.length <= 40 ? o.cuisine : undefined,
      distanceMeters: Math.round(o.distanceMeters),
      openNow: typeof o.openNow === 'boolean' ? o.openNow : null,
      rating: typeof o.rating === 'number' && o.rating >= 0 && o.rating <= 5 ? o.rating : undefined,
      userRatingCount: typeof o.userRatingCount === 'number' && o.userRatingCount >= 0 ? Math.round(o.userRatingCount) : undefined,
      priceLevel: typeof o.priceLevel === 'number' && o.priceLevel >= 0 && o.priceLevel <= 4 ? o.priceLevel : undefined,
      source: o.source,
    });
  }
  const facts = Array.isArray(r.confirmedFacts) ? (r.confirmedFacts as unknown[]) : [];
  if (facts.length > 5) return { valid: false, error: 'too many facts' };
  const confirmedFacts: { key: string; value: string }[] = [];
  for (const f of facts) {
    const o = (f ?? {}) as Record<string, unknown>;
    if (typeof o.key !== 'string' || !/^[a-z0-9_]{1,60}$/.test(o.key) || typeof o.value !== 'string' || o.value.length > 80) {
      return { valid: false, error: 'bad fact' };
    }
    confirmedFacts.push({ key: o.key, value: o.value });
  }
  return { valid: true, data: { request, candidates, confirmedFacts } };
}

export const CANDIDATE_SYSTEM_PROMPT =
  'You help pick a nearby place to eat. Use ONLY the JSON fields given; never invent facts, places, ' +
  'distances, ratings, prices, hours or noise levels. If the data cannot answer the request, say so plainly. ' +
  'Reply with JSON only: {"order":[candidate ids, best first],"reason":"one sentence under 160 characters for the first pick",' +
  '"citedFactKeys":[keys of confirmedFacts you used]}.';

export function buildCandidateUserMessage(input: CandidateReasoningInput): string {
  const requestText: Record<CandidateRequest, string> = {
    rank: 'Order these for lunch right now and give the reason for the first.',
    why: 'Explain in one sentence why the first candidate is the best pick right now.',
    closer: 'The user wants something closer: put the nearest first and say why.',
    quieter: 'The user wants somewhere quieter. Only use the given fields; if none describe noise, say that.',
  };
  return JSON.stringify({ task: requestText[input.request], candidates: input.candidates, confirmedFacts: input.confirmedFacts });
}

/** Numbers the reason may cite: every numeric field in the input, in common renderings. */
function allowedNumbers(input: CandidateReasoningInput): Set<string> {
  const out = new Set<string>(['1', '2', '3', '4', '5']); // ordinal words like "top 3" / "5-star"
  for (const c of input.candidates) {
    out.add(String(c.distanceMeters));
    out.add((c.distanceMeters / 1000).toFixed(1));
    if (c.rating !== undefined) {
      out.add(String(c.rating));
      out.add(c.rating.toFixed(1));
    }
    if (c.userRatingCount !== undefined) {
      out.add(String(c.userRatingCount));
      out.add(c.userRatingCount.toLocaleString('en-US'));
    }
    if (c.priceLevel !== undefined) out.add(String(c.priceLevel));
  }
  return out;
}

export function validateCandidateReasoningOutput(
  raw: unknown,
  input: CandidateReasoningInput
): { valid: true; data: CandidateReasoningOutput } | { valid: false; reason: 'schema_invalid' | 'fact_check_failed' | 'request_mismatch' } {
  if (!raw || typeof raw !== 'object') return { valid: false, reason: 'schema_invalid' };
  const r = raw as Record<string, unknown>;
  const ids = new Set(input.candidates.map(c => c.id));
  if (!Array.isArray(r.order) || r.order.length < 1) return { valid: false, reason: 'schema_invalid' };
  const order: string[] = [];
  for (const id of r.order) {
    if (typeof id !== 'string' || !ids.has(id)) return { valid: false, reason: 'fact_check_failed' };
    if (!order.includes(id)) order.push(id);
  }
  for (const c of input.candidates) if (!order.includes(c.id)) order.push(c.id);

  const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
  if (reason.length < 8 || reason.length > CANDIDATE_REASON_MAX_CHARS) return { valid: false, reason: 'schema_invalid' };
  if (/https?:\/\/|www\.|key=|AIza/i.test(reason)) return { valid: false, reason: 'fact_check_failed' };
  const nums = allowedNumbers(input);
  for (const tok of reason.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    if (!nums.has(tok) && !nums.has(tok.replace(/,/g, ''))) return { valid: false, reason: 'fact_check_failed' };
  }
  const confirmedKeys = new Set(input.confirmedFacts.map(f => f.key));
  const cited = Array.isArray(r.citedFactKeys) ? r.citedFactKeys : [];
  for (const k of cited) if (typeof k !== 'string' || !confirmedKeys.has(k)) return { valid: false, reason: 'fact_check_failed' };

  if (input.request === 'closer') {
    const nearest = [...input.candidates].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]!;
    if (order[0] !== nearest.id) return { valid: false, reason: 'request_mismatch' };
  }
  return { valid: true, data: { order, reason, citedFactKeys: cited as string[] } };
}

/** Labelled deterministic answer used when the model is off, exhausted, slow or rejected. */
export function deterministicCandidateReasoning(input: CandidateReasoningInput): CandidateReasoningOutput {
  const list = [...input.candidates];
  if (input.request === 'closer') list.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const top = list[0]!;
  const parts: string[] = [];
  if (top.openNow === true) parts.push('open now');
  parts.push(`${top.distanceMeters} m away`);
  if (top.rating !== undefined) parts.push(`rated ${top.rating.toFixed(1)}`);
  const reason =
    input.request === 'quieter'
      ? `No noise information is available for these places; ${top.name} is ${parts.join(', ')}.`
      : `${top.name}: ${parts.join(', ')}.`;
  return { order: list.map(c => c.id), reason, citedFactKeys: [] };
}
