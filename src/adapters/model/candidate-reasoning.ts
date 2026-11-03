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
 *
 * UI-QUIET-PRECISION defect (a) (owner live preview 17:07 JST, Muse call #38 billed but rejected):
 * the post-check is strict on FACTS but tolerant of honest phrasing. Numbers may be an input
 * value, a plain rounding of an input distance / count / rating, or a walking time consistent with
 * an input distance (60-100 m per minute); an id may be given as the candidate's exact name; the
 * JSON may sit inside prose; a reason up to CANDIDATE_REASON_SOFT_MAX_CHARS is cut at a sentence
 * end. Every rejection carries a content-free `detail` code that the server logs.
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
  /** Set when the post-check dropped a clause with an unverifiable number (content-free code). */
  readonly postCheck?: 'numeral_stripped';
}

export const CANDIDATE_REASON_MAX_CHARS = 180;
/** Longer reasons are accepted only if they can be cut at a sentence end within the hard max. */
export const CANDIDATE_REASON_SOFT_MAX_CHARS = 400;

export type CandidateRejectDetail =
  | 'not_an_object'
  | 'no_order'
  | 'unknown_id'
  | 'reason_too_short'
  | 'reason_too_long'
  | 'url_or_key'
  | 'unverified_number'
  | 'unknown_fact_key'
  | 'closer_not_nearest';
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
  'distances, ratings, prices, hours or noise levels. Copy numbers exactly as given (no estimates such as walking ' +
  'minutes). If the data cannot answer the request, say so plainly. ' +
  'Reply with the JSON object only, no other text: {"order":[candidate ids, best first],"reason":"one sentence under 160 characters for the first pick",' +
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

/**
 * Numbers the reason may cite: every numeric field in the input, in common renderings, plus plain
 * roundings (distance to 10/50/100 m or 0.1 km, a count to two significant figures, a rating to
 * one decimal) and a walking time consistent with an input distance at 60-100 m per minute.
 */
function allowedNumbers(input: CandidateReasoningInput): Set<string> {
  const out = new Set<string>(['1', '2', '3', '4', '5']); // ordinal words like "top 3" / "5-star"
  const add = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return;
    out.add(String(n));
    out.add(n.toLocaleString('en-US'));
  };
  for (const c of input.candidates) {
    const d = c.distanceMeters;
    add(d);
    for (const step of [10, 50, 100]) add(Math.round(d / step) * step);
    out.add((d / 1000).toFixed(1));
    out.add((d / 1000).toFixed(2));
    for (let min = Math.max(1, Math.floor(d / 100)); min <= Math.max(1, Math.ceil(d / 60)); min++) add(min);
    if (c.rating !== undefined) {
      out.add(String(c.rating));
      out.add(c.rating.toFixed(1));
    }
    if (c.userRatingCount !== undefined) {
      const n = c.userRatingCount;
      add(n);
      if (n >= 100) {
        const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
        add(Math.floor(n / mag) * mag);
        add(Math.round(n / mag) * mag);
      }
      if (n >= 1000) {
        out.add((n / 1000).toFixed(1));
        out.add(String(Math.floor(n / 1000)));
      }
    }
    if (c.priceLevel !== undefined) out.add(String(c.priceLevel));
  }
  return out;
}

/** The JSON object of a model reply: the whole text, else the last {...} block inside prose. */
export function parseCandidateJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.lastIndexOf('{"order"');
    const from = start >= 0 ? start : trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (from < 0 || end <= from) return undefined;
    try {
      return JSON.parse(trimmed.slice(from, end + 1));
    } catch {
      return undefined;
    }
  }
}

/** A reason within the hard max, cut at the last sentence end if it runs long; else undefined. */
function boundReason(reason: string): string | undefined {
  if (reason.length <= CANDIDATE_REASON_MAX_CHARS) return reason;
  if (reason.length > CANDIDATE_REASON_SOFT_MAX_CHARS) return undefined;
  const head = reason.slice(0, CANDIDATE_REASON_MAX_CHARS);
  const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  return cut >= 20 ? head.slice(0, cut + 1) : undefined;
}

export function validateCandidateReasoningOutput(
  raw: unknown,
  input: CandidateReasoningInput
):
  | { valid: true; data: CandidateReasoningOutput }
  | { valid: false; reason: 'schema_invalid' | 'fact_check_failed' | 'request_mismatch'; detail: CandidateRejectDetail } {
  const reject = (reason: 'schema_invalid' | 'fact_check_failed' | 'request_mismatch', detail: CandidateRejectDetail) =>
    ({ valid: false as const, reason, detail });
  if (!raw || typeof raw !== 'object') return reject('schema_invalid', 'not_an_object');
  const r = raw as Record<string, unknown>;
  const ids = new Set(input.candidates.map(c => c.id));
  const byName = new Map(input.candidates.map(c => [c.name.toLowerCase(), c.id] as const));
  if (!Array.isArray(r.order) || r.order.length < 1) return reject('schema_invalid', 'no_order');
  const order: string[] = [];
  for (const raw of r.order) {
    const id = typeof raw === 'string' ? (ids.has(raw) ? raw : byName.get(raw.trim().toLowerCase())) : undefined;
    if (!id) return reject('fact_check_failed', 'unknown_id');
    if (!order.includes(id)) order.push(id);
  }
  for (const c of input.candidates) if (!order.includes(c.id)) order.push(c.id);

  const fullReason = typeof r.reason === 'string' ? r.reason.trim() : '';
  if (fullReason.length < 8) return reject('schema_invalid', 'reason_too_short');
  const reason = boundReason(fullReason);
  if (!reason) return reject('schema_invalid', 'reason_too_long');
  if (/https?:\/\/|www\.|key=|AIza/i.test(reason)) return reject('fact_check_failed', 'url_or_key');
  const nums = allowedNumbers(input);
  const verified = (text: string) =>
    (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).every(tok => nums.has(tok) || nums.has(tok.replace(/,/g, '')));
  let shownReason = reason;
  let postCheck: CandidateReasoningOutput['postCheck'];
  if (!verified(reason)) {
    // Fail soft: drop only the clauses that carry an unverifiable number, keep the rest if it still
    // says something (and re-check it); never rewrite the model's words.
    const kept = reason
      .split(/(?<=[.!?;])\s+|,\s+|\s+(?:and|but)\s+|\s+—\s+/)
      .map(c => c.trim().replace(/[.!?;,]+$/, ''))
      .filter(c => c.length > 0 && verified(c));
    const rebuilt = kept.length > 0 ? `${kept.join(', ')}.` : '';
    if (rebuilt.length < 12 || !verified(rebuilt)) return reject('fact_check_failed', 'unverified_number');
    shownReason = rebuilt.charAt(0).toUpperCase() + rebuilt.slice(1);
    postCheck = 'numeral_stripped';
  }
  const confirmedKeys = new Set(input.confirmedFacts.map(f => f.key));
  const cited = Array.isArray(r.citedFactKeys) ? r.citedFactKeys : [];
  for (const k of cited) if (typeof k !== 'string' || !confirmedKeys.has(k)) return reject('fact_check_failed', 'unknown_fact_key');

  if (input.request === 'closer') {
    const nearest = [...input.candidates].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]!;
    if (order[0] !== nearest.id) return reject('request_mismatch', 'closer_not_nearest');
  }
  return { valid: true, data: { order, reason: shownReason, citedFactKeys: cited as string[], ...(postCheck ? { postCheck } : {}) } };
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
