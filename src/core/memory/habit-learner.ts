/**
 * HABIT-LEARN (owner steering 2026-11-04 13:25 JST): learn-and-correct memory.
 *
 * Yori learns a lunch habit from what the user does in the app (Accept a lunch pick, Directions,
 * Save on a restaurant) and applies it without asking. The user can always see what was learned
 * and forget it. Pure and deterministic: no clock reads, no network, no model calls.
 *
 * Rules
 * - One CHOICE per (planId, place): Accept + Directions + Save on the same place for the same plan
 *   count once.
 * - A cuisine chosen in >= LEARN_MIN_CHOICES choices within the last LEARN_WINDOW_DAYS days, and
 *   strictly more often than any other cuisine, becomes the learned fact.
 * - A forgotten cuisine is tombstoned for TOMBSTONE_DAYS days: its old choices are removed and new
 *   choices do not re-learn it until the tombstone expires. Something the user tells Yori
 *   explicitly lifts the tombstone (see liftTombstone).
 */

import { createMemoryFact, type MemoryFact } from '../contracts/memory.js';

export const LEARN_MIN_CHOICES = 2;
export const LEARN_WINDOW_DAYS = 14;
export const TOMBSTONE_DAYS = 30;
export const LEARNED_LUNCH_CUISINE_KEY = 'learned_lunch_cuisine';
const DAY_MS = 24 * 60 * 60 * 1000;

export type HabitAction = 'accept' | 'directions' | 'save';

export interface HabitObservation {
  readonly kind: 'lunch_choice';
  readonly cuisine: string; // normalised label (see normalizeCuisine)
  readonly placeId?: string;
  readonly planId?: string;
  readonly action: HabitAction;
  readonly at: string; // ISO-8601
  /** Demo seed only: a clearly labelled sample history. */
  readonly demo?: boolean;
}

export interface HabitTombstone {
  readonly cuisine: string;
  readonly until: string; // ISO-8601
}

export interface LearnedCuisineValue {
  readonly cuisine: string;
  readonly count: number;
  readonly total: number;
  readonly lastSeen: string;
  readonly demo?: boolean;
}

/** "ramen;japanese" -> "ramen", "Fast_Food" -> "fast food"; '' when there is nothing to learn. */
export function normalizeCuisine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const first = (raw.split(';')[0] ?? '').replace(/_/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
  return first.length > 0 && first.length <= 40 ? first : '';
}

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Tombstones still in force at nowIso. */
export function activeTombstones(tombstones: readonly HabitTombstone[], nowIso: string): Set<string> {
  const now = ms(nowIso);
  return new Set(tombstones.filter(t => ms(t.until) > now).map(t => t.cuisine));
}

/**
 * Collapses raw observations into choices: one per (planId, place), keeping the latest time.
 * Observations without a planId (e.g. a Save from a detail view) key on place + calendar minute
 * of the first action, so a repeated tap does not inflate the count.
 */
export function toChoices(observations: readonly HabitObservation[]): { cuisine: string; at: string; demo?: boolean }[] {
  const byKey = new Map<string, { cuisine: string; at: string; demo?: boolean }>();
  for (const o of observations) {
    if (o.kind !== 'lunch_choice' || !o.cuisine || !Number.isFinite(ms(o.at))) continue;
    const place = o.placeId || `cuisine:${o.cuisine}`;
    const key = o.planId ? `${o.planId}|${place}` : `noplan|${place}|${o.at.slice(0, 16)}`;
    const prev = byKey.get(key);
    if (!prev || ms(o.at) > ms(prev.at)) byKey.set(key, { cuisine: o.cuisine, at: o.at, ...(o.demo ? { demo: true } : {}) });
  }
  return [...byKey.values()];
}

/** The learned lunch cuisine, or null when the evidence is not strong enough yet. */
export function learnLunchCuisine(
  observations: readonly HabitObservation[],
  tombstones: readonly HabitTombstone[],
  nowIso: string
): LearnedCuisineValue | null {
  const now = ms(nowIso);
  if (!Number.isFinite(now)) return null;
  const blocked = activeTombstones(tombstones, nowIso);
  const recent = toChoices(observations).filter(c => {
    const t = ms(c.at);
    return t <= now && now - t <= LEARN_WINDOW_DAYS * DAY_MS;
  });
  const counted = recent.filter(c => !blocked.has(c.cuisine));
  const counts = new Map<string, { count: number; lastSeen: string; demo: boolean }>();
  for (const c of counted) {
    const prev = counts.get(c.cuisine);
    counts.set(c.cuisine, {
      count: (prev?.count ?? 0) + 1,
      lastSeen: !prev || ms(c.at) > ms(prev.lastSeen) ? c.at : prev.lastSeen,
      demo: (prev?.demo ?? true) && Boolean(c.demo),
    });
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const top = ranked[0];
  if (!top || top[1].count < LEARN_MIN_CHOICES) return null;
  if (ranked[1] && ranked[1][1].count >= top[1].count) return null; // a tie teaches nothing
  return {
    cuisine: top[0],
    count: top[1].count,
    total: recent.length,
    lastSeen: top[1].lastSeen,
    ...(top[1].demo ? { demo: true } : {}),
  };
}

/** The learned habit as a MemoryFact (status 'learned', provenance source 'observed'). */
export function toLearnedFact(value: LearnedCuisineValue): MemoryFact<LearnedCuisineValue> {
  return createMemoryFact(
    LEARNED_LUNCH_CUISINE_KEY,
    value,
    'learned',
    {
      source: 'observed',
      recordedAt: value.lastSeen,
      note: value.demo ? 'Demo profile · sample choices' : `Picked ${value.count} of your last ${value.total} lunches`,
    },
    value.lastSeen
  );
}

/** "You often pick ramen · 3 of your last 4 lunches". */
export function describeLearnedCuisine(value: LearnedCuisineValue): string {
  const lunches = value.total === 1 ? 'lunch' : 'lunches';
  return `You often pick ${value.cuisine} · ${value.count} of your last ${value.total} ${lunches}`;
}

/**
 * Forget a learned cuisine: drop its observations and tombstone it for TOMBSTONE_DAYS, so the same
 * old choices cannot re-learn it.
 */
export function forgetCuisine(
  observations: readonly HabitObservation[],
  tombstones: readonly HabitTombstone[],
  cuisine: string,
  nowIso: string
): { observations: HabitObservation[]; tombstones: HabitTombstone[] } {
  const c = normalizeCuisine(cuisine);
  const until = new Date(ms(nowIso) + TOMBSTONE_DAYS * DAY_MS).toISOString();
  return {
    observations: observations.filter(o => o.cuisine !== c),
    tombstones: [...tombstones.filter(t => t.cuisine !== c), { cuisine: c, until }],
  };
}

/** A newer explicit statement ("I like ramen") overrides the tombstone for that cuisine. */
export function liftTombstone(tombstones: readonly HabitTombstone[], cuisine: string): HabitTombstone[] {
  const c = normalizeCuisine(cuisine);
  return tombstones.filter(t => t.cuisine !== c);
}

/** Undo of an Accept: the choice it recorded is taken back. */
export function undoAccept(observations: readonly HabitObservation[], planId: string): HabitObservation[] {
  return observations.filter(o => !(o.action === 'accept' && o.planId === planId));
}
