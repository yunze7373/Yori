import { describe, it, expect } from 'vitest';
import { InMemoryStorageDriver } from '../storage/index.js';
import { HabitJournal, HABIT_JOURNAL_KEY } from './habit-journal.js';

describe('HABIT-LEARN: the local habit journal', () => {
  it('records only in-app choices: cuisine label, place id, plan id, time (no coordinates)', () => {
    const driver = new InMemoryStorageDriver();
    const j = new HabitJournal(driver);
    expect(j.record({ cuisine: 'Ramen;Japanese', placeId: 'g-1', planId: 'p-1', action: 'accept', at: '2026-11-04T03:00:00.000Z' })).toBe(true);
    const raw = driver.getItem(HABIT_JOURNAL_KEY)!;
    expect(JSON.parse(raw).observations).toEqual([
      { kind: 'lunch_choice', cuisine: 'ramen', action: 'accept', at: '2026-11-04T03:00:00.000Z', placeId: 'g-1', planId: 'p-1' },
    ]);
    expect(raw).not.toMatch(/lat|lng|coords/);
  });

  it('refuses a choice without a usable cuisine or time', () => {
    const j = new HabitJournal(new InMemoryStorageDriver());
    expect(j.record({ cuisine: '', action: 'save', at: '2026-11-04T03:00:00.000Z' })).toBe(false);
    expect(j.record({ cuisine: 'ramen', action: 'save', at: 'not a date' })).toBe(false);
    expect(j.load().observations).toEqual([]);
  });

  it('a corrupt or tampered journal reads as empty and drops malformed entries', () => {
    const driver = new InMemoryStorageDriver();
    driver.setItem(HABIT_JOURNAL_KEY, '{not json');
    expect(new HabitJournal(driver).load()).toEqual({ observations: [], tombstones: [] });
    driver.setItem(
      HABIT_JOURNAL_KEY,
      JSON.stringify({
        observations: [
          { kind: 'lunch_choice', cuisine: 'ramen', action: 'accept', at: '2026-11-04T03:00:00.000Z' },
          { kind: 'lunch_choice', cuisine: 'Ramen', action: 'accept', at: '2026-11-04T03:00:00.000Z' },
          { kind: 'visit', cuisine: 'ramen', action: 'accept', at: '2026-11-04T03:00:00.000Z' },
          { kind: 'lunch_choice', cuisine: 'ramen', action: 'track', at: '2026-11-04T03:00:00.000Z' },
        ],
        tombstones: [{ cuisine: 'soba', until: '2026-12-04T03:00:00.000Z' }, { cuisine: 'x', until: 'never' }],
      })
    );
    const state = new HabitJournal(driver).load();
    expect(state.observations).toHaveLength(1);
    expect(state.tombstones).toEqual([{ cuisine: 'soba', until: '2026-12-04T03:00:00.000Z' }]);
  });

  it('keeps at most the newest 200 choices', () => {
    const j = new HabitJournal(new InMemoryStorageDriver());
    for (let i = 0; i < 210; i++) {
      j.record({ cuisine: 'ramen', planId: `p${i}`, action: 'accept', at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() });
    }
    const obs = j.load().observations;
    expect(obs).toHaveLength(200);
    expect(obs[0]!.planId).toBe('p10');
  });
});
