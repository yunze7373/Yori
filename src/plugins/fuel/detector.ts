/**
 * Fuel Intent Detector (V5-FUEL / LIVING_CONTEXT_V2.md §10.3)
 *
 * Detects fuel recommendation intent when:
 * 1. A fuel status signal indicates low fuel (e.g. fuelPercent <= 20 or needsFuel === true).
 * 2. User explicitly requests fuel ('gas' / 'find gas' / '加油' with travel context).
 *
 * Never fabricates location or suppresses on its own (policy handles suppression).
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
} from '../../core/contracts/index.js';

export class FuelDetector implements IntentDetector {
  public readonly id = 'fuel-detector';
  public readonly targetIntent = 'fuel';

  public detect(snapshot: ContextSnapshot, _memory: readonly MemoryFact[]): IntentCandidate | null {
    if (!snapshot || !snapshot.signals) {
      return null;
    }

    // 1. Look for explicit fuel status or fuel percent signal
    const fuelSig = snapshot.signals.find(
      s => s.kind === 'fuel_status' || s.kind === 'fuel_percent'
    );
    if (fuelSig) {
      let isLow = false;
      let fuelPercent: number | undefined;
      let rangeMiles: number | undefined;

      if (typeof fuelSig.value === 'number') {
        fuelPercent = fuelSig.value;
        isLow = fuelPercent <= 25;
      } else if (fuelSig.value && typeof fuelSig.value === 'object') {
        const val = fuelSig.value as Record<string, unknown>;
        if (typeof val.fuelPercent === 'number') fuelPercent = val.fuelPercent;
        if (typeof val.rangeMiles === 'number') rangeMiles = val.rangeMiles;
        isLow =
          val.needsFuel === true ||
          (typeof fuelPercent === 'number' && fuelPercent <= 25) ||
          (typeof rangeMiles === 'number' && rangeMiles <= 30);
      }

      if (isLow) {
        return {
          intent: 'fuel',
          confidence: 0.95,
          evidence: [fuelSig],
          metadata: {
            reason: 'low_fuel_signal',
            fuelPercent,
            rangeMiles,
          },
        };
      }
    }

    // 2. Look for explicit user command signal in snapshot
    const userCmdSig = snapshot.signals.find(s => s.kind === 'user_command' || s.kind === 'user_request');
    if (userCmdSig && typeof userCmdSig.value === 'object' && userCmdSig.value !== null) {
      const val = userCmdSig.value as Record<string, unknown>;
      if (val.intent === 'fuel' || val.intent === 'FIND_FUEL') {
        return {
          intent: 'fuel',
          confidence: 1.0,
          evidence: [userCmdSig],
          metadata: {
            reason: 'user_requested',
          },
        };
      }
    }

    return null;
  }
}

export const fuelDetector = new FuelDetector();
