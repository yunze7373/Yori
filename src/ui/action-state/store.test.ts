import { describe, it, expect, vi } from 'vitest';
import { createActionStateStore } from './store.js';
import type { ActionHistorySnapshot, AutoCollapseRule } from './types.js';
import { d2Scenario, d2MemoryFacts } from '../../../tests/fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../app/scenario-player/index.js';
import { departPreparer } from '../../plugins/depart/preparer.js';

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
      expect(store.getTranscript()[0]?.text).toContain('V2a');
      expect(listener).toHaveBeenCalled();

      store.closeConversation();
      expect(store.getInteractionState()).toBe('HOME');
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
      const d2Plan = departPreparer.prepare(
        {
          intent: 'depart',
          confidence: 1.0,
          evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
        },
        d2Snapshot,
        d2MemoryFacts
      )!;

      store.setCommandContext({
        plan: d2Plan,
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
      const d2Plan = departPreparer.prepare(
        {
          intent: 'depart',
          confidence: 1.0,
          evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
        },
        d2Snapshot,
        d2MemoryFacts
      )!;

      store.setCommandContext({
        plan: d2Plan,
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
