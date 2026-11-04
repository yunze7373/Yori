/**
 * HABIT-LEARN: the local journal of in-app lunch choices and Forget tombstones.
 *
 * Stored on this device only (its own key next to YoriStorage's 'yori_state_v1', so the existing
 * payload writers cannot drop it). Holds only choices made inside Yori (Accept / Directions / Save
 * on a restaurant): cuisine label, place id, plan id, time. No location, no visits, no tracking.
 * Bounded: the newest MAX_OBSERVATIONS choices and MAX_TOMBSTONES tombstones are kept.
 */

import type { StorageDriver } from '../storage/index.js';
import { normalizeCuisine, type HabitObservation, type HabitTombstone, type HabitAction } from './habit-learner.js';

export const HABIT_JOURNAL_KEY = 'yori_habits_v1';
const MAX_OBSERVATIONS = 200;
const MAX_TOMBSTONES = 50;

export interface HabitJournalState {
  readonly observations: readonly HabitObservation[];
  readonly tombstones: readonly HabitTombstone[];
}

const EMPTY: HabitJournalState = Object.freeze({ observations: [], tombstones: [] });

function isObservation(o: any): o is HabitObservation {
  return (
    o &&
    o.kind === 'lunch_choice' &&
    typeof o.cuisine === 'string' &&
    normalizeCuisine(o.cuisine) === o.cuisine &&
    (o.action === 'accept' || o.action === 'directions' || o.action === 'save') &&
    typeof o.at === 'string' &&
    Number.isFinite(Date.parse(o.at)) &&
    (o.placeId === undefined || typeof o.placeId === 'string') &&
    (o.planId === undefined || typeof o.planId === 'string')
  );
}

function isTombstone(t: any): t is HabitTombstone {
  return t && typeof t.cuisine === 'string' && typeof t.until === 'string' && Number.isFinite(Date.parse(t.until));
}

export class HabitJournal {
  constructor(private readonly driver: StorageDriver, private readonly key: string = HABIT_JOURNAL_KEY) {}

  /** Never throws: a corrupt or missing journal reads as empty (it only holds re-learnable choices). */
  public load(): HabitJournalState {
    try {
      const raw = this.driver.getItem(this.key);
      if (!raw) return EMPTY;
      const parsed = JSON.parse(raw);
      return {
        observations: Array.isArray(parsed?.observations) ? parsed.observations.filter(isObservation) : [],
        tombstones: Array.isArray(parsed?.tombstones) ? parsed.tombstones.filter(isTombstone) : [],
      };
    } catch {
      return EMPTY;
    }
  }

  public save(state: HabitJournalState): void {
    const observations = [...state.observations]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-MAX_OBSERVATIONS);
    const tombstones = [...state.tombstones].slice(-MAX_TOMBSTONES);
    this.driver.setItem(this.key, JSON.stringify({ v: 1, observations, tombstones }));
  }

  /** Records one in-app choice. Returns false when there is no usable cuisine label. */
  public record(input: { cuisine: unknown; placeId?: string; planId?: string; action: HabitAction; at: string }): boolean {
    const cuisine = normalizeCuisine(input.cuisine);
    if (!cuisine || !Number.isFinite(Date.parse(input.at))) return false;
    const state = this.load();
    const obs: HabitObservation = {
      kind: 'lunch_choice',
      cuisine,
      action: input.action,
      at: input.at,
      ...(input.placeId ? { placeId: input.placeId.slice(0, 120) } : {}),
      ...(input.planId ? { planId: input.planId.slice(0, 120) } : {}),
    };
    this.save({ observations: [...state.observations, obs], tombstones: state.tombstones });
    return true;
  }

  public clear(): void {
    this.driver.removeItem(this.key);
  }
}
