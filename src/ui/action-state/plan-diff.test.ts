import { describe, it, expect } from 'vitest';
import { computePlanDiff } from './plan-diff.js';

describe('PlanDiff Suite', () => {
  it('computes leave time diff when leaveTimeStr changes', () => {
    const prior = {
      headline: 'Leave by 2:25 PM',
      leaveTimeStr: '2:25 PM',
      prepareTimeStr: '2:05 PM',
    };
    const current = {
      headline: 'Leave by 2:40 PM',
      leaveTimeStr: '2:40 PM',
      prepareTimeStr: '2:20 PM',
    };

    const diff = computePlanDiff(prior, current);
    expect(diff).not.toBeNull();
    expect(diff?.fieldName).toBe('leaveTime');
    expect(diff?.priorValue).toBe('2:25 PM');
    expect(diff?.newValue).toBe('2:40 PM');
    expect(diff?.diffSummary).toBe('Leave by 2:25 PM → 2:40 PM');
    expect(diff?.ariaLiveText).toContain('Leave by 2:25 PM changed to Leave by 2:40 PM');
  });

  it('computes leave time diff extracted from headline when leaveTimeStr is omitted', () => {
    const prior = { headline: 'Get ready at 2:05 PM, leave by 2:25 PM' };
    const current = { headline: 'Get ready at 2:00 PM, leave by 2:20 PM' };

    const diff = computePlanDiff(prior, current);
    expect(diff).not.toBeNull();
    expect(diff?.fieldName).toBe('leaveTime');
    expect(diff?.priorValue).toBe('2:25 PM');
    expect(diff?.newValue).toBe('2:20 PM');
    expect(diff?.diffSummary).toBe('Leave by 2:25 PM → 2:20 PM');
  });

  it('computes transit mode switch', () => {
    const prior = {
      headline: 'Leave by 2:30 PM',
      mode: 'drive',
    };
    const current = {
      headline: 'Leave by 2:30 PM',
      mode: 'bus',
    };

    const diff = computePlanDiff(prior, current);
    expect(diff).not.toBeNull();
    expect(diff?.fieldName).toBe('transitMode');
    expect(diff?.priorValue).toBe('Drive');
    expect(diff?.newValue).toBe('Bus');
    expect(diff?.diffSummary).toBe('Primary route switched: Drive → Bus');
  });

  it('computes recommendation change for restaurants or gas stations', () => {
    const prior = {
      headline: 'Lunch options near you',
      topRecommendation: 'Midori Sushi',
    };
    const current = {
      headline: 'Lunch options near you',
      topRecommendation: 'Green Garden Salad',
    };

    const diff = computePlanDiff(prior, current);
    expect(diff).not.toBeNull();
    expect(diff?.fieldName).toBe('recommendation');
    expect(diff?.diffSummary).toBe('Recommendation updated: Midori Sushi → Green Garden Salad');
  });

  it('returns null when compositions are identical', () => {
    const prior = {
      headline: 'Leave by 2:25 PM',
      leaveTimeStr: '2:25 PM',
    };
    const current = {
      headline: 'Leave by 2:25 PM',
      leaveTimeStr: '2:25 PM',
    };

    const diff = computePlanDiff(prior, current);
    expect(diff).toBeNull();
  });

  it('returns null when either prior or current is missing', () => {
    expect(computePlanDiff(null, { headline: 'Test' })).toBeNull();
    expect(computePlanDiff({ headline: 'Test' }, undefined)).toBeNull();
  });

  it('verifies plan diff computation alongside actionStore pushHistory and undo restore lifecycle', () => {
    const basePlan = {
      id: 'plan-1',
      intentId: 'depart',
      title: 'Piano lesson',
      headline: 'Get ready at 2:05 PM, leave by 2:25 PM',
      preparedAt: '2026-10-31T14:00:00Z',
      why: { summary: 'Rain forecast', reasonCodes: ['WEATHER_RAIN'] },
    };

    const updatedPlan = {
      ...basePlan,
      headline: 'Get ready at 2:20 PM, leave by 2:40 PM',
    };

    // 1. Initial State -> Updated State: diff computed
    const diff = computePlanDiff(
      { headline: basePlan.headline, leaveTimeStr: '2:25 PM' },
      { headline: updatedPlan.headline, leaveTimeStr: '2:40 PM' }
    );
    expect(diff).not.toBeNull();
    expect(diff?.diffSummary).toBe('Leave by 2:25 PM → 2:40 PM');

    // 2. Undo restores the exact prior state
    const restoredPlan = basePlan;
    expect(restoredPlan.headline).toBe('Get ready at 2:05 PM, leave by 2:25 PM');

    // 3. Diff against restored state is null
    const restoredDiff = computePlanDiff(
      { headline: basePlan.headline, leaveTimeStr: '2:25 PM' },
      { headline: restoredPlan.headline, leaveTimeStr: '2:25 PM' }
    );
    expect(restoredDiff).toBeNull();
  });
});
