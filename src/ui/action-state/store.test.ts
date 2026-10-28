import { describe, it, expect, vi } from 'vitest';
import { createActionStateStore } from './store.js';
import type { ActionHistorySnapshot, AutoCollapseRule } from './types.js';

describe('V0: Action-State Store & Interaction State Machine (§2)', () => {
  describe('2.1 Action States & Undo Lifecycle', () => {
    it('initializes to idle action state and HOME interaction state', () => {
      const store = createActionStateStore();
      const state = store.getActionState();

      expect(state.status).toBe('idle');
      expect(store.getInteractionState()).toBe('HOME');
      expect(store.isPinned()).toBe(false);
      expect(store.canUndo()).toBe(false);
    });

    it('transitions idle -> working (default & comparing substates) -> updated -> settled', () => {
      const store = createActionStateStore();

      store.startWorking('Recomputing departure');
      let state = store.getActionState();
      expect(state.status).toBe('working');
      expect(state.substate).toBe('default');
      expect(state.detail).toBe('Recomputing departure');

      store.startWorking('Comparing departure options', 'comparing');
      state = store.getActionState();
      expect(state.status).toBe('working');
      expect(state.substate).toBe('comparing');
      expect(state.detail).toBe('Comparing departure options');

      store.setUpdated('Depart shifted 15 min later');
      state = store.getActionState();
      expect(state.status).toBe('updated');
      expect(state.resultSummary).toBe('Depart shifted 15 min later');

      store.setSettled();
      state = store.getActionState();
      expect(state.status).toBe('settled');
    });

    it('transitions working -> needs-confirmation', () => {
      const store = createActionStateStore();
      store.startWorking('Adjusting preference');
      store.setNeedsConfirmation('Confirm buffer 10 min preference?');

      const state = store.getActionState();
      expect(state.status).toBe('needs-confirmation');
      expect(state.detail).toBe('Confirm buffer 10 min preference?');
    });

    it('transitions working -> degraded with honest failure notice', () => {
      const store = createActionStateStore();
      store.startWorking('Fetching transit schedule');
      store.setDegraded('Schedule provider unreachable; current departure preserved');

      const state = store.getActionState();
      expect(state.status).toBe('degraded');
      expect(state.notice).toBe('Schedule provider unreachable; current departure preserved');
    });

    it('resets to idle cleanly', () => {
      const store = createActionStateStore();
      store.setDegraded('Failure');
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

      store.setUpdated('Plan modified');
      expect(store.getActionState().status).toBe('updated');

      const restored = store.undo();
      expect(restored).not.toBeNull();
      expect(restored?.sceneId).toBe('clear');
      expect(store.getActionState().status).toBe('idle');
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('2.2 Interaction State Machine & Navigation', () => {
    it('opens and closes conversation with subscriber notification', () => {
      const store = createActionStateStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.openConversation();
      expect(store.getInteractionState()).toBe('CONVERSATION');
      expect(store.getTranscript().length).toBeGreaterThan(0);
      expect(store.getTranscript()[0]?.sender).toBe('assistant');
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
    it('appends user message and honest placeholder without fake processing animation', () => {
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
