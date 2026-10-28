import { describe, it, expect, vi } from 'vitest';
import { createActionStateStore } from './store.js';
import type { ActionHistorySnapshot, AutoCollapseRule } from './types.js';

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

  describe('V0 Message Submission (Honest Capability Placeholder)', () => {
    it('appends user message, enters PROCESSING, and presents honest placeholder', () => {
      const store = createActionStateStore();
      store.openConversation();

      const result = store.submitMessage('Leave 15 minutes later');
      expect(result.collapsed).toBe(false);
      expect(result.rule).toBe('unsupported_ask');
      expect(result.response).toContain('Commands arrive in the next build (V2a)');

      const transcript = store.getTranscript();
      expect(transcript.length).toBe(3); // 1 welcome + 1 user + 1 assistant
      expect(transcript[1]?.sender).toBe('user');
      expect(transcript[1]?.text).toBe('Leave 15 minutes later');
      expect(transcript[2]?.sender).toBe('assistant');
      expect(transcript[2]?.isPlaceholder).toBe(true);
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
