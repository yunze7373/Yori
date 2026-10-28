/**
 * Negative Tests & Integration Verification for V2a-1
 * Governed by LIVING_CONTEXT_V2.md §2.3, §3, §8 D3/D4/D5, §9 R2/R3/R4 and Rev4 Condition C5.
 *
 * Verifies:
 * (a) After a this-time-only command, storage has no new or changed confirmed facts,
 *     and Why shows user_request provenance.
 * (b) A leave-later that arrives late yields needs-confirmation (never a silent late plan).
 * (c) Unsupported input gets an honest capability answer with home unchanged.
 * (d) A pinned conversation never auto-collapses.
 * (e) Undo restores the exact prior plan.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultActionStateStore } from '../../src/ui/action-state/store.js';
import { YoriStorage, InMemoryStorageDriver } from '../../src/core/storage/index.js';
import { LocalMemoryAdapter } from '../../src/adapters/xmemo/index.js';
import { DepartPreparer } from '../../src/plugins/depart/preparer.js';
import { renderWhySheet } from '../../src/ui/review/why-sheet.js';
import {
  d2Scenario,
  d2MemoryFacts,
} from '../../tests/fixtures/index.js';
import {
  createFixedClock,
  replayScenarioTimeline,
} from '../../src/app/scenario-player/index.js';
import type { IntentCandidate, PreparedPlan } from '../../src/core/contracts/index.js';
import '../../src/plugins/registry.js';

describe('V2a-1 Negative Tests & Integration Suite', () => {
  let store: DefaultActionStateStore;
  let storage: YoriStorage;
  let memoryPort: LocalMemoryAdapter;
  let preparer: DepartPreparer;
  let basePlan: PreparedPlan;

  const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
  const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
  const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;

  const departCandidate: IntentCandidate = {
    intent: 'depart',
    confidence: 1.0,
    evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
  };

  beforeEach(async () => {
    store = new DefaultActionStateStore();
    storage = new YoriStorage(new InMemoryStorageDriver());
    memoryPort = new LocalMemoryAdapter(storage);
    preparer = new DepartPreparer();

    // Seed storage with d2 confirmed facts
    for (const fact of d2MemoryFacts) {
      if (fact.status === 'confirmed') {
        await memoryPort.writeBack(fact);
      }
    }

    // Prepare initial base plan
    const facts = await memoryPort.loadFacts();
    const prepared = preparer.prepare(departCandidate, d2Snapshot, facts);
    expect(prepared).not.toBeNull();
    basePlan = prepared!;

    // Set command context on store
    store.setCommandContext({
      plan: basePlan,
      snapshot: d2Snapshot,
      memory: facts,
      candidate: departCandidate,
      sceneId: 'rain',
    });
  });

  it('(a) After a this-time-only command, storage has no new or changed confirmed facts, and Why shows user_request provenance', async () => {
    const factsBefore = await memoryPort.loadFacts();
    const serializedFactsBefore = JSON.stringify(factsBefore);

    // Open conversation and execute "Take the bus" (this-time-only change)
    store.openConversation();
    const result = store.submitMessage('Take the bus');

    expect(result.rule).toBe('executable_determinate');
    expect(result.plan).toBeDefined();

    // Verify storage has NOT mutated
    const factsAfter = await memoryPort.loadFacts();
    expect(JSON.stringify(factsAfter)).toBe(serializedFactsBefore);
    expect(factsAfter.length).toBe(factsBefore.length);

    // Verify Why explanation carries user_request provenance
    const updatedPlan = result.plan!;
    expect(updatedPlan.why.derivation).toContain('Because you asked: switch to bus · this time only');
    const userReqSignal = updatedPlan.why.evidenceSignals.find(s => s.kind === 'user_request');
    expect(userReqSignal).toBeDefined();
    expect(userReqSignal!.kind).toBe('user_request');
    expect(userReqSignal!.source).toBe('simulated');
    expect(userReqSignal!.description).toContain('this time only');
  });

  it('(b) A leave-later that arrives late yields needs-confirmation and stays open', () => {
    store.openConversation();
    expect(store.getSnapshot().interactionState).toBe('CONVERSATION');

    // Shift by +15 min: drive arrives at 3:10 PM (late by 10m for 3:00 PM appointment)
    const result = store.submitMessage('Can I leave 15 minutes later?');

    expect(result.rule).toBe('needs_confirmation');
    expect(result.collapsed).toBe(false);
    expect(store.getSnapshot().interactionState).toBe('CONVERSATION');

    // Action state is needs-confirmation
    const state = store.getActionState();
    expect(state.status).toBe('needs-confirmation');

    // Conversation has confirmation notice with buttons
    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1];
    expect(lastMsg).toBeDefined();
    expect(lastMsg!.needsConfirmation).toBe(true);
    expect(lastMsg!.pendingPlan).toBeDefined();
    expect(lastMsg!.text).toContain('arrive late');

    // Confirm the late departure for this time only
    store.confirmPending('Confirmed late departure plan for this time only.');
    expect(store.getActionState().status).toBe('updated');
    expect(store.getActionState().plan?.headline).toContain('2:45 PM');
  });

  it('(c) Unsupported input gets an honest capability answer with home unchanged', () => {
    const originalPlan = store.getActionState().plan;
    store.openConversation();

    // 1. Completely unknown query
    const unknownRes = store.submitMessage('Can you book me a flight to Tokyo?');
    expect(unknownRes.rule).toBe('unsupported_ask');
    expect(unknownRes.collapsed).toBe(false);
    expect(store.getSnapshot().interactionState).toBe('CONVERSATION');
    expect(store.getActionState().status).toBe('degraded');
    expect(unknownRes.response).toContain("I can help adjust your departure plan");
    // Home plan is untouched
    expect(store.getActionState().plan).toEqual(originalPlan);

    // 2. Unsupported lunch filter query (honest capability answer)
    const lunchRes = store.submitMessage('Find cheap lunch');
    expect(lunchRes.rule).toBe('unsupported_ask');
    expect(lunchRes.response).toContain('The filter "cheap" is not supported in this offline demo');
    expect(store.getActionState().plan).toEqual(originalPlan);

    // 3. Future V5-FUEL capability query (honest deferred answer)
    const fuelRes = store.submitMessage('Find gas along the way');
    expect(fuelRes.rule).toBe('unsupported_ask');
    expect(fuelRes.response).toContain('Finding fuel or charging stops arrives in V5-FUEL');
    expect(store.getActionState().plan).toEqual(originalPlan);
  });

  it('(d) A pinned conversation never auto-collapses on executable action', () => {
    store.openConversation();
    store.setPinned(true);
    expect(store.isPinned()).toBe(true);

    // Submit an on-time route change
    const result = store.submitMessage('Take the bus');
    expect(result.rule).toBe('executable_determinate');
    expect(result.collapsed).toBe(false);
    expect(store.getSnapshot().interactionState).toBe('CONVERSATION');

    // Unpin and submit another executable action
    store.setPinned(false);
    expect(store.isPinned()).toBe(false);
    const unpinnedResult = store.submitMessage('Drive instead');
    expect(unpinnedResult.rule).toBe('executable_determinate');
    expect(unpinnedResult.collapsed).toBe(true);
    expect(store.getSnapshot().interactionState).toBe('HOME');
  });

  it('(e) Undo restores the exact prior plan and clears session override', () => {
    const priorHeadline = basePlan.headline;
    store.openConversation();

    // Shift route
    store.submitMessage('Take the bus');
    expect(store.getCurrentOverride()?.mode).toBe('bus');
    expect(store.canUndo()).toBe(true);

    // Undo
    const undone = store.undo();
    expect(undone).not.toBeNull();
    expect(store.getCurrentOverride()).toBeNull();
    expect(store.getActionState().plan?.headline).toBe(priorHeadline);
  });

  it('(f) C1 Invariant: After Dismiss (suppression stored), LEAVE_LATER and CHANGE_ROUTE do NOT resurrect plan', () => {
    // When plan is dismissed, pipeline produces null now plan, and no candidate is admitted
    store.setCommandContext({
      plan: null,
      candidate: undefined,
      snapshot: d2Snapshot,
      memory: [],
      sceneId: 'rain',
    });
    store.openConversation();

    // Attempting to shift departure
    const resLater = store.submitMessage('Leave 3 minutes later');
    expect(resLater.rule).toBe('degraded_failure');
    expect(resLater.response).toContain("There's no departure plan to adjust right now.");
    expect(resLater.plan).toBeUndefined();
    expect(store.getActionState().plan).toBeUndefined();

    // Attempting to change route
    const resBus = store.submitMessage('Take the bus');
    expect(resBus.rule).toBe('degraded_failure');
    expect(resBus.response).toContain("There's no departure plan to adjust right now.");
    expect(resBus.plan).toBeUndefined();
    expect(store.getActionState().plan).toBeUndefined();
  });

  it('(g) C1 Invariant: In lunch / quiet / busy scenes, depart plans are NEVER synthesized', () => {
    store.setCommandContext({
      plan: null,
      candidate: undefined,
      snapshot: d2Snapshot,
      memory: [],
      sceneId: 'busy-lunch',
    });
    store.openConversation();

    const res = store.submitMessage('Can I leave 15 minutes later?');
    expect(res.rule).toBe('degraded_failure');
    expect(res.response).toContain("There's no departure plan to adjust right now.");
    expect(store.getActionState().plan).toBeUndefined();
  });

  it('(h) LEAVE_LATER comparison: unconstrained query derives latest on-time and late-risk options from arrival margin', () => {
    store.openConversation();

    // In D2 rain, appt is 3:00 PM, drive travel time 25m, leave 2:30 PM arrives 2:55 PM (margin = 5 min)
    const result = store.submitMessage('Can I leave later?');
    expect(result.rule).toBe('needs_confirmation');
    expect(result.collapsed).toBe(false);

    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1];
    expect(lastMsg).toBeDefined();
    expect(lastMsg!.comparisonOptions).toBeDefined();
    expect(lastMsg!.comparisonOptions!.length).toBe(2);

    const safeOpt = lastMsg!.comparisonOptions![0];
    const lateOpt = lastMsg!.comparisonOptions![1];
    expect(safeOpt).toBeDefined();
    expect(lateOpt).toBeDefined();

    // Safe option: delta = 5 min (leave 2:35 PM, arrive 3:00 PM, margin = 0 min)
    expect(safeOpt!.deltaMinutes).toBe(5);
    expect(safeOpt!.isLateRisk).toBe(false);
    expect(safeOpt!.marginMinutes).toBe(0);
    expect(safeOpt!.leaveTime).toContain('2:35 PM');
    expect(safeOpt!.arrivalTime).toContain('3:00 PM');

    // Late option: delta = 15 min (leave 2:45 PM, arrive 3:10 PM, late by 10m)
    expect(lateOpt!.deltaMinutes).toBe(15);
    expect(lateOpt!.isLateRisk).toBe(true);
    expect(lateOpt!.marginMinutes).toBe(-10);
    expect(lateOpt!.leaveTime).toContain('2:45 PM');
    expect(lateOpt!.arrivalTime).toContain('3:10 PM');

    // Assistant response presents the honest comparison
    expect(lastMsg!.text).toContain('You can leave up to 5 minutes later');
    expect(lastMsg!.text).toContain('arrive on time (0m buffer)');
    expect(lastMsg!.text).toContain('Leaving 15 minutes later');
    expect(lastMsg!.text).toContain('(10m late)');

    // Selecting the safe option resolves executable and auto-collapses
    const chooseResult = store.submitMessage('Leave 5 minutes later');
    expect(chooseResult.rule).toBe('executable_determinate');
    expect(chooseResult.collapsed).toBe(true);
    expect(store.getSnapshot().interactionState).toBe('HOME');
    expect(store.getActionState().plan?.headline).toContain('2:35 PM');
  });

  it('(i) C2: Why sheet renders user_request distinctly without SIMULATED badge', () => {
    store.openConversation();
    const result = store.submitMessage('Leave 3 minutes later');
    expect(result.plan).toBeDefined();

    const html = renderWhySheet(result.plan!);
    expect(html).toContain('Your request · this time only');
    expect(html).toContain('THIS SESSION');
    expect(html).toContain('badge-user-request');

    // Ensure the user request row does NOT carry the SIMULATED badge
    const userReqRowMatch = html.match(/<div class="why-item-row why-item-user-request">[\s\S]*?<\/div>/);
    expect(userReqRowMatch).not.toBeNull();
    expect(userReqRowMatch![0]).not.toContain('SIMULATED');
    expect(userReqRowMatch![0]).not.toContain('badge-simulated');
  });
});
