/**
 * Calendar Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Implements truthful runtime state:
 * - GET /api/calendar/status
 * - configured=true && enabled=true -> 'connected' ('iCalendar feed connected (read-only)')
 * - configured=true && enabled=false -> 'owner_gated' ('Live calendar is off (owner setting)')
 * - configured=false -> 'unavailable' ('Not available yet' with actionRequired instruction)
 * - Fetch error / non-200 -> 'unavailable' ('Not available yet')
 * D11: provider 'google_calendar' -> 'connected' ('Google Calendar connected (read-only)'); the
 * Google sub-state (connect / disconnect / expired, or not set up) comes from /api/google/status.
 */

import type { ConnectorPort, ConnectorStatus, GoogleCalendarConnectorInfo } from '../types.js';

export interface CalendarStatusResponse {
  readonly enabled?: boolean;
  readonly configured?: boolean;
  readonly provider?: string;
  readonly attribution?: string;
  readonly actionRequired?: string;
  readonly google?: { readonly configured: boolean; readonly calendar: GoogleCalendarConnectorInfo['state'] };
}

interface GoogleStatusResponse {
  readonly configured?: boolean;
  readonly disabledReason?: GoogleCalendarConnectorInfo['disabledReason'];
  readonly calendar?: GoogleCalendarConnectorInfo['state'];
}

async function readGoogleStatus(): Promise<GoogleStatusResponse | null> {
  try {
    const res = await fetch('/api/google/status', { cache: 'no-store' });
    // Always drain the body: an unread error body keeps the request open in the browser.
    const body = (await res.json().catch(() => null)) as GoogleStatusResponse | null;
    return res.ok ? body : null;
  } catch {
    return null;
  }
}

export class CalendarConnectorPort implements ConnectorPort {
  public readonly id = 'calendar' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    try {
      if (typeof fetch === 'undefined') {
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'Not available yet',
          source: 'Local capability audit',
          updatedAt,
        };
      }

      const res = await fetch('/api/calendar/status', { cache: 'no-store' });
      if (!res.ok) {
        // D11: the server refuses the owner's calendar to a non-loopback client (LAN demo:https).
        const err = (await res.json().catch(() => null)) as { code?: string } | null;
        if (res.status === 403 && err?.code === 'non_loopback_client') {
          return {
            id: this.id,
            state: 'unavailable',
            detail: 'Calendar is shown on this Mac or through surface E (localhost) only',
            source: '/api/calendar/status',
            updatedAt,
          };
        }
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'Not available yet',
          source: '/api/calendar/status',
          updatedAt,
        };
      }

      const data = (await res.json()) as CalendarStatusResponse;
      const g = await readGoogleStatus();
      const google: GoogleCalendarConnectorInfo | undefined = g
        ? {
            configured: g.configured === true,
            state: g.configured === true && (g.calendar === 'connected' || g.calendar === 'expired') ? g.calendar : 'disconnected',
            disabledReason: g.configured === true ? undefined : g.disabledReason,
            icsFallback: data.provider !== 'google_calendar' && data.configured === true && data.enabled === true,
          }
        : undefined;
      const withGoogle = (s: ConnectorStatus): ConnectorStatus => (google ? { ...s, google } : s);

      if (data.provider === 'google_calendar' && data.configured === true && data.enabled === true) {
        return withGoogle({
          id: this.id,
          state: 'connected',
          detail: 'Google Calendar connected (read-only)',
          source: '/api/calendar/status',
          updatedAt,
        });
      }

      if (data.configured === true && data.enabled === true) {
        return withGoogle({
          id: this.id,
          state: 'connected',
          detail: 'iCalendar feed connected (read-only)',
          source: '/api/calendar/status',
          updatedAt,
        });
      }

      if (data.configured === true && data.enabled === false) {
        return withGoogle({
          id: this.id,
          state: 'owner_gated',
          detail: 'Live calendar is off (owner setting)',
          source: '/api/calendar/status',
          updatedAt,
        });
      }

      // configured === false: honest connection-block state
      return withGoogle({
        id: this.id,
        state: 'unavailable',
        detail: 'Not available yet',
        source: '/api/calendar/status',
        updatedAt,
      });
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Not available yet',
        source: '/api/calendar/status',
        updatedAt,
      };
    }
  }

  /** D11: start Google consent (server builds the PKCE URL and sets the session cookie). */
  public async connectGoogle(): Promise<ConnectorStatus> {
    try {
      const res = await fetch('/api/google/oauth/start', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { authUrl?: string };
        if (data.authUrl && typeof window !== 'undefined') {
          window.location.href = data.authUrl;
        }
      }
    } catch {
      // Fall through to status re-read
    }
    return this.status();
  }

  /** D11: revoke at Google and delete the server-side tokens, then re-read the real status. */
  public async disconnectGoogle(): Promise<ConnectorStatus> {
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
    } catch {
      // Fall through to status re-read
    }
    return this.status();
  }

  public async getStatusPayload(): Promise<CalendarStatusResponse> {
    try {
      if (typeof fetch === 'undefined') {
        return { enabled: false, configured: false };
      }
      const res = await fetch('/api/calendar/status', { cache: 'no-store' });
      if (res.ok) {
        return (await res.json()) as CalendarStatusResponse;
      }
      return { enabled: false, configured: false };
    } catch {
      return { enabled: false, configured: false };
    }
  }
}

export const calendarConnectorPort = new CalendarConnectorPort();
