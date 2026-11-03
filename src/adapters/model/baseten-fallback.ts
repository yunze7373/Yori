/**
 * D8-BASETEN-FALLBACK (DEMO_RESCUE rev12): one labelled answer from a fast Baseten LLM, used ONLY
 * when the Muse Spark call ended in our own timeout hard stop (a proven timeout, never on 4xx,
 * 5xx, schema_invalid or a budget refusal). Muse Spark stays the primary engine and is never
 * impersonated: the answer carries engineStatus 'baseten_fallback' and a 'Baseten fallback · …'
 * label.
 * - Server-side only. BASETEN_API_KEY and BASETEN_FALLBACK_MODEL come from the owner's .env.local;
 *   they are never VITE_-prefixed, never logged and never returned. No slug is hardcoded; a
 *   missing or malformed slug fails closed to the labelled offline answer.
 * - Payload: the same validated prompt + admitted facts as the Muse Spark call (candidate names,
 *   distances, ratings, prices, open state; confirmed facts). No coordinates, no user identifiers.
 * - Ledger (.yori-runtime/baseten-ledger.json), reserved BEFORE the call: operating cap 20 calls
 *   and a USD 10 sub-cap (both lowering-only), with a worst-case pre-charge corrected to real
 *   usage afterwards. The per-token rate is a conservative estimate (UNVERIFIED).
 * - BASETEN_LIVE_ENABLED: only '1' enables explicitly; unset means on, except in unit runs; any
 *   other value off. Every Playwright server pins it to '0'.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  CANDIDATE_SYSTEM_PROMPT,
  buildCandidateUserMessage,
  validateCandidateReasoningOutput,
  type CandidateReasoningInput,
  type CandidateReasoningOutput,
} from './candidate-reasoning.js';

export const BASETEN_BASE_URL = 'https://inference.baseten.co/v1';
export const BASETEN_OPERATING_CAP_DEFAULT = 20;
export const BASETEN_USD_SUBCAP = 10;
export const BASETEN_MAX_TOKENS = 600;
export const BASETEN_TIMEOUT_MS = 8000;
/** Worst-case pricing for the pre-charge: USD per 1M tokens, input and output (UNVERIFIED). */
export const BASETEN_USD_PER_1M_TOKENS = 3.0;
export const BASETEN_WORST_CASE_PROMPT_TOKENS = 3000;
/** "org/model" with conservative characters, e.g. "openai/gpt-oss-120b". */
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface BasetenConfig {
  readonly enabled: boolean;
  readonly disabledReason?: 'live_off' | 'no_key' | 'no_model' | 'bad_model_slug';
  readonly apiKey?: string;
  readonly model?: string;
  /** Shown to the user: 'Baseten fallback · <model family>'. */
  readonly label: string;
  readonly operatingCap: number;
  readonly usdSubCap: number;
  readonly ledgerPath: string;
}

export function resolveBasetenLiveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env['BASETEN_LIVE_ENABLED'];
  if (raw === '1') return true;
  if (raw !== undefined && raw.trim() !== '') return false;
  if (env['VITEST'] || env['NODE_ENV'] === 'test') return false;
  return true;
}

function lowerOnly(raw: string | undefined, ceiling: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, ceiling) : ceiling;
}

export function resolveBasetenConfig(env: Record<string, string | undefined> = process.env): BasetenConfig {
  const apiKey = env['BASETEN_API_KEY']?.trim() || undefined;
  const model = env['BASETEN_FALLBACK_MODEL']?.trim() || undefined;
  const family = model && SLUG_PATTERN.test(model) ? model.split('/')[1]! : undefined;
  const live = resolveBasetenLiveEnabled(env);
  const disabledReason = !live ? 'live_off' : !apiKey ? 'no_key' : !model ? 'no_model' : !family ? 'bad_model_slug' : undefined;
  return {
    enabled: disabledReason === undefined,
    disabledReason,
    apiKey,
    model: family ? model : undefined,
    label: `Baseten fallback · ${family ?? 'not configured'}`,
    operatingCap: lowerOnly(env['BASETEN_OPERATING_CAP'], BASETEN_OPERATING_CAP_DEFAULT),
    usdSubCap: lowerOnly(env['BASETEN_USD_SUBCAP'], BASETEN_USD_SUBCAP),
    ledgerPath: env['BASETEN_LEDGER_PATH']?.trim() || path.join(process.cwd(), '.yori-runtime', 'baseten-ledger.json'),
  };
}

export function basetenWorstCaseUsd(maxTokens: number = BASETEN_MAX_TOKENS): number {
  return ((BASETEN_WORST_CASE_PROMPT_TOKENS + maxTokens) * BASETEN_USD_PER_1M_TOKENS) / 1_000_000;
}

interface BasetenLedgerState {
  version: 1;
  call_count: number;
  usd_estimate: number;
  reservations: { callIndex: number; at: string; usd_precharge: number; usd?: number; tokens_in?: number; tokens_out?: number }[];
}

export function readBasetenLedger(ledgerPath: string): BasetenLedgerState {
  try {
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8')) as Partial<BasetenLedgerState>;
    return {
      version: 1,
      call_count: typeof raw.call_count === 'number' ? raw.call_count : 0,
      usd_estimate: typeof raw.usd_estimate === 'number' ? raw.usd_estimate : 0,
      reservations: Array.isArray(raw.reservations) ? raw.reservations : [],
    };
  } catch {
    return { version: 1, call_count: 0, usd_estimate: 0, reservations: [] };
  }
}

function writeBasetenLedger(ledgerPath: string, state: BasetenLedgerState): boolean {
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** Reserve one call with a worst-case pre-charge; refuses at the cap or the USD sub-cap. */
export function reserveBasetenCall(config: BasetenConfig): { ok: true; callIndex: number } | { ok: false; reason: 'baseten_cap' | 'baseten_usd_cap' | 'baseten_ledger_unwritable' } {
  const state = readBasetenLedger(config.ledgerPath);
  if (state.call_count >= config.operatingCap) return { ok: false, reason: 'baseten_cap' };
  const worst = basetenWorstCaseUsd();
  if (state.usd_estimate + worst > config.usdSubCap) return { ok: false, reason: 'baseten_usd_cap' };
  const callIndex = state.call_count + 1;
  const next: BasetenLedgerState = {
    ...state,
    call_count: callIndex,
    usd_estimate: state.usd_estimate + worst,
    reservations: [...state.reservations, { callIndex, at: new Date().toISOString(), usd_precharge: worst }],
  };
  return writeBasetenLedger(config.ledgerPath, next) ? { ok: true, callIndex } : { ok: false, reason: 'baseten_ledger_unwritable' };
}

/** Replace the worst-case pre-charge with real usage when the response reports it. */
export function recordBasetenUsage(config: BasetenConfig, callIndex: number, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined): void {
  const tin = usage?.prompt_tokens;
  const tout = usage?.completion_tokens;
  if (typeof tin !== 'number' || typeof tout !== 'number') return;
  const state = readBasetenLedger(config.ledgerPath);
  const entry = state.reservations.find(r => r.callIndex === callIndex);
  if (!entry || entry.usd !== undefined) return;
  const usd = ((tin + tout) * BASETEN_USD_PER_1M_TOKENS) / 1_000_000;
  entry.usd = usd;
  entry.tokens_in = tin;
  entry.tokens_out = tout;
  state.usd_estimate = Math.max(0, state.usd_estimate - entry.usd_precharge + usd);
  entry.usd_precharge = 0;
  writeBasetenLedger(config.ledgerPath, state);
}

export type BasetenFallbackResult =
  | { readonly ok: true; readonly result: CandidateReasoningOutput; readonly latencyMs: number; readonly callIndex: number }
  | { readonly ok: false; readonly reason: string; readonly callIndex?: number };

/** One attempt. Any failure returns ok:false so the caller gives the labelled offline answer. */
export async function callBasetenFallback(
  input: CandidateReasoningInput,
  config: BasetenConfig,
  fetchFn: typeof fetch = (...a) => fetch(...a),
  timeoutMs: number = BASETEN_TIMEOUT_MS
): Promise<BasetenFallbackResult> {
  if (!config.enabled || !config.apiKey || !config.model) return { ok: false, reason: config.disabledReason ?? 'not_configured' };
  const reservation = reserveBasetenCall(config);
  if (!reservation.ok) return { ok: false, reason: reservation.reason };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetchFn(`${BASETEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        max_tokens: BASETEN_MAX_TOKENS,
        messages: [
          { role: 'system', content: CANDIDATE_SYSTEM_PROMPT },
          { role: 'user', content: buildCandidateUserMessage(input) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `baseten_http_${res.status}`, callIndex: reservation.callIndex };
    const json = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    recordBasetenUsage(config, reservation.callIndex, json?.usage);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, reason: 'baseten_schema_invalid', callIndex: reservation.callIndex };
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      return { ok: false, reason: 'baseten_schema_invalid', callIndex: reservation.callIndex };
    }
    const out = validateCandidateReasoningOutput(parsed, input);
    if (!out.valid) return { ok: false, reason: `baseten_${out.reason}`, callIndex: reservation.callIndex };
    return { ok: true, result: out.data, latencyMs: Date.now() - start, callIndex: reservation.callIndex };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'baseten_timeout' : 'baseten_error', callIndex: reservation.callIndex };
  } finally {
    clearTimeout(timer);
  }
}
