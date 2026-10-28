/**
 * UserRequestOverride Definition
 * Governed by LIVING_CONTEXT_V2.md §2.3 and Rev4 Condition C5.
 *
 * Session-scoped, plugin-level request override:
 * - Never persisted to storage
 * - Cleared by Undo
 * - Travels into concrete preparer's prepareWithRequest entry
 * - Zero modifications to core contracts
 */

export interface UserRequestOverrideProvenance {
  readonly source: 'user_request';
  readonly at: string;
  readonly scope: 'this_time_only';
}

export interface UserRequestOverride {
  readonly kind: 'leave_later' | 'route_preference';
  readonly deltaMinutes?: number;
  readonly mode?: 'drive' | 'bus';
  readonly provenance: UserRequestOverrideProvenance;
}

export function createUserRequestOverride(params: {
  kind: 'leave_later' | 'route_preference';
  deltaMinutes?: number;
  mode?: 'drive' | 'bus';
  at: string;
}): UserRequestOverride {
  return Object.freeze({
    kind: params.kind,
    deltaMinutes: params.deltaMinutes,
    mode: params.mode,
    provenance: Object.freeze({
      source: 'user_request',
      at: params.at,
      scope: 'this_time_only',
    }),
  });
}
