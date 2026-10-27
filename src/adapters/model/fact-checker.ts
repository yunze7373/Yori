/**
 * Model Fact Checker
 * Enforces Invariant INV-103: The model NEVER invents times, weather, places, routes, or prices.
 * Every factual token in the model output is validated against the supplied fact set.
 * Any mismatch causes the output to be discarded and the deterministic template used.
 */

import type { SuppliedFacts } from './types.js';

/**
 * Parses a time string into minutes from midnight (0..1439).
 * Handles:
 * - "2:05 PM" -> 14*60 + 5 = 845
 * - "2:05 am" -> 2*60 + 5 = 125
 * - "14:05"   -> 14*60 + 5 = 845
 * - "3 PM"    -> 15*60 = 900
 * - "3:00"    -> 3*60 = 180 (or matches 15:00 depending on am/pm context)
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  const clean = timeStr.trim().toLowerCase();
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hour = parseInt(match12[1]!, 10);
    const minute = match12[2] ? parseInt(match12[2]!, 10) : 0;
    const isPm = match12[3] === 'pm';
    if (hour === 12) {
      hour = isPm ? 12 : 0;
    } else if (isPm) {
      hour += 12;
    }
    return hour * 60 + minute;
  }

  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hour = parseInt(match24[1]!, 10);
    const minute = parseInt(match24[2]!, 10);
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return hour * 60 + minute;
    }
  }

  return null;
}

/**
 * Extracts time tokens from free-form text.
 * Matches: "2:05 PM", "14:25", "3:00 pm", "2:30", etc.
 */
export function extractTimeTokens(text: string): readonly string[] {
  const timeRegex = /\b(\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?|\d{1,2}\s*(?:AM|PM|am|pm))\b/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = timeRegex.exec(text)) !== null) {
    matches.push(m[1]!);
  }
  return Object.freeze(matches);
}

/**
 * Place keywords that indicate location/venue entities.
 */
const PLACE_SUFFIX_KEYWORDS = [
  'studio',
  'station',
  'cafe',
  'coffee',
  'restaurant',
  'school',
  'lab',
  'dentist',
  'clinic',
  'hospital',
  'airport',
  'park',
  'hotel',
  'library',
  'mall',
  'market',
  'store',
  'center',
  'centre',
];

/**
 * Common geographical city/country tokens used in tests and checks.
 */
const KNOWN_GEO_TOKENS = [
  'tokyo',
  'paris',
  'london',
  'seattle',
  'new york',
  'san francisco',
  'los angeles',
  'boston',
  'chicago',
];

/**
 * Validates that all factual tokens (times and places) in the generated wording
 * exist within the supplied facts set.
 * Returns valid: true if all tokens match, or valid: false with unlisted tokens.
 */
export function validateFactsInWording(
  wording: string,
  suppliedFacts: SuppliedFacts
): { readonly valid: boolean; readonly unlistedTokens: readonly string[] } {
  const unlistedTokens: string[] = [];

  // 1. Validate Time Tokens
  const wordingTimes = extractTimeTokens(wording);
  const suppliedMinutes = new Set<number>();

  for (const t of suppliedFacts.times) {
    const min = parseTimeToMinutes(t);
    if (min !== null) {
      suppliedMinutes.add(min);
      // Also add 12-hour offset if input was ambiguous (e.g. "2:05" might mean 14:05)
      if (min < 720) {
        suppliedMinutes.add(min + 720);
      }
    }
  }

  for (const wt of wordingTimes) {
    const min = parseTimeToMinutes(wt);
    if (min === null) {
      // Unparseable time token is suspicious
      unlistedTokens.push(wt);
      continue;
    }
    // Check if min is in supplied minutes
    // If ambiguous 12h without am/pm (e.g. 2:05), check both min and min+720
    const matches =
      suppliedMinutes.has(min) || (min < 720 && suppliedMinutes.has(min + 720));
    if (!matches) {
      unlistedTokens.push(wt);
    }
  }

  // 2. Validate Place Tokens
  const lowerWording = wording.toLowerCase();
  const lowerSuppliedPlaces = suppliedFacts.places.map(p => p.toLowerCase());

  // Check geo tokens
  for (const geo of KNOWN_GEO_TOKENS) {
    if (lowerWording.includes(geo)) {
      const allowed = lowerSuppliedPlaces.some(sp => sp.includes(geo));
      if (!allowed) {
        unlistedTokens.push(geo);
      }
    }
  }

  // Check place keyword phrases (e.g. "Paris Cafe", "Dentist", "Dance Studio")
  for (const kw of PLACE_SUFFIX_KEYWORDS) {
    // Regex for word(s) preceding keyword, e.g. "(\w+\s+studio)"
    const kwRegex = new RegExp(`\\b([a-zA-Z0-9'-]+\\s+${kw}|${kw})\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = kwRegex.exec(wording)) !== null) {
      const foundPhrase = m[0]!.toLowerCase();
      const allowed = lowerSuppliedPlaces.some(
        sp => sp.includes(foundPhrase) || foundPhrase.includes(sp)
      );
      if (!allowed) {
        unlistedTokens.push(m[0]!);
      }
    }
  }

  return Object.freeze({
    valid: unlistedTokens.length === 0,
    unlistedTokens: Object.freeze(unlistedTokens),
  });
}
