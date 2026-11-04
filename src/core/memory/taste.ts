/**
 * HABIT-LEARN: taste signals from memory, shared by every ranking path (Live list, lunch preparer)
 * so the card, the Why sheet and Ask all give the same basis.
 *
 * Precedence: what the user told Yori (user-stated, or a legacy user-confirmed taste) outranks a
 * habit Yori learned from their choices; a learned habit outranks open-now / distance.
 */

import { isActiveMemoryFact, type MemoryFact } from '../contracts/memory.js';
import { describeLearnedCuisine, LEARNED_LUNCH_CUISINE_KEY, type LearnedCuisineValue } from './habit-learner.js';

export type TasteSource = 'user_stated' | 'confirmed' | 'learned';

export interface TasteSignal {
  readonly keyword: string;
  readonly source: TasteSource;
  readonly factKey: string;
  readonly weight: number; // 2 = told / confirmed, 1 = learned
  readonly basis: string;
  readonly demo?: boolean;
}

const TASTE_KEY = /taste|cuisine|food/i;

export function isTasteFactKey(key: string): boolean {
  return key === LEARNED_LUNCH_CUISINE_KEY || TASTE_KEY.test(key);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s,_\/;]+|\bor\b/)
    .map(t => t.trim())
    .filter(t => t.length > 1);
}

export function isLearnedCuisineValue(v: unknown): v is LearnedCuisineValue {
  const o = v as LearnedCuisineValue;
  return Boolean(o && typeof o === 'object' && typeof o.cuisine === 'string' && typeof o.count === 'number' && typeof o.total === 'number');
}

/** Taste signals from the facts that shape recommendations (stated / confirmed / learned). */
export function tasteSignals(facts: readonly Pick<MemoryFact, 'key' | 'value' | 'status' | 'provenance'>[]): TasteSignal[] {
  const out: TasteSignal[] = [];
  for (const f of facts) {
    if (!isActiveMemoryFact(f) || !isTasteFactKey(f.key)) continue;
    if (f.key === LEARNED_LUNCH_CUISINE_KEY) {
      if (f.status !== 'learned' || !isLearnedCuisineValue(f.value)) continue;
      out.push({
        keyword: f.value.cuisine,
        source: 'learned',
        factKey: f.key,
        weight: 1,
        basis: describeLearnedCuisine(f.value),
        ...(f.value.demo ? { demo: true } : {}),
      });
      continue;
    }
    if (typeof f.value !== 'string') continue;
    const stated = f.provenance?.source === 'user_stated';
    for (const keyword of tokens(f.value)) {
      out.push({
        keyword,
        source: stated ? 'user_stated' : 'confirmed',
        factKey: f.key,
        weight: 2,
        basis: stated ? `You told Yori you like ${keyword}` : `Matches your confirmed taste for ${keyword}`,
      });
    }
  }
  return out;
}

/** The strongest signal a place matches (by cuisine label or name), or null. */
export function bestTasteMatch(
  signals: readonly TasteSignal[],
  place: { cuisine?: string; name?: string }
): TasteSignal | null {
  const cuisine = (place.cuisine || '').toLowerCase();
  const name = (place.name || '').toLowerCase();
  let best: TasteSignal | null = null;
  for (const s of signals) {
    if (!(cuisine.includes(s.keyword) || name.includes(s.keyword))) continue;
    if (!best || s.weight > best.weight) best = s;
  }
  return best;
}
