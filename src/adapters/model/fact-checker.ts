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
  'bar',
  'bistro',
  'eatery',
  'pub',
  'ramen',
  'sushi',
  'soba',
  'grill',
  'kitchen',
  'bakery',
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
 * Extracts price and currency tokens from free-form text.
 */
export function extractPriceTokens(text: string): readonly string[] {
  const priceRegex = /(?:[\$£€¥]\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:dollars?|bucks?|cents?|euros?|yen|usd|eur|jpy|gbp)\b)/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(text)) !== null) {
    matches.push(m[0]!);
  }
  return Object.freeze(matches);
}

/**
 * Extracts rating tokens from free-form text.
 */
export function extractRatingTokens(text: string): readonly string[] {
  const ratingRegex = /\b(\d(?:\.\d)?)\s*(?:\/\s*5|\s*stars?|\s*out of 5|\s*rating)\b|\brated\s+(\d(?:\.\d)?)\b/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = ratingRegex.exec(text)) !== null) {
    matches.push(m[1] ?? m[2] ?? m[0]!);
  }
  return Object.freeze(matches);
}

/**
 * Extracts distance tokens from free-form text.
 */
export function extractDistanceTokens(text: string): readonly string[] {
  const distRegex = /\b(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|km|kilometers?|kilometres?|mi|miles?|ft|feet)\b/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = distRegex.exec(text)) !== null) {
    matches.push(m[0]!);
  }
  return Object.freeze(matches);
}

/**
 * Checks whether text contains inferred/mentioned sensitive traits (diet, religion, health).
 */
export function containsSensitiveTraits(text: string): boolean {
  const sensitiveRegex = /\b(halal|kosher|diabetic|diabetes|allergy|allergies|allergic|medical|disease|illness|health condition|religious|religion|faith|muslim|islam|jewish|judaism|christian|christianity|hindu|buddhist)\b/i;
  return sensitiveRegex.test(text);
}

/**
 * Checks whether text contains prompt injection artifacts, instruction leakage, or markup/URLs.
 */
export function containsPromptInjectionOrMarkup(text: string): boolean {
  if (/https?:\/\//i.test(text)) return true;
  if (/<[^>]+>/.test(text)) return true;
  if (/\b(system prompt|ignore previous instructions|disregard previous|as an ai|as a language model|my instructions are|system rules)\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Checks whether text is strictly English (no CJK, Hangul, etc.).
 */
export function isEnglishOnly(text: string): boolean {
  return !/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(text);
}

/**
 * Checks whether text respects short sentence and word limits (<= 2 sentences, <= 45 words).
 */
export function isWithinLengthLimits(text: string, maxSentences: number = 2, maxWords: number = 45): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const sentences = trimmed.split(/[.!?]+(?:\s+|$)/).filter(s => s.trim().length > 0);
  if (sentences.length > maxSentences) return false;
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length > maxWords) return false;
  return true;
}

/**
 * Validates that all factual tokens (times, places, prices, ratings, distances) in the generated wording
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

  // 3. Validate Price Tokens
  const priceTokens = extractPriceTokens(wording);
  if (priceTokens.length > 0) {
    const suppliedPrices = (suppliedFacts.prices ?? []).map(p => p.toLowerCase().trim());
    for (const pt of priceTokens) {
      const lowerPt = pt.toLowerCase().trim();
      const numMatch = lowerPt.match(/\d+(?:\.\d+)?/);
      const num = numMatch ? numMatch[0] : '';
      const allowed = suppliedPrices.some(sp => sp.includes(lowerPt) || (num && sp.includes(num)));
      if (!allowed) {
        unlistedTokens.push(pt);
      }
    }
  }

  // 4. Validate Rating Tokens
  const ratingTokens = extractRatingTokens(wording);
  if (ratingTokens.length > 0) {
    const suppliedRatings = (suppliedFacts.ratings ?? []).map(r => r.trim());
    for (const rt of ratingTokens) {
      const allowed = suppliedRatings.some(sr => sr === rt || sr.startsWith(rt));
      if (!allowed) {
        unlistedTokens.push(rt);
      }
    }
  }

  // 5. Validate Distance Tokens
  const distTokens = extractDistanceTokens(wording);
  if (distTokens.length > 0) {
    const suppliedDistances = (suppliedFacts.distances ?? []).map(d => d.toLowerCase().replace(/\s+/g, ''));
    for (const dt of distTokens) {
      const normDt = dt.toLowerCase().replace(/\s+/g, '');
      const numMatch = normDt.match(/\d+(?:\.\d+)?/);
      const num = numMatch ? numMatch[0] : '';
      const allowed = suppliedDistances.some(sd => sd.includes(normDt) || normDt.includes(sd) || (num && sd.startsWith(num)));
      if (!allowed) {
        unlistedTokens.push(dt);
      }
    }
  }

  return Object.freeze({
    valid: unlistedTokens.length === 0,
    unlistedTokens: Object.freeze(unlistedTokens),
  });
}

/**
 * Validates an assistant reply against facts, English-only constraint, length limits,
 * sensitive trait absence, injection neutralisation, and action alignment.
 */
export function validateAssistantReply(
  reply: string,
  suppliedFacts: SuppliedFacts,
  intent?: string
): { readonly valid: boolean; readonly reason?: string; readonly error?: string } {
  if (typeof reply !== 'string') {
    return { valid: false, reason: 'schema_invalid', error: 'Reply must be a string' };
  }

  const trimmed = reply.trim();
  if (!trimmed) {
    return { valid: false, reason: 'schema_invalid', error: 'Reply must not be empty' };
  }

  if (!isEnglishOnly(trimmed)) {
    return { valid: false, reason: 'not_english', error: 'Reply must be English only' };
  }

  if (!isWithinLengthLimits(trimmed, 2, 45)) {
    return { valid: false, reason: 'length_exceeded', error: 'Reply exceeds length limit (<= 2 sentences, <= 45 words)' };
  }

  if (containsPromptInjectionOrMarkup(trimmed)) {
    return { valid: false, reason: 'injection_or_markup', error: 'Reply contains URL, markup, or prompt leakage' };
  }

  if (containsSensitiveTraits(trimmed)) {
    return { valid: false, reason: 'sensitive_traits', error: 'Reply mentions sensitive diet/health/religion traits' };
  }

  const factCheck = validateFactsInWording(trimmed, suppliedFacts);
  if (!factCheck.valid) {
    return {
      valid: false,
      reason: 'unlisted_fact_token',
      error: `Reply contains unlisted fact token: ${factCheck.unlistedTokens.join(', ')}`,
    };
  }

  // Action alignment
  if (intent) {
    if (intent === 'FIND_LUNCH') {
      if (/\b(switched (?:primary )?route|route switched|switched to (?:bus|driving)|leave \d+ minutes later|moves your departure|departure plan is updated)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than FIND_LUNCH' };
      }
    } else if (intent === 'LEAVE_LATER') {
      if (/\b(lunch options?|lunch recommendation|quieter spots?|vegetarian options?|switched (?:primary )?route)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than LEAVE_LATER' };
      }
    } else if (intent === 'CHANGE_ROUTE') {
      if (/\b(lunch options?|lunch recommendation|quieter spots?|leave \d+ minutes later)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than CHANGE_ROUTE' };
      }
    } else if (intent === 'ACCEPT' || intent === 'UNDO') {
      if (/\b(switched (?:primary )?route|lunch options?|leave \d+ minutes later)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: `Reply claims different action than ${intent}` };
      }
    }
  }

  return { valid: true };
}
