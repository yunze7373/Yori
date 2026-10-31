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

export interface ConnectorStatus {
  readonly id: ConnectorId;
  readonly state: ConnectorState;
  readonly detail: string;
  readonly source: string;
  readonly updatedAt: string;
}

export interface ConnectorPort {
  readonly id: ConnectorId;
  status(): Promise<ConnectorStatus>;
  connect?(): Promise<ConnectorStatus>;
  disconnect?(): Promise<ConnectorStatus>;
  revoke?(): Promise<ConnectorStatus>;
}
