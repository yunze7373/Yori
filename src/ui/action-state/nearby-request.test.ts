/**
 * D2-LUNCH-DEFAULT-ON: an Ask for food nearby ("附近吃什么", "nearby restaurants") runs the same
 * on-demand search as the "Nearby now" button when Live registered the handler; without the
 * handler (Demo) the existing lunch-filter behaviour is unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActionStateStore } from './store.js';
import { defaultCommandInterpreter } from '../conversation/grammar.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import type { ContextSnapshot } from '../../core/contracts/index.js';

const liveSnapshot = {
  asOf: '2026-11-03T07:40:00.000Z',
  timezone: 'Asia/Tokyo',
  signals: [
    {
      kind: 'places_lunch',
      value: { status: 'available', places: [] },
      source: 'real',
      issuedAt: '2026-11-03T07:40:00.000Z',
      validFor: 300000,
      confidence: 1,
      consentScope: 'local_only',
      provenance: 'live',
    },
  ],
} as unknown as ContextSnapshot;

describe('D2 grammar: food-nearby asks', () => {
  it.each(['附近吃什么', '附近有什么好吃的', '周边的餐厅', '找个饭店', '去哪吃'])('%s -> unfiltered FIND_LUNCH', text => {
    const cmd = defaultCommandInterpreter.interpret(text);
    expect(cmd.intent).toBe('FIND_LUNCH');
    expect(cmd.slots.filters ?? []).toEqual([]);
  });

  it('English "nearby restaurants" is FIND_LUNCH (nearer filter)', () => {
    const cmd = defaultCommandInterpreter.interpret('nearby restaurants');
    expect(cmd.intent).toBe('FIND_LUNCH');
  });

  it('加油 (fuel) is not mistaken for food', () => {
    expect(defaultCommandInterpreter.interpret('附近的加油站').intent).not.toBe('FIND_LUNCH');
  });
});

describe('D2 store: Ask triggers the on-demand nearby search in Live', () => {
  afterEach(() => {
    defaultLocationPort.reset?.();
  });

  it('with a shared fix and the Live handler, calls it once with "ask" and answers honestly', () => {
    defaultLocationPort.setLocation('available', { lat: 35.689, lng: 139.692 });
    const store = createActionStateStore();
    const handler = vi.fn();
    store.setNearbyRequestHandler(handler);

    const res = store.submitMessage('附近吃什么', { snapshot: liveSnapshot } as any);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('ask');
    expect(res.rule).toBe('executable_determinate');
    expect(res.response).toContain('OpenStreetMap via Overpass');
    expect(res.response).not.toMatch(/simulated|no active lunch/i);
  });

  it('without a location fix the handler is NOT called (honest location message instead)', () => {
    defaultLocationPort.setLocation('denied');
    const store = createActionStateStore();
    const handler = vi.fn();
    store.setNearbyRequestHandler(handler);
    const res = store.submitMessage('nearby restaurants', { snapshot: liveSnapshot } as any);
    expect(handler).not.toHaveBeenCalled();
    expect(res.rule).toBe('degraded_failure');
  });

  it('without a handler (Demo) the existing "no active lunch recommendation" path is unchanged', () => {
    defaultLocationPort.setLocation('available', { lat: 35.689, lng: 139.692 });
    const store = createActionStateStore();
    const res = store.submitMessage('附近吃什么', { snapshot: liveSnapshot } as any);
    expect(res.response).toContain('no active lunch recommendation');
  });
});
