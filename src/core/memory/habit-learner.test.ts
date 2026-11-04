import { describe, it, expect } from 'vitest';
import {
  learnLunchCuisine,
  toLearnedFact,
  describeLearnedCuisine,
  forgetCuisine,
  liftTombstone,
  undoAccept,
  normalizeCuisine,
  LEARNED_LUNCH_CUISINE_KEY,
  type HabitObservation,
} from './habit-learner.js';

const NOW = '2026-11-04T12:00:00.000Z';
const daysAgo = (d: number, h = 0) => new Date(Date.parse(NOW) - d * 86400000 - h * 3600000).toISOString();
const obs = (cuisine: string, at: string, extra: Partial<HabitObservation> = {}): HabitObservation => ({
  kind: 'lunch_choice',
  cuisine,
  action: 'accept',
  planId: `plan-${at}`,
  placeId: `place-${cuisine}`,
  at,
  ...extra,
});

describe('HABIT-LEARN: deterministic lunch-habit learner', () => {
  it('does not learn from one choice', () => {
    expect(learnLunchCuisine([obs('ramen', daysAgo(0))], [], NOW)).toBeNull();
  });

  it('learns a cuisine chosen twice, with count/total/lastSeen', () => {
    const v = learnLunchCuisine([obs('ramen', daysAgo(2)), obs('ramen', daysAgo(0, 1))], [], NOW);
    expect(v).toEqual({ cuisine: 'ramen', count: 2, total: 2, lastSeen: daysAgo(0, 1) });
  });

  it('needs strictly more than any other cuisine (a tie teaches nothing)', () => {
    const tie = [obs('ramen', daysAgo(1)), obs('ramen', daysAgo(2)), obs('soba', daysAgo(3)), obs('soba', daysAgo(4))];
    expect(learnLunchCuisine(tie, [], NOW)).toBeNull();
    const v = learnLunchCuisine([...tie, obs('ramen', daysAgo(5))], [], NOW);
    expect(v?.cuisine).toBe('ramen');
    expect(v?.count).toBe(3);
    expect(v?.total).toBe(5);
  });

  it('only counts the last 14 days', () => {
    expect(learnLunchCuisine([obs('ramen', daysAgo(1)), obs('ramen', daysAgo(15))], [], NOW)).toBeNull();
    expect(learnLunchCuisine([obs('ramen', daysAgo(1)), obs('ramen', daysAgo(13))], [], NOW)?.cuisine).toBe('ramen');
  });

  it('ignores future-dated observations', () => {
    expect(learnLunchCuisine([obs('ramen', daysAgo(1)), obs('ramen', daysAgo(-1))], [], NOW)).toBeNull();
  });

  it('Accept + Directions + Save on the same place for the same plan count as one choice', () => {
    const at = daysAgo(0, 2);
    const same = [
      obs('ramen', at, { planId: 'p1', action: 'accept' }),
      obs('ramen', at, { planId: 'p1', action: 'directions' }),
      obs('ramen', at, { planId: 'p1', action: 'save' }),
    ];
    expect(learnLunchCuisine(same, [], NOW)).toBeNull();
    expect(learnLunchCuisine([...same, obs('ramen', daysAgo(0, 1), { planId: 'p2' })], [], NOW)?.count).toBe(2);
  });

  it('a repeated Save without a plan in the same minute counts once', () => {
    const at = daysAgo(0, 1);
    const saves = [obs('ramen', at, { planId: undefined, action: 'save' }), obs('ramen', at, { planId: undefined, action: 'save' })];
    expect(learnLunchCuisine(saves, [], NOW)).toBeNull();
  });

  it('the learned fact is status learned, source observed, and applies without a proposal', () => {
    const v = learnLunchCuisine([obs('ramen', daysAgo(2)), obs('ramen', daysAgo(1))], [], NOW)!;
    const f = toLearnedFact(v);
    expect(f.key).toBe(LEARNED_LUNCH_CUISINE_KEY);
    expect(f.status).toBe('learned');
    expect(f.provenance.source).toBe('observed');
    expect(f.value).toEqual(v);
  });

  it('explains itself in plain words', () => {
    expect(describeLearnedCuisine({ cuisine: 'ramen', count: 3, total: 4, lastSeen: NOW })).toBe(
      'You often pick ramen · 3 of your last 4 lunches'
    );
    expect(describeLearnedCuisine({ cuisine: 'ramen', count: 2, total: 2, lastSeen: NOW })).toBe(
      'You often pick ramen · 2 of your last 2 lunches'
    );
  });

  it('Forget removes the observations and tombstones the cuisine for 30 days', () => {
    const history = [obs('ramen', daysAgo(2)), obs('ramen', daysAgo(1)), obs('soba', daysAgo(1, 2))];
    const after = forgetCuisine(history, [], 'Ramen', NOW);
    expect(after.observations.map(o => o.cuisine)).toEqual(['soba']);
    expect(after.tombstones).toEqual([{ cuisine: 'ramen', until: new Date(Date.parse(NOW) + 30 * 86400000).toISOString() }]);
    // New ramen choices inside the 30 days do not re-learn it.
    const later = '2026-11-10T12:00:00.000Z';
    const again = [...after.observations, obs('ramen', '2026-11-09T12:00:00.000Z'), obs('ramen', '2026-11-10T11:00:00.000Z')];
    expect(learnLunchCuisine(again, after.tombstones, later)).toBeNull();
    // After the tombstone expires, the habit can be learned again.
    const muchLater = '2026-12-05T12:00:00.000Z';
    const fresh = [obs('ramen', '2026-12-04T12:00:00.000Z'), obs('ramen', '2026-12-05T11:00:00.000Z')];
    expect(learnLunchCuisine(fresh, after.tombstones, muchLater)?.cuisine).toBe('ramen');
  });

  it('an explicit statement lifts the tombstone', () => {
    const t = forgetCuisine([], [], 'ramen', NOW).tombstones;
    const lifted = liftTombstone(t, 'Ramen');
    expect(lifted).toEqual([]);
    expect(learnLunchCuisine([obs('ramen', daysAgo(0, 2)), obs('ramen', daysAgo(0, 1))], lifted, NOW)?.cuisine).toBe('ramen');
  });

  it('Undo of an Accept takes the choice back', () => {
    const h = [obs('ramen', daysAgo(1), { planId: 'a' }), obs('ramen', daysAgo(0), { planId: 'b' })];
    expect(learnLunchCuisine(h, [], NOW)?.cuisine).toBe('ramen');
    expect(learnLunchCuisine(undoAccept(h, 'b'), [], NOW)).toBeNull();
  });

  it('normalises OSM cuisine tags', () => {
    expect(normalizeCuisine('Ramen;Japanese')).toBe('ramen');
    expect(normalizeCuisine('fast_food')).toBe('fast food');
    expect(normalizeCuisine('')).toBe('');
    expect(normalizeCuisine(undefined)).toBe('');
    expect(normalizeCuisine('x'.repeat(41))).toBe('');
  });

  it('demo-labelled history yields a demo-labelled habit', () => {
    const v = learnLunchCuisine([obs('ramen', daysAgo(2), { demo: true }), obs('ramen', daysAgo(1), { demo: true })], [], NOW)!;
    expect(v.demo).toBe(true);
    expect(toLearnedFact(v).provenance.note).toBe('Demo profile · sample choices');
  });
});

describe('HABIT-LEARN addendum: sensitive characteristics are never learned from choices', () => {
  it.each(['vegetarian', 'vegan', 'Halal', 'kosher', 'gluten_free', 'gluten-free', 'allergy_friendly', 'diabetic', 'low_salt', 'organic;vegan'])(
    'repeated choices of %s places create no learned fact and are not even recorded',
    label => {
      expect(normalizeCuisine(label)).toBe('');
      const many = [obs(normalizeCuisine(label) || label.toLowerCase(), daysAgo(1)), obs(normalizeCuisine(label) || label.toLowerCase(), daysAgo(2)), obs(normalizeCuisine(label) || label.toLowerCase(), daysAgo(3))];
      expect(learnLunchCuisine(many, [], NOW)).toBeNull();
    }
  );

  it('a plain cuisine on the same places is still learned', () => {
    expect(learnLunchCuisine([obs('ramen', daysAgo(1)), obs('ramen', daysAgo(2))], [], NOW)?.cuisine).toBe('ramen');
  });
});
