/**
 * D11-GCAL-OAUTH: Calendar connector Google sub-state (port + Connectors view).
 * States come only from /api/calendar/status and /api/google/status; nothing is assumed.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { CalendarConnectorPort } from './ports/calendar-port.js';
import { renderConnectorsView } from './connectors-view.js';
import type { ConnectorId, ConnectorStatus, GoogleCalendarConnectorInfo } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function routes(calendar: unknown, google: unknown) {
  globalThis.fetch = vi.fn(async (url: any) => ({
    ok: true,
    json: async () => (String(url) === '/api/google/status' ? google : calendar),
  })) as any;
}

function view(google: GoogleCalendarConnectorInfo | undefined, calDetail = 'Not available yet') {
  const base = (id: ConnectorId, state: ConnectorStatus['state'] = 'unavailable'): ConnectorStatus => ({
    id,
    state,
    detail: id === 'calendar' ? calDetail : 'x',
    source: 'test',
    updatedAt: '2026-11-03T03:00:00.000Z',
  });
  const html = renderConnectorsView({
    location: base('location'),
    calendar: { ...base('calendar'), ...(google ? { google } : {}) },
    weather: base('weather'),
    xmemo: base('xmemo'),
    notifications: base('notifications'),
  } as Record<ConnectorId, ConnectorStatus>);
  // No DOM in this vitest environment: read each element's text by its id.
  const text = (id: string) => {
    const m = new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html);
    return m ? m[1]!.replace(/&middot;/g, '·').replace(/&amp;/g, '&') : undefined;
  };
  const rowState = /id="connector-google-calendar" data-google-state="([^"]+)"/.exec(html)?.[1] ?? null;
  return {
    rowState,
    detail: text('google-calendar-detail'),
    disclosure: text('google-calendar-disclosure'),
    connect: text('btn-connect-google-calendar'),
    disconnect: text('btn-disconnect-google-calendar'),
    html,
  };
}

describe('D11 calendar port: Google sub-state', () => {
  it('Google connected -> calendar connected (Google), sub-state connected', async () => {
    routes({ enabled: true, configured: true, provider: 'google_calendar' }, { configured: true, calendar: 'connected' });
    const s = await new CalendarConnectorPort().status();
    expect(s).toMatchObject({ state: 'connected', detail: 'Google Calendar connected (read-only)' });
    expect(s.google).toEqual({ configured: true, state: 'connected', disabledReason: undefined, icsFallback: false });
  });

  it('expired with a live iCal feed -> calendar is the iCal feed, Google expired with the fallback named', async () => {
    routes({ enabled: true, configured: true, provider: 'ics', google: { configured: true, calendar: 'expired' } }, { configured: true, calendar: 'expired' });
    const s = await new CalendarConnectorPort().status();
    expect(s).toMatchObject({ state: 'connected', detail: 'iCalendar feed connected (read-only)' });
    expect(s.google).toMatchObject({ state: 'expired', icsFallback: true });
  });

  it('no client configured -> calendar unchanged, Google not set up with the reason', async () => {
    routes({ enabled: false, configured: false, provider: 'ics' }, { configured: false, disabledReason: 'no_client_id', calendar: 'disconnected' });
    const s = await new CalendarConnectorPort().status();
    expect(s).toMatchObject({ state: 'unavailable', detail: 'Not available yet' });
    expect(s.google).toMatchObject({ configured: false, disabledReason: 'no_client_id', state: 'disconnected' });
  });

  it('/api/google/status unreachable -> no Google sub-state at all (nothing invented)', async () => {
    globalThis.fetch = vi.fn(async (url: any) =>
      String(url) === '/api/google/status' ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ enabled: false, configured: false }) }
    ) as any;
    const s = await new CalendarConnectorPort().status();
    expect(s.google).toBeUndefined();
  });
});

describe('D11 Connectors view: Google Calendar row', () => {
  it('not set up: honest label, no button, no disclosure', () => {
    const v = view({ configured: false, state: 'disconnected', disabledReason: 'no_client_id', icsFallback: false });
    expect(v.rowState).toBe('not_set_up');
    expect(v.detail).toBe('Not set up yet: the owner adds a Google OAuth client to enable this');
    expect(v.connect).toBeUndefined();
    expect(v.disclosure).toBeUndefined();
    expect(view({ configured: false, state: 'disconnected', disabledReason: 'owner_off', icsFallback: false }).detail).toBe('Off (owner setting)');
  });

  it('not connected: Connect button and the read-only data-recipient disclosure', () => {
    const v = view({ configured: true, state: 'disconnected', icsFallback: false });
    expect(v.detail).toBe('Not connected');
    expect(v.connect).toBe('Connect Google Calendar');
    expect(v.disclosure).toBe('Calendar events are read from Google, read-only. Yori never changes your calendar.');
  });

  it('connected: Disconnect; expired: Reconnect with the fallback named honestly', () => {
    expect(view({ configured: true, state: 'connected', icsFallback: false })).toMatchObject({ detail: 'Connected · read-only', disconnect: 'Disconnect Google Calendar' });
    expect(view({ configured: true, state: 'expired', icsFallback: true })).toMatchObject({ detail: 'Access expired · using your iCalendar feed instead', connect: 'Reconnect Google Calendar' });
    expect(view({ configured: true, state: 'expired', icsFallback: false }).detail).toBe('Access expired · no calendar connected');
  });

  it('no Google info -> the calendar card renders exactly as before', () => {
    const v = view(undefined);
    expect(v.rowState).toBeNull();
    expect(v.html).not.toContain('Google');
  });
});
