import { describe, it, expect, vi } from 'vitest';
import { createActionStateStore } from './store.js';
import type { ActionHistorySnapshot, AutoCollapseRule } from './types.js';
import { d2Scenario, d2MemoryFacts, d3Scenario, d3MemoryFacts } from '../../../tests/fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../app/scenario-player/index.js';
import { departPreparer } from '../../plugins/depart/preparer.js';
import { lunchPreparer } from '../../plugins/lunch/preparer.js';
import type { IntentCandidate } from '../../core/contracts/index.js';
import { defaultLocationPort, DEFAULT_DEMO_COORDS } from '../../adapters/providers/location-port.js';

describe('V0: Action-State Store & Interaction State Machine (§2)', () => {
  describe('2.1 Action States & Guarded Transitions Lifecycle', () => {
    it('initializes to idle action state and HOME interaction state', () => {
      const store = createActionStateStore();
      const state = store.getActionState();

      expect(state.status).toBe('idle');
      expect(store.getInteractionState()).toBe('HOME');
      expect(store.isPinned()).toBe(false);
      expect(store.canUndo()).toBe(false);
    });

    it('enforces legal sequence: idle -> beginCommand (PROCESSING) -> resolveExecutable -> settle', () => {
      const store = createActionStateStore();

      // 1. idle -> working / PROCESSING
      expect(store.beginCommand('Leave 15m later', 'Shifting departure')).toBe(true);
      expect(store.getActionState().status).toBe('working');
      expect(store.getActionState().detail).toBe('Shifting departure');
      expect(store.getInteractionState()).toBe('PROCESSING');

      // 2. working -> updated / HOME (auto-collapse)
      expect(store.resolveExecutable('Departure shifted 15m')).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().resultSummary).toBe('Departure shifted 15m');
      expect(store.getInteractionState()).toBe('HOME');

      // 3. updated -> settled
      expect(store.settle()).toBe(true);
      expect(store.getActionState().status).toBe('settled');
    });

    it('handles comparing substate during working', () => {
      const store = createActionStateStore();
      expect(store.beginCommand('Compare routes', 'Comparing transit options', 'comparing')).toBe(true);
      expect(store.getActionState().status).toBe('working');
      expect(store.getActionState().substate).toBe('comparing');
    });

    it('enforces needs-confirmation lifecycle: working -> resolveNeedsConfirmation -> confirmPending -> updated', () => {
      const store = createActionStateStore();
      expect(store.beginCommand('Save rain preference')).toBe(true);

      // working -> needs-confirmation / CONVERSATION
      expect(store.resolveNeedsConfirmation('Confirm buffer 10 min preference?')).toBe(true);
      expect(store.getActionState().status).toBe('needs-confirmation');
      expect(store.getActionState().detail).toBe('Confirm buffer 10 min preference?');
      expect(store.getInteractionState()).toBe('CONVERSATION');

      // confirmPending -> updated / HOME
      expect(store.confirmPending('Preference confirmed')).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getInteractionState()).toBe('HOME');
    });

    it('enforces needs-confirmation rejection: working -> resolveNeedsConfirmation -> rejectPending -> idle', () => {
      const store = createActionStateStore();
      store.beginCommand('Save rain preference');
      store.resolveNeedsConfirmation('Confirm preference?');

      // rejectPending -> idle / CONVERSATION
      expect(store.rejectPending()).toBe(true);
      expect(store.getActionState().status).toBe('idle');
      expect(store.getInteractionState()).toBe('CONVERSATION');
    });

    it('enforces degraded failure path: working -> resolveDegraded -> degraded (stays CONVERSATION)', () => {
      const store = createActionStateStore();
      store.beginCommand('Fetch live schedule');

      expect(store.resolveDegraded('Schedule provider unreachable; current departure preserved')).toBe(true);
      expect(store.getActionState().status).toBe('degraded');
      expect(store.getActionState().notice).toBe('Schedule provider unreachable; current departure preserved');
      expect(store.getInteractionState()).toBe('CONVERSATION');

      // degraded -> settle
      expect(store.settle()).toBe(true);
      expect(store.getActionState().status).toBe('settled');
    });

    it('guards and rejects illegal transitions', () => {
      const store = createActionStateStore();

      // Illegal: resolveExecutable from idle
      expect(store.resolveExecutable('Should fail')).toBe(false);

      // Illegal: confirmPending from idle
      expect(store.confirmPending('Should fail')).toBe(false);

      // Illegal: rejectPending from idle
      expect(store.rejectPending()).toBe(false);

      // Illegal: resolveDegraded from idle
      expect(store.resolveDegraded('Should fail')).toBe(false);

      // Illegal: settle from idle
      expect(store.settle()).toBe(false);

      // Transition to working
      store.beginCommand('Working task');

      // Illegal: beginCommand while already working
      expect(store.beginCommand('Concurrent task')).toBe(false);

      // Illegal: confirmPending while working (requires needs-confirmation)
      expect(store.confirmPending('Premature confirm')).toBe(false);

      // Illegal: rejectPending while working
      expect(store.rejectPending()).toBe(false);
    });

    it('resets to idle cleanly', () => {
      const store = createActionStateStore();
      store.beginCommand('Test');
      store.resolveDegraded('Error');
      store.resetToIdle();
      expect(store.getActionState().status).toBe('idle');
    });

    it('manages undo history stack without touching confirmed memory (INV-107)', () => {
      const store = createActionStateStore();
      expect(store.canUndo()).toBe(false);
      expect(store.undo()).toBeNull();

      const snapshot1: ActionHistorySnapshot = {
        planState: null,
        sceneId: 'clear',
        actionState: { status: 'idle', timestamp: '2026-10-28T08:00:00Z' },
        timestamp: '2026-10-28T08:00:00Z',
      };

      store.pushHistory(snapshot1);
      expect(store.canUndo()).toBe(true);

      store.beginCommand('Modify plan');
      store.resolveExecutable('Plan modified');
      expect(store.getActionState().status).toBe('updated');

      const restored = store.undo();
      expect(restored).not.toBeNull();
      expect(restored?.sceneId).toBe('clear');
      expect(store.getActionState().status).toBe('idle');
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('2.2 Interaction State Machine & Navigation', () => {
    it('opens and closes conversation with subscriber notification and honest welcome text', () => {
      const store = createActionStateStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.openConversation();
      expect(store.getInteractionState()).toBe('CONVERSATION');
      expect(store.getTranscript().length).toBeGreaterThan(0);
      expect(store.getTranscript()[0]?.sender).toBe('assistant');
      expect(store.getTranscript()[0]?.text).toContain('I can help adjust your departure plan');
      expect(listener).toHaveBeenCalled();

      store.closeConversation();
      expect(store.getInteractionState()).toBe('HOME');
    });

    it('opens conversation with scene-aware welcome text for lunch scene', () => {
      const store = createActionStateStore();
      store.setCommandContext({ sceneId: 'away-lunch', plan: null });
      store.openConversation();
      expect(store.getTranscript()[0]?.text).toContain('I can help with lunch recommendations');
      expect(store.getTranscript()[0]?.text).toContain('quieter');
      expect(store.getTranscript()[0]?.text).toContain('vegetarian');
      expect(store.getTranscript()[0]?.text).toContain('closer');
    });

    it('resets transcript when switching scenes', () => {
      const store = createActionStateStore();
      store.setCommandContext({ sceneId: 'rain', plan: null });
      store.openConversation();
      expect(store.getTranscript()[0]?.text).toContain('departure plan');
      store.closeConversation();

      // Switch to lunch
      store.setCommandContext({ sceneId: 'away-lunch', plan: null });
      store.openConversation();
      expect(store.getTranscript()[0]?.text).toContain('lunch recommendations');
    });

    it('handles Esc key: closes conversation when open, ignores in HOME', () => {
      const store = createActionStateStore();
      expect(store.handleEsc()).toBe(false);
      expect(store.getInteractionState()).toBe('HOME');

      store.openConversation();
      expect(store.handleEsc()).toBe(true);
      expect(store.getInteractionState()).toBe('HOME');
    });

    it('toggles and sets pin state', () => {
      const store = createActionStateStore();
      expect(store.isPinned()).toBe(false);

      expect(store.togglePin()).toBe(true);
      expect(store.isPinned()).toBe(true);

      expect(store.togglePin()).toBe(false);
      expect(store.isPinned()).toBe(false);

      store.setPinned(true);
      expect(store.isPinned()).toBe(true);
    });

    it('when pinned, resolveExecutable stays in CONVERSATION rather than collapsing to HOME', () => {
      const store = createActionStateStore();
      store.openConversation();
      store.setPinned(true);

      store.beginCommand('Executable task');
      expect(store.getInteractionState()).toBe('PROCESSING');

      store.resolveExecutable('Task complete');
      expect(store.getInteractionState()).toBe('CONVERSATION'); // Pinned prevents collapse
    });
  });

  describe('2.2 Smart Auto-Collapse Rules (Exhaustive Table)', () => {
    const cases: Array<{
      situation: string;
      rule: AutoCollapseRule;
      pinned: boolean;
      expectedCollapse: boolean;
      expectedInteraction: string;
    }> = [
      {
        situation: 'Executable command with determinate result collapses to updated home',
        rule: 'executable_determinate',
        pinned: false,
        expectedCollapse: true,
        expectedInteraction: 'HOME',
      },
      {
        situation: 'Result is needs-confirmation stays open until confirm/reject',
        rule: 'needs_confirmation',
        pinned: false,
        expectedCollapse: false,
        expectedInteraction: 'CONVERSATION',
      },
      {
        situation: 'Long-form answer, Why explanation, or multi-turn discussion stays open',
        rule: 'long_form_discussion',
        pinned: false,
        expectedCollapse: false,
        expectedInteraction: 'CONVERSATION',
      },
      {
        situation: 'Unsupported ask stays open with honest capability answer',
        rule: 'unsupported_ask',
        pinned: false,
        expectedCollapse: false,
        expectedInteraction: 'CONVERSATION',
      },
      {
        situation: 'User pinned the conversation: NEVER auto-collapses even for executable command',
        rule: 'executable_determinate',
        pinned: true,
        expectedCollapse: false,
        expectedInteraction: 'CONVERSATION',
      },
      {
        situation: 'Degraded/failure stays open with notice; home unchanged',
        rule: 'degraded_failure',
        pinned: false,
        expectedCollapse: false,
        expectedInteraction: 'CONVERSATION',
      },
    ];

    for (const c of cases) {
      it(`enforces: ${c.situation}`, () => {
        const store = createActionStateStore();
        store.openConversation();
        store.setPinned(c.pinned);

        const collapsed = store.evaluateAutoCollapse(c.rule);
        expect(collapsed).toBe(c.expectedCollapse);
        expect(store.getInteractionState()).toBe(c.expectedInteraction);
      });
    }
  });

  describe('V2a Message Submission & Command Execution (LIVING_CONTEXT_V2.md §2 & §3)', () => {
    it('appends user message, enters PROCESSING, and presents honest capability answer for unsupported query', () => {
      const store = createActionStateStore();
      store.openConversation();

      const result = store.submitMessage('What is the weather in Paris?');
      expect(result.collapsed).toBe(false);
      expect(result.rule).toBe('unsupported_ask');
      expect(result.response).toContain("I can help adjust your departure plan");

      const transcript = store.getTranscript();
      expect(transcript.length).toBe(3); // 1 welcome + 1 user + 1 assistant
      expect(transcript[1]?.sender).toBe('user');
      expect(transcript[1]?.text).toBe('What is the weather in Paris?');
      expect(transcript[2]?.sender).toBe('assistant');
      expect(store.getInteractionState()).toBe('CONVERSATION');
    });

    it('executes LEAVE_LATER command with context: late shift yields needs-confirmation, accept collapses, undo restores', () => {
      const store = createActionStateStore();
      store.openConversation();

      const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
      const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
      const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;
      const candidate: IntentCandidate = {
        intent: 'depart',
        confidence: 1.0,
        evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
      };
      const d2Plan = departPreparer.prepare(
        candidate,
        d2Snapshot,
        d2MemoryFacts
      )!;

      store.setCommandContext({
        plan: d2Plan,
        candidate,
        snapshot: d2Snapshot,
        memory: d2MemoryFacts,
        sceneId: 'rain',
      });

      // 1. Send late shift (+15m later): arrives at 3:10 PM for 3:00 PM appt -> needs-confirmation!
      const resLate = store.submitMessage('Leave 15 minutes later');
      expect(resLate.collapsed).toBe(false);
      expect(resLate.rule).toBe('needs_confirmation');
      expect(resLate.response).toContain('arrive late');
      expect(store.getActionState().status).toBe('needs-confirmation');

      // 2. Accept the late departure -> confirms for this time only and auto-collapses to updated home!
      const resConfirm = store.submitMessage('Looks good');
      expect(resConfirm.collapsed).toBe(true);
      expect(resConfirm.rule).toBe('executable_determinate');
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().plan?.headline).toContain('2:45 PM');
      expect(store.getActionState().plan?.why.derivation).toContain('Because you asked: leave 15 min later · this time only');

      // 3. Negative test (a): Memory facts remain 100% unchanged in storage (this time only)
      expect(d2MemoryFacts.find(f => f.key === 'prep_buffer_minutes')?.value).toBe(5);

      // 4. Undo restores the exact prior plan
      const resUndo = store.submitMessage('Undo');
      expect(resUndo.collapsed).toBe(true);
      expect(resUndo.rule).toBe('executable_determinate');
      expect(store.getActionState().plan?.headline).toContain('2:30 PM');
    });

    it('Negative test (d): pinned conversation NEVER auto-collapses even on executable confirm', () => {
      const store = createActionStateStore();
      store.openConversation();
      store.setPinned(true);

      const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
      const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
      const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;
      const candidate: IntentCandidate = {
        intent: 'depart',
        confidence: 1.0,
        evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
      };
      const d2Plan = departPreparer.prepare(
        candidate,
        d2Snapshot,
        d2MemoryFacts
      )!;

      store.setCommandContext({
        plan: d2Plan,
        candidate,
        snapshot: d2Snapshot,
        memory: d2MemoryFacts,
        sceneId: 'rain',
      });

      store.submitMessage('Leave 15 minutes later');
      const resConfirm = store.submitMessage('Confirm');
      expect(resConfirm.collapsed).toBe(false); // PINNED: Never auto-collapses!
      expect(store.getInteractionState()).toBe('CONVERSATION');
    });

    it('ignores whitespace-only submissions', () => {
      const store = createActionStateStore();
      store.openConversation();
      const countBefore = store.getTranscript().length;

      const result = store.submitMessage('   \n  ');
      expect(result.collapsed).toBe(false);
      expect(store.getTranscript().length).toBe(countBefore);
    });

    it('handles FIND_LUNCH: re-ranks lunch candidates, auto-collapses on success, and supports Undo (V2b)', () => {
      const store = createActionStateStore();
      store.openConversation();

      const d3Clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const d3Snapshots = replayScenarioTimeline(d3Scenario, d3Clock);
      const d3Snapshot = d3Snapshots[d3Snapshots.length - 1]!;
      const candidate: IntentCandidate = {
        intent: 'lunch',
        confidence: 1.0,
        evidence: d3Snapshot.signals.filter(s => s.kind === 'mock_places'),
      };
      const d3Plan = lunchPreparer.prepare(candidate, d3Snapshot, d3MemoryFacts)!;
      expect(d3Plan).not.toBeNull();
      // Initially, Demo Place A is #1
      expect((d3Plan.optionsOrSteps[0] as any).name).toContain('Place A');

      store.setCommandContext({
        plan: d3Plan,
        candidate,
        snapshot: d3Snapshot,
        memory: d3MemoryFacts,
        sceneId: 'away-lunch',
      });

      // User asks for quieter + vegetarian spot
      const res = store.submitMessage('quieter + vegetarian');
      expect(res.collapsed).toBe(true);
      expect(res.rule).toBe('executable_determinate');
      expect(res.response).toContain('Demo Place B · Salad');
      expect(res.response).toContain('top recommendation');

      // The new plan has Place B as top recommendation
      const updatedPlan = store.getActionState().plan!;
      expect(updatedPlan).toBeDefined();
      expect((updatedPlan.optionsOrSteps[0] as any).name).toContain('Place B');
      expect((updatedPlan.optionsOrSteps[0] as any).vegetarian).toBe(true);
      expect((updatedPlan.optionsOrSteps[0] as any).noiseLevel).toBe('quiet');

      // Why explanation includes override note
      const whyRes = store.submitMessage('Why?');
      expect(whyRes.response).toContain('Because you asked: quieter, vegetarian · this time only');

      // Undo reverts to prior plan
      const undoRes = store.submitMessage('Undo');
      expect(undoRes.collapsed).toBe(true);
      expect((store.getActionState().plan!.optionsOrSteps[0] as any).name).toContain('Place A');
    });

    it('rejects FIND_LUNCH with degraded response when no lunch plan is active', () => {
      const store = createActionStateStore();
      store.openConversation();
      // No lunch plan in context
      const res = store.submitMessage('quieter + vegetarian');
      expect(res.collapsed).toBe(false);
      expect(res.rule).toBe('degraded_failure');
      expect(res.response).toContain("There's no active lunch recommendation to filter right now");
    });

    it('supports multi-command undo: leave-later -> Take the bus -> Undo restores leave-later -> Undo restores base plan', () => {
      const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
      const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
      const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;
      const candidate: IntentCandidate = {
        intent: 'depart',
        confidence: 1.0,
        evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
      };
      const basePlan = departPreparer.prepare(candidate, d2Snapshot, d2MemoryFacts)!;

      const store = createActionStateStore();
      store.openConversation();
      store.setCommandContext({
        plan: basePlan,
        candidate,
        snapshot: d2Snapshot,
        memory: d2MemoryFacts,
        sceneId: 'rain',
      });

      // Initial state: idle, no store plan override (Home displays basePlan)
      expect(store.getActionState().status).toBe('idle');
      expect(store.getActionState().plan).toBeUndefined();

      // 1. First command: Leave 15 minutes later -> Confirm
      store.submitMessage('Leave 15 minutes later');
      expect(store.getActionState().status).toBe('needs-confirmation');
      const confirmRes = store.submitMessage('Looks good');
      expect(confirmRes.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().plan?.headline).toContain('2:45 PM');
      const leaveLaterPlan = store.getActionState().plan;

      // Update command context with the updated plan (as app.ts does on re-render)
      store.setCommandContext({
        plan: leaveLaterPlan!,
        candidate,
        snapshot: d2Snapshot,
        memory: d2MemoryFacts,
        sceneId: 'rain',
      });

      // 2. Second command: Take the bus
      const busRes = store.submitMessage('Take the bus');
      expect(busRes.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().plan?.headline).toContain('2:15 PM');

      // 3. First Undo: restores the leave-later plan (2:45 PM)
      const undo1Res = store.submitMessage('Undo');
      expect(undo1Res.collapsed).toBe(true);
      expect(store.getActionState().plan?.headline).toContain('2:45 PM');

      // 4. Second Undo: restores the original base plan state (base departure 2:30 PM, idle)
      const undo2Res = store.submitMessage('Undo');
      expect(undo2Res.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('idle');
      expect(store.getActionState().plan?.headline).toContain('2:30 PM');
    });

    it('handles FIND_FUEL: searches gas stations, updates plan, auto-collapses on success, and supports Undo', () => {
      defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
      const store = createActionStateStore();
      store.openConversation();

      const fuelCandidate: IntentCandidate = {
        intent: 'fuel',
        confidence: 1.0,
        evidence: [],
      };

      store.setCommandContext({
        plan: null,
        candidate: fuelCandidate,
        snapshot: {
          id: 'snap-fuel-test-1',
          asOf: '2026-10-28T19:10:00.000Z',
          timezone: 'America/Los_Angeles',
          signals: [],
        },
        memory: [],
        sceneId: 'clear',
      });

      const res = store.submitMessage('find a gas station');
      expect(res.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().plan?.intentId).toBe('fuel');
      expect(store.getActionState().plan?.headline).toContain('Metro Gas & Go');
      expect(store.canUndo()).toBe(true);

      // Undo restores prior state
      const undoRes = store.submitMessage('Undo');
      expect(undoRes.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('idle');
    });

    it('handles Chinese "加油" disambiguation: enters needs-confirmation state, then "yes"/"accept" triggers fuel search', () => {
      defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
      const store = createActionStateStore();
      store.openConversation();

      store.setCommandContext({
        plan: null,
        candidate: undefined,
        snapshot: {
          id: 'snap-fuel-test-2',
          asOf: '2026-10-28T19:10:00.000Z',
          timezone: 'America/Los_Angeles',
          signals: [],
        },
        memory: [],
        sceneId: 'away-lunch', // Non-travel scene -> ambiguous!
      });

      // 1. Ambiguous query
      const ambigRes = store.submitMessage('加油');
      expect(ambigRes.collapsed).toBe(false);
      expect(ambigRes.rule).toBe('needs_confirmation');
      expect(ambigRes.response).toBe('Did you mean: find a gas station?');
      expect(store.getActionState().status).toBe('needs-confirmation');

      // 2. User confirms with "yes"
      const confirmRes = store.submitMessage('yes');
      expect(confirmRes.collapsed).toBe(true);
      expect(store.getActionState().status).toBe('updated');
      expect(store.getActionState().plan?.intentId).toBe('fuel');
      expect(store.getActionState().plan?.headline).toContain('Metro Gas & Go');
    });

    it('handles FIND_FUEL when location is unavailable: degrades gracefully with honest notice without fabricating merchants', () => {
      defaultLocationPort.setLocation('unavailable');
      const store = createActionStateStore();
      store.openConversation();

      store.setCommandContext({
        plan: null,
        candidate: undefined,
        snapshot: {
          id: 'snap-fuel-test-3',
          asOf: '2026-10-28T19:10:00.000Z',
          timezone: 'America/Los_Angeles',
          signals: [],
        },
        memory: [],
        sceneId: 'clear',
      });

      const res = store.submitMessage('find gas');
      expect(res.collapsed).toBe(false);
      expect(res.rule).toBe('degraded_failure');
      expect(res.response).toContain('Cannot search for gas stations: location is unavailable or denied');

      // Restore location port
      defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
    });
  });

  describe('Reduced Motion & Accessibility', () => {
    it('respects explicit reducedMotion constructor option', () => {
      const reducedStore = createActionStateStore({ reducedMotion: true });
      expect(reducedStore.isReducedMotion()).toBe(true);

      const standardStore = createActionStateStore({ reducedMotion: false });
      expect(standardStore.isReducedMotion()).toBe(false);
    });
  });
});
