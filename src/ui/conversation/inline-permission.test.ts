import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActionStateStore } from '../action-state/store.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import { renderTranscriptItems } from './conversation-view.js';
import type { ContextSnapshot } from '../../core/contracts/index.js';
import type { MessageItem } from '../action-state/types.js';

const liveSnapshot = {
  asOf: '2026-11-05T01:00:00.000Z',
  timezone: 'Asia/Tokyo',
  signals: [
    {
      kind: 'places_lunch',
      value: { status: 'available', places: [] },
      source: 'real',
      issuedAt: '2026-11-05T01:00:00.000Z',
      validFor: 300000,
      confidence: 1,
      consentScope: 'local_only',
      provenance: 'live',
    },
  ],
} as unknown as ContextSnapshot;

describe('ASK-INLINE-PERMISSION: in-conversation location permission', () => {
  afterEach(() => {
    defaultLocationPort.reset?.();
  });

  it('generates inline permission request with Allow and Not now buttons when status is prompt', () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();
    store.setNearbyRequestHandler(vi.fn());

    const res = store.submitMessage('find lunch', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    expect(res.response).toBe('I need your location to find places near you.');
    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.text).toBe('I need your location to find places near you.');
    expect(lastMsg.pendingUtterance).toBe('find lunch');
    expect(lastMsg.actions).toBeDefined();
    expect(lastMsg.actions).toEqual([
      {
        id: 'act-allow-loc',
        label: 'Allow location',
        variant: 'primary',
        action: 'allow_location',
      },
      {
        id: 'act-not-now',
        label: 'Not now',
        variant: 'secondary',
        action: 'not_now',
      },
    ]);
  });

  it('clicking "Allow location" calls locationRequestHandler and re-runs pending utterance on success', async () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();
    const nearbyHandler = vi.fn();
    store.setNearbyRequestHandler(nearbyHandler);

    const locHandler = vi.fn().mockImplementation(async () => {
      defaultLocationPort.setLocation('available', { lat: 35.6895, lng: 139.6917 });
      return {
        status: 'available' as const,
        coords: { lat: 35.6895, lng: 139.6917 },
      };
    });
    store.setLocationRequestHandler(locHandler);

    store.submitMessage('nearby food', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    const transcriptBefore = store.getTranscript();
    const promptMsg = transcriptBefore.find(m => m.actions && m.actions.length > 0);
    expect(promptMsg).toBeDefined();
    expect(promptMsg!.pendingUtterance).toBe('nearby food');

    await store.handleMessageAction(promptMsg!.id, 'allow_location');

    expect(locHandler).toHaveBeenCalledTimes(1);
    // Actions and pendingUtterance stripped from prompt message
    expect(promptMsg!.actions).toBeUndefined();
    expect(promptMsg!.pendingUtterance).toBeUndefined();

    // Utterance was re-run and triggered nearby search
    expect(nearbyHandler).toHaveBeenCalledWith('ask');
    const transcriptAfter = store.getTranscript();
    expect(transcriptAfter.length).toBeGreaterThan(transcriptBefore.length);
  });

  it('clicking "Allow location" produces honest fallback line when browser denies', async () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();
    store.setNearbyRequestHandler(vi.fn());

    const locHandler = vi.fn().mockImplementation(async () => {
      defaultLocationPort.setLocation('denied');
      return {
        status: 'denied' as const,
      };
    });
    store.setLocationRequestHandler(locHandler);

    store.submitMessage('find lunch', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    const promptMsg = store.getTranscript().find(m => m.actions && m.actions.length > 0);
    expect(promptMsg).toBeDefined();

    await store.handleMessageAction(promptMsg!.id, 'allow_location');

    expect(locHandler).toHaveBeenCalledTimes(1);
    expect(promptMsg!.actions).toBeUndefined();
    expect(promptMsg!.pendingUtterance).toBeUndefined();

    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.text).toBe("No problem — I'll work with what I have.");
    expect(lastMsg.actions).toBeUndefined();
  });

  it('clicking "Not now" strips actions and acknowledges without nagging', async () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();
    store.setNearbyRequestHandler(vi.fn());

    store.submitMessage('find lunch', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    const promptMsg = store.getTranscript().find(m => m.actions && m.actions.length > 0);
    expect(promptMsg).toBeDefined();

    await store.handleMessageAction(promptMsg!.id, 'not_now');

    expect(promptMsg!.actions).toBeUndefined();
    expect(promptMsg!.pendingUtterance).toBeUndefined();

    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.text).toBe("No problem — I'll work with what I have.");
    expect(lastMsg.actions).toBeUndefined();
  });

  it('when location is already denied at browser level, shows honest explanation without action buttons', () => {
    defaultLocationPort.setLocation('denied');
    const store = createActionStateStore();
    store.setNearbyRequestHandler(vi.fn());

    const res = store.submitMessage('find lunch', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    expect(res.response).toBe(
      'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.'
    );
    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.text).toContain('Location access is blocked in your browser settings');
    expect(lastMsg.actions).toBeUndefined();
  });

  it('zero model flicker: submitMessageAsync intercepts prompt and denied without model or inflight bubble', async () => {
    defaultLocationPort.setLocation('prompt');
    const interpretAsyncMock = vi.fn();
    const mockInterpreter = {
      interpret: vi.fn().mockReturnValue({
        intent: 'FIND_LUNCH',
        slots: { filters: [] },
      }),
      interpretAsync: interpretAsyncMock,
      isLiveMode: () => true,
    };
    const store = createActionStateStore({ interpreter: mockInterpreter as any });
    store.setNearbyRequestHandler(vi.fn());

    const res = await store.submitMessageAsync!('find lunch', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    expect(interpretAsyncMock).not.toHaveBeenCalled();
    expect(res.response).toBe('I need your location to find places near you.');
    const transcript = store.getTranscript();
    const inflight = transcript.find(m => m.inFlight);
    expect(inflight).toBeUndefined();
  });

  it('renderTranscriptItems renders .chat-actions-group with HTML-escaped attributes and labels', () => {
    const items: MessageItem[] = [
      {
        id: 'msg-1<script>',
        sender: 'assistant',
        text: 'I need your location & coordinates.',
        timestamp: '2026-11-05T01:00:00.000Z',
        actions: [
          {
            id: 'act-allow-loc',
            label: 'Allow <location>',
            variant: 'primary',
            action: 'allow_location',
          },
          {
            id: 'act-not-now',
            label: 'Not "now"',
            variant: 'secondary',
            action: 'not_now',
          },
        ],
      },
    ];

    const html = renderTranscriptItems(items, false);
    expect(html).toContain('chat-actions-group');
    expect(html).toContain('chat-action-btn');
    expect(html).toContain('btn-primary');
    expect(html).toContain('btn-outline');
    expect(html).toContain('data-action="allow_location"');
    expect(html).toContain('data-message-id="msg-1&lt;script&gt;"');
    expect(html).toContain('Allow &lt;location&gt;');
    expect(html).toContain('Not &quot;now&quot;');
    // Should not contain unescaped dangerous tags
    expect(html).not.toContain('<script>');
  });

  it('renderTranscriptItems disables action buttons on older messages in history', () => {
    const items: MessageItem[] = [
      {
        id: 'msg-1',
        sender: 'assistant',
        text: 'First prompt',
        timestamp: '2026-11-05T01:00:00.000Z',
        actions: [
          {
            id: 'act-1',
            label: 'Allow location',
            variant: 'primary',
            action: 'allow_location',
          },
        ],
      },
      {
        id: 'msg-2',
        sender: 'user',
        text: 'subsequent message',
        timestamp: '2026-11-05T01:01:00.000Z',
      },
    ];

    const html = renderTranscriptItems(items, false);
    expect(html).toContain('disabled aria-disabled="true"');
  });

  it('generates inline permission request for fuel intent when status is prompt', () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();

    const res = store.submitMessage('find gas', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    expect(res.response).toBe('I need your location to find places near you.');
    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.actions).toHaveLength(2);
    expect(lastMsg.pendingUtterance).toBe('find gas');
  });

  it('shows blocked explanation for fuel intent when status is denied', () => {
    defaultLocationPort.setLocation('denied');
    const store = createActionStateStore();

    const res = store.submitMessage('find gas', {
      snapshot: liveSnapshot,
      sceneId: 'live',
    } as any);

    expect(res.response).toContain('Location access is blocked in your browser settings');
    const transcript = store.getTranscript();
    const lastMsg = transcript[transcript.length - 1]!;
    expect(lastMsg.actions).toBeUndefined();
  });
});
