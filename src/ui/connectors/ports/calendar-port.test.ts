/**
 * Calendar Connector Port Unit Tests
 * Governed by ARCH-REV3-UI-CONNECTORS and LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CalendarConnectorPort } from './calendar-port.js';

describe('CalendarConnectorPort', () => {
  let port: CalendarConnectorPort;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    port = new CalendarConnectorPort();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('has id "calendar"', () => {
    expect(port.id).toBe('calendar');
  });

  it('returns "connected" when configured=true and enabled=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: true,
        configured: true,
        provider: 'ics',
        attribution: 'iCalendar (RFC 5545)',
      }),
    });

    const status = await port.status();
    expect(status.state).toBe('connected');
    expect(status.detail).toContain('iCalendar feed connected');
    expect(status.source).toBe('/api/calendar/status');
  });

  it('returns "owner_gated" when configured=true and enabled=false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        configured: true,
        provider: 'ics',
      }),
    });

    const status = await port.status();
    expect(status.state).toBe('owner_gated');
    expect(status.detail).toContain('owner setting');
  });

  it('returns honest "unavailable" when configured=false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        configured: false,
        provider: 'ics',
        actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
      }),
    });

    const status = await port.status();
    expect(status.state).toBe('unavailable');
    expect(status.detail).toBe('Not available yet');
  });

  it('returns honest "unavailable" on network/fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const status = await port.status();
    expect(status.state).toBe('unavailable');
    expect(status.detail).toBe('Not available yet');
  });

  it('returns raw payload via getStatusPayload()', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        configured: false,
        actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
      }),
    });

    const payload = await port.getStatusPayload();
    expect(payload.configured).toBe(false);
    expect(payload.actionRequired).toContain('CALENDAR_ICS_URL');
  });
});
