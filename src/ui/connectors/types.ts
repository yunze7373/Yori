/**
 * ConnectorStatus Contract (UI adapter layer — NOT src/core)
 * Governed by ARCH-REV3-UI-CONNECTORS and Acceptance Criteria AC-211-1, AC-203-2, AC-204-2, AC-205-1.
 */

export type ConnectorState =
  | 'not_connected'
  | 'permission_needed'
  | 'connected'
  | 'denied'
  | 'unavailable'
  | 'owner_gated';

export type ConnectorId = 'location' | 'calendar' | 'weather' | 'xmemo' | 'notifications';

/** D11: Google Calendar sub-connector (server-side OAuth; status booleans only, never an email). */
export interface GoogleCalendarConnectorInfo {
  readonly configured: boolean;
  readonly state: 'connected' | 'expired' | 'disconnected';
  readonly disabledReason?: 'no_client_id' | 'owner_off' | 'endpoint_override_rejected';
  /** An iCal feed is live underneath (the honest fallback when Google is not connected). */
  readonly icsFallback: boolean;
}

export interface ConnectorStatus {
  readonly id: ConnectorId;
  readonly state: ConnectorState;
  readonly detail: string;
  readonly source: string;
  readonly updatedAt: string;
  /** D11: only on the calendar connector. */
  readonly google?: GoogleCalendarConnectorInfo;
}

export interface ConnectorPort {
  readonly id: ConnectorId;
  status(): Promise<ConnectorStatus>;
  connect?(): Promise<ConnectorStatus>;
  disconnect?(): Promise<ConnectorStatus>;
  revoke?(): Promise<ConnectorStatus>;
}
