/**
 * Command Acceptance Evaluator (S1-LIVE-3 / S1-CMD-RC)
 * Evaluates live and dry-run decision_command responses strictly by code (not prose).
 *
 * Invariants enforced:
 * 1. Closed intent set (member of CLOSED_DECISION_INTENTS).
 * 2. Valid reason codes (all reasonCodes & situationAttribution codes in VALID_REASON_CODES).
 * 3. Fact-key parity (all cited fact keys must exist in confirmedFactKeys; zero invented keys).
 * 4. Stop finish reason (finish_reason === "stop", not "length" / truncated).
 * 5. Suppression honoured (active suppressions never overridden by positive recommendations).
 */

import {
  VALID_REASON_CODES,
  CLOSED_DECISION_INTENTS,
} from './reasoning.js';
import type { RejectedReasonCodeTelemetry } from './types.js';

export const COMMAND_PER_RUN_MAX_CALLS = 6;

export interface CommandSuppressionRecord {
  readonly code: string;
  readonly targetIntent?: string;
  readonly scope?: string;
  readonly reason?: string;
}

export interface CommandEvaluationContext {
  readonly utterance?: string;
  readonly availableModes?: readonly string[];
  readonly availableSignalIds?: readonly string[];
  readonly knownFactKeys?: readonly string[];
  readonly confirmedFactKeys?: readonly string[];
  readonly validTimes?: readonly string[];
  readonly validPlaces?: readonly string[];
  readonly currentPlanIntent?: string;
  readonly activeSuppressions?: readonly CommandSuppressionRecord[];
  readonly isDismissalOrSuppression?: boolean;
}

export interface CommandEvaluationInput {
  readonly result: any | null;
  readonly usedFallback: boolean;
  readonly fallbackReason?: string;
  readonly finishReason?: string;
  readonly rejectedReasonCodes?: readonly RejectedReasonCodeTelemetry[];
  readonly context: CommandEvaluationContext;
}

export interface CommandAcceptanceAudit {
  readonly closedIntent: boolean;
  readonly validReasonCodes: boolean;
  readonly factKeyParity: boolean;
  readonly stopFinishReason: boolean;
  readonly suppressionHonoured: boolean;
}

export interface CommandAcceptanceResult {
  readonly accepted: boolean;
  readonly failureReason?:
    | 'truncated'
    | 'out_of_set_intent'
    | 'invalid_reason_code'
    | 'invented_fact_key'
    | 'suppression_violated'
    | 'schema_invalid'
    | 'disabled'
    | 'timeout'
    | 'error'
    | 'fallback_used';
  readonly error?: string;
  readonly audit: CommandAcceptanceAudit;
  readonly details?: {
    readonly intent?: string;
    readonly reasonCodes?: readonly string[];
    readonly citedFactKeys?: readonly string[];
    readonly finishReason?: string;
  };
}

/**
 * Maps an intent to the high-level plan target intent it addresses, for suppression checking.
 */
function mapIntentToTargetPlan(intent: string): string | undefined {
  if (intent === 'FIND_LUNCH') return 'lunch';
  if (intent === 'LEAVE_LATER' || intent === 'CHANGE_ROUTE') return 'depart';
  if (intent === 'FIND_FUEL') return 'fuel';
  return undefined;
}

/**
 * Strictly evaluates a command decision call against code rules.
 */
export function evaluateCommandAcceptance(
  input: CommandEvaluationInput
): CommandAcceptanceResult {
  const { result, usedFallback, fallbackReason, finishReason, rejectedReasonCodes, context } = input;

  // 1. Truncation check: must fail immediately if finish_reason was length or fallbackReason was truncated
  const isTruncated = finishReason === 'length' || fallbackReason === 'truncated';
  if (isTruncated) {
    return {
      accepted: false,
      failureReason: 'truncated',
      error: `Response truncated (finish_reason: "${finishReason ?? 'length'}", fallbackReason: "${fallbackReason ?? 'truncated'}")`,
      audit: {
        closedIntent: false,
        validReasonCodes: false,
        factKeyParity: false,
        stopFinishReason: false,
        suppressionHonoured: true,
      },
    };
  }

  // 2. Fallback check: if the proxy used fallback, map to explicit root cause
  if (usedFallback) {
    if (rejectedReasonCodes && rejectedReasonCodes.length > 0) {
      return {
        accepted: false,
        failureReason: 'invalid_reason_code',
        error: `Invalid reason code telemetry: ${rejectedReasonCodes.map(r => `${r.field}=${r.code}`).join(', ')}`,
        audit: {
          closedIntent: false,
          validReasonCodes: false,
          factKeyParity: false,
          stopFinishReason: finishReason === 'stop',
          suppressionHonoured: true,
        },
      };
    }

    if (fallbackReason === 'invalid_reason_code') {
      return {
        accepted: false,
        failureReason: 'invalid_reason_code',
        error: 'Proxy rejected command output due to invalid reason code',
        audit: {
          closedIntent: false,
          validReasonCodes: false,
          factKeyParity: false,
          stopFinishReason: finishReason === 'stop',
          suppressionHonoured: true,
        },
      };
    }

    if (fallbackReason === 'out_of_set_intent') {
      return {
        accepted: false,
        failureReason: 'out_of_set_intent',
        error: 'Proxy rejected command output due to out-of-set intent',
        audit: {
          closedIntent: false,
          validReasonCodes: true,
          factKeyParity: false,
          stopFinishReason: finishReason === 'stop',
          suppressionHonoured: true,
        },
      };
    }

    if (fallbackReason === 'unknown_fact_key' || fallbackReason === 'unconfirmed_fact_used') {
      return {
        accepted: false,
        failureReason: 'invented_fact_key',
        error: `Proxy rejected command output: ${fallbackReason}`,
        audit: {
          closedIntent: false,
          validReasonCodes: true,
          factKeyParity: false,
          stopFinishReason: finishReason === 'stop',
          suppressionHonoured: true,
        },
      };
    }

    return {
      accepted: false,
      failureReason: (fallbackReason as any) || 'fallback_used',
      error: `Proxy returned fallback with reason: ${fallbackReason ?? 'unknown'}`,
      audit: {
        closedIntent: false,
        validReasonCodes: false,
        factKeyParity: false,
        stopFinishReason: finishReason === 'stop',
        suppressionHonoured: true,
      },
    };
  }

  // 3. For live non-fallback responses, finishReason must be "stop"
  if (finishReason !== undefined && finishReason !== 'stop') {
    return {
      accepted: false,
      failureReason: 'truncated',
      error: `Response did not finish with "stop" (finish_reason: "${finishReason}")`,
      audit: {
        closedIntent: false,
        validReasonCodes: false,
        factKeyParity: false,
        stopFinishReason: false,
        suppressionHonoured: true,
      },
    };
  }

  // 3. Schema structure check
  if (!result || typeof result !== 'object') {
    return {
      accepted: false,
      failureReason: 'schema_invalid',
      error: 'Command result is null or not an object',
      audit: {
        closedIntent: false,
        validReasonCodes: false,
        factKeyParity: false,
        stopFinishReason: true,
        suppressionHonoured: true,
      },
    };
  }

  // 4. Closed Intent check
  const intentStr = String(result.intent ?? '');
  if (!CLOSED_DECISION_INTENTS.has(intentStr)) {
    return {
      accepted: false,
      failureReason: 'out_of_set_intent',
      error: `Intent "${intentStr}" is not in closed intent set (${Array.from(CLOSED_DECISION_INTENTS).join(', ')})`,
      audit: {
        closedIntent: false,
        validReasonCodes: true,
        factKeyParity: true,
        stopFinishReason: true,
        suppressionHonoured: true,
      },
      details: { intent: intentStr },
    };
  }

  // 5. Valid Reason Codes check
  const reasonCodes = Array.isArray(result.reasonCodes) ? result.reasonCodes : [];
  for (let i = 0; i < reasonCodes.length; i++) {
    const code = reasonCodes[i];
    if (typeof code !== 'string' || !VALID_REASON_CODES.has(code)) {
      return {
        accepted: false,
        failureReason: 'invalid_reason_code',
        error: `Invalid reason code at reasonCodes[${i}]: "${String(code)}"`,
        audit: {
          closedIntent: true,
          validReasonCodes: false,
          factKeyParity: true,
          stopFinishReason: true,
          suppressionHonoured: true,
        },
        details: { intent: intentStr, reasonCodes },
      };
    }
  }

  if (result.situationAttribution) {
    const saCode = result.situationAttribution.reasonCode;
    if (typeof saCode !== 'string' || !VALID_REASON_CODES.has(saCode)) {
      return {
        accepted: false,
        failureReason: 'invalid_reason_code',
        error: `Invalid situationAttribution reason code: "${String(saCode)}"`,
        audit: {
          closedIntent: true,
          validReasonCodes: false,
          factKeyParity: true,
          stopFinishReason: true,
          suppressionHonoured: true,
        },
        details: { intent: intentStr, reasonCodes },
      };
    }
  }

  // 6. Fact-Key Parity check (all cited fact keys must exist in confirmedFactKeys)
  const confirmedFactKeys = new Set(context.confirmedFactKeys ?? []);
  const citedFactKeys: string[] = [];

  if (Array.isArray(result.citedFactKeys)) {
    for (const k of result.citedFactKeys) {
      if (typeof k === 'string') citedFactKeys.push(k);
    }
  }

  if (result.situationAttribution && Array.isArray(result.situationAttribution.citedFactKeys)) {
    for (const k of result.situationAttribution.citedFactKeys) {
      if (typeof k === 'string') citedFactKeys.push(k);
    }
  }

  for (const k of citedFactKeys) {
    if (!confirmedFactKeys.has(k)) {
      return {
        accepted: false,
        failureReason: 'invented_fact_key',
        error: `Fact citation "${k}" is not in confirmedFactKeys (invented/unconfirmed fact key)`,
        audit: {
          closedIntent: true,
          validReasonCodes: true,
          factKeyParity: false,
          stopFinishReason: true,
          suppressionHonoured: true,
        },
        details: { intent: intentStr, reasonCodes, citedFactKeys },
      };
    }
  }

  // Reason code matches_confirmed_preference requires non-empty confirmed citations
  const hasConfirmedPrefReason =
    reasonCodes.includes('matches_confirmed_preference') ||
    result.situationAttribution?.reasonCode === 'matches_confirmed_preference';

  if (hasConfirmedPrefReason && citedFactKeys.length === 0) {
    return {
      accepted: false,
      failureReason: 'invented_fact_key',
      error: 'Reason code "matches_confirmed_preference" requires non-empty citedFactKeys',
      audit: {
        closedIntent: true,
        validReasonCodes: true,
        factKeyParity: false,
        stopFinishReason: true,
        suppressionHonoured: true,
      },
      details: { intent: intentStr, reasonCodes, citedFactKeys },
    };
  }

  // 7. Suppression honoured check
  const activeSuppressions = context.activeSuppressions ?? [];
  const targetPlan = mapIntentToTargetPlan(intentStr);

  if (targetPlan && activeSuppressions.length > 0) {
    const matchingSuppression = activeSuppressions.find(
      s => s.targetIntent === targetPlan || s.targetIntent === '*'
    );
    if (matchingSuppression) {
      return {
        accepted: false,
        failureReason: 'suppression_violated',
        error: `Intent "${intentStr}" addresses target "${targetPlan}" which is actively suppressed (${matchingSuppression.reason ?? matchingSuppression.code})`,
        audit: {
          closedIntent: true,
          validReasonCodes: true,
          factKeyParity: true,
          stopFinishReason: true,
          suppressionHonoured: false,
        },
        details: { intent: intentStr, reasonCodes, citedFactKeys },
      };
    }
  }

  // If the command itself is a dismissal/suppression request (e.g. "I already ate lunch"),
  // returning an active recommendation for that intent violates user suppression
  if (context.isDismissalOrSuppression && targetPlan && targetPlan === context.currentPlanIntent) {
    return {
      accepted: false,
      failureReason: 'suppression_violated',
      error: `Command requested dismissal/suppression of "${context.currentPlanIntent}", but model returned active recommendation "${intentStr}"`,
      audit: {
        closedIntent: true,
        validReasonCodes: true,
        factKeyParity: true,
        stopFinishReason: true,
        suppressionHonoured: false,
      },
      details: { intent: intentStr, reasonCodes, citedFactKeys },
    };
  }

  // All checks passed strictly!
  return {
    accepted: true,
    audit: {
      closedIntent: true,
      validReasonCodes: true,
      factKeyParity: true,
      stopFinishReason: true,
      suppressionHonoured: true,
    },
    details: {
      intent: intentStr,
      reasonCodes,
      citedFactKeys,
      finishReason,
    },
  };
}
