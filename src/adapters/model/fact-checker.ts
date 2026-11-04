/**
 * Model Fact Checker
 * Enforces Invariant INV-103: The model NEVER invents times, weather, places, routes, or prices.
 * Every factual token in the model output is validated against the supplied fact set.
 * Any mismatch causes the output to be discarded and the deterministic template used.
 */

import type { SuppliedFacts, AppliedAction } from './types.js';

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
 * Words that commonly start English sentences and should NOT be treated as proper nouns/places.
 */
const COMMON_SENTENCE_STARTERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'it', 'its',
  'i', 'we', 'you', 'your', 'my', 'our', 'he', 'she', 'they',
  'certainly', 'sure', 'here', 'there', 'please', 'sorry', 'no', 'not', 'yes',
  'got', 'understood', 'looking', 'searching', 'switching', 'shifting', 'moving',
  'updating', 'updated', 'switched', 'shifted', 'moved', 'changed', 'found',
  'finding', 'heading', 'keeping', 'let', 'lets', "let's", 'all', 'as', 'at',
  'in', 'on', 'for', 'to', 'from', 'with', 'without', 'by', 'since', 'because',
  'although', 'even', 'while', 'when', 'where', 'how', 'why', 'what', 'who', 'which',
  'can', 'could', 'would', 'will', 'shall', 'should', 'may', 'might', 'must',
  'do', 'does', 'did', 'have', 'has', 'had', 'is', 'are', 'was', 'were', 'be',
  'being', 'been', 'good', 'great', 'done', 'okay', 'ok', 'right', 'absolutely',
  'definitely', 'nearby', 'next', 'current', 'alternate', 'route', 'plan',
  'departure', 'lunch', 'options', 'option', 'confirmed', 'restored', 'changes',
  'nothing', 'just', 'however', 'so', 'if', 'then', 'now', 'or', 'and', 'but',
  'try', 'stop', 'check', 'view', 'see', 'take', 'walk', 'drive',
]);

/**
 * Words that may appear capitalized anywhere without being place entities.
 */
const NON_PLACE_PROPER_NOUNS = new Set([
  'i', "i'll", "i've", "i'm", "i'd", 'yori', 'am', 'pm', 'eta', 'ok', 'id',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'bus', 'drive', 'transit', 'walking', 'walk', 'route', 'routes', 'primary',
  'google', 'openstreetmap', 'overpass', 'open-meteo',
]);

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
    const val = m[1] ?? m[2];
    if (val) matches.push(val);
  }
  return Object.freeze(matches);
}

/**
 * Parses distance string into meters.
 * Handles: "350 m", "350m", "3 km", "35 miles", "15m", "500 ft", "0.5 miles".
 * Never matches "min" or "minutes".
 */
export function parseDistanceToMeters(distStr: string): number | null {
  const clean = distStr.trim().toLowerCase();
  const match = clean.match(/^(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|ft|feet|meters?|metres?|m)$/);
  if (!match) return null;
  const val = parseFloat(match[1]!);
  if (isNaN(val)) return null;
  const unit = match[2]!;
  if (unit.startsWith('km') || unit.startsWith('kilo')) return val * 1000;
  if (unit.startsWith('mi')) return val * 1609.344;
  if (unit.startsWith('ft') || unit.startsWith('fee')) return val * 0.3048;
  return val;
}

/**
 * Extracts distance tokens from free-form text.
 */
export function extractDistanceTokens(text: string): readonly string[] {
  // Negative lookahead (?![a-z]) ensures 'm' does not match 'min', 'miles', etc.
  const distRegex = /\b(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|ft|feet|meters?|metres?|m(?![a-z]))\b/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = distRegex.exec(text)) !== null) {
    matches.push(m[0]!);
  }
  return Object.freeze(matches);
}

/**
 * Checks whether text contains inferred/mentioned sensitive traits (diet, religion, health).
 * Reuses habit-learner isSensitiveLabel terms and rejects trait assertions like:
 * "Since you're vegan", "You are vegetarian", "Knowing you're vegan", etc.
 */
export function containsSensitiveTraits(text: string): boolean {
  // 1. Direct sensitive identity / medical / religious terms
  const directSensitive =
    /\b(halal|kosher|diabetic|diabetes|allergy|allergies|allergic|medical|disease|illness|health\s+condition|religious|religion|faith|muslim|islam|jewish|judaism|christian|christianity|hindu|buddhist|coeliac|celiac|lactose[\s-]?intoleran\w*)\b/i;
  if (directSensitive.test(text)) return true;

  // 2. Trait assertions onto the user (e.g. "Since you're vegan", "You are vegetarian", "As a vegan")
  const traitAssertion =
    /\b(?:you(?:'re|\s+are)?|since\s+you(?:'re|\s+are)?|knowing\s+you(?:'re|\s+are)?|as\s+you(?:'re|\s+are)?|as\s+a|for\s+your|your\s+diet|your\s+health|your\s+religion)\s+.*?\b(vegetarian|vegan|halal|kosher|gluten[\s-]?free|coeliac|celiac|allerg\w*|nut[\s-]?free|lactose\w*|dairy[\s-]?free|diabet\w*|low[\s-]?(?:salt|sodium|sugar|carb)|keto|organic|medical|diet\w*|religio\w*)\b/i;
  if (traitAssertion.test(text)) return true;

  const directDietAssertion =
    /\b(?:you(?:'re|\s+are)?|since\s+you(?:'re|\s+are)?|knowing\s+you(?:'re|\s+are)?|as\s+a)\s+(?:a\s+)?(vegan|vegetarian|gluten[\s-]?free|diabetic|celiac|coeliac)\b/i;
  if (directDietAssertion.test(text)) return true;

  return false;
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
 * Builds an allowlist of valid numerals and numbers from supplied facts.
 */
function buildNumericAllowlist(suppliedFacts: SuppliedFacts, appliedAction?: AppliedAction): Set<string> {
  const allowlist = new Set<string>();

  const addNumericValues = (raw: string) => {
    const matches = raw.match(/\b\d+(?:\.\d+)?\b/g);
    if (matches) {
      for (const m of matches) {
        allowlist.add(m);
        const parsed = parseFloat(m);
        if (!isNaN(parsed)) {
          allowlist.add(String(parsed));
          if (Number.isInteger(parsed)) {
            allowlist.add(String(parsed));
          }
        }
      }
    }
  };

  // 1. From Times
  for (const t of suppliedFacts.times) {
    addNumericValues(t);
    const min = parseTimeToMinutes(t);
    if (min !== null) {
      const h24 = Math.floor(min / 60);
      const m = min % 60;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      allowlist.add(String(h24));
      allowlist.add(String(h12));
      allowlist.add(String(m));
      if (m < 10) allowlist.add(`0${m}`);
    }
  }

  // 2. From Distances
  for (const d of suppliedFacts.distances ?? []) {
    addNumericValues(d);
    const m = parseDistanceToMeters(d);
    if (m !== null) {
      allowlist.add(String(m));
      if (m >= 1000) {
        const km = m / 1000;
        allowlist.add(String(km));
      }
    }
  }

  // 3. From Ratings
  for (const r of suppliedFacts.ratings ?? []) {
    addNumericValues(r);
  }

  // 4. From Prices
  for (const p of suppliedFacts.prices ?? []) {
    addNumericValues(p);
  }

  // 5. From Durations
  for (const du of suppliedFacts.durations ?? []) {
    addNumericValues(du);
  }

  // 6. From Places (e.g. "123 Harmony Way", "Studio 4")
  for (const pl of suppliedFacts.places) {
    addNumericValues(pl);
  }

  // 7. From Weather
  for (const w of suppliedFacts.weather ?? []) {
    addNumericValues(w);
  }

  // 8. From Applied Action
  if (appliedAction) {
    if (appliedAction.deltaMinutes !== undefined) {
      allowlist.add(String(appliedAction.deltaMinutes));
    }
    if (appliedAction.leaveTime) {
      addNumericValues(appliedAction.leaveTime);
    }
  }

  return allowlist;
}

/**
 * Extracts candidate proper noun phrases from wording.
 * Any capitalized word or phrase that is not a common sentence starter, not in non-place proper nouns,
 * and not part of supplied places/routes/weather/habits is returned as an unlisted candidate place.
 */
function extractUnlistedProperNouns(wording: string, suppliedFacts: SuppliedFacts): readonly string[] {
  const unlisted: string[] = [];
  const cleanTerm = (s: string) => s.toLowerCase().replace(/[—–·]/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerSuppliedPlaces = suppliedFacts.places.map(cleanTerm);
  const lowerSuppliedRoutes = (suppliedFacts.routes ?? []).map(cleanTerm);
  const lowerSuppliedWeather = (suppliedFacts.weather ?? []).map(cleanTerm);
  const lowerSuppliedHabits = (suppliedFacts.habits ?? []).map(cleanTerm);

  const isKnownTerm = (phrase: string): boolean => {
    const lp = cleanTerm(phrase);
    if (lowerSuppliedPlaces.some(sp => sp.includes(lp) || lp.includes(sp))) return true;
    if (lowerSuppliedRoutes.some(sr => sr.includes(lp) || lp.includes(sr))) return true;
    if (lowerSuppliedWeather.some(sw => sw.includes(lp) || lp.includes(sw))) return true;
    if (lowerSuppliedHabits.some(sh => sh.includes(lp) || lp.includes(sh))) return true;
    return false;
  };

  // Clean em-dashes and middle dots to spaces before splitting
  const cleanedWording = wording.replace(/[—–·]/g, ' ');
  const sentences = cleanedWording.split(/[.!?]+(?:\s+|$)/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const tokens = sentence.trim().split(/\s+/).map(t => t.replace(/^[^\w]+|[^\w]+$/g, '')).filter(t => t.length > 0);
    let i = 0;

    while (i < tokens.length) {
      const tok = tokens[i]!;
      if (!tok) {
        i++;
        continue;
      }

      const isCapitalized = /^[A-Z][a-zA-Z0-9'-]*$/.test(tok);
      const isStartOfSentence = i === 0;
      const lowerTok = tok.toLowerCase();

      if (isCapitalized) {
        if (isStartOfSentence && COMMON_SENTENCE_STARTERS.has(lowerTok)) {
          i++;
          continue;
        }

        if (NON_PLACE_PROPER_NOUNS.has(lowerTok)) {
          i++;
          continue;
        }

        // Collect consecutive capitalized tokens as a phrase (e.g. "Near Cafe", "Shake Shack")
        const phraseTokens: string[] = [tok];
        let j = i + 1;
        while (j < tokens.length) {
          const nextTok = tokens[j]!;
          if (/^[A-Z][a-zA-Z0-9'-]*$/.test(nextTok) && !NON_PLACE_PROPER_NOUNS.has(nextTok.toLowerCase())) {
            phraseTokens.push(nextTok);
            j++;
          } else {
            break;
          }
        }

        const candidatePhrase = phraseTokens.join(' ');
        if (!isKnownTerm(candidatePhrase)) {
          unlisted.push(candidatePhrase);
        }

        i = j;
      } else {
        i++;
      }
    }
  }

  return Object.freeze(unlisted);
}

/**
 * Validates that all factual tokens (times, places, prices, ratings, distances, numbers, weather)
 * in the generated wording exist within the supplied facts set.
 */
export function validateFactsInWording(
  wording: string,
  suppliedFacts: SuppliedFacts,
  options?: { readonly appliedAction?: AppliedAction; readonly isReply?: boolean }
): { readonly valid: boolean; readonly unlistedTokens: readonly string[] } {
  const unlistedTokens: string[] = [];

  // 1. Validate Time Tokens
  const wordingTimes = extractTimeTokens(wording);
  const suppliedMinutes = new Set<number>();

  for (const t of suppliedFacts.times) {
    const min = parseTimeToMinutes(t);
    if (min !== null) {
      suppliedMinutes.add(min);
      if (min < 720) {
        suppliedMinutes.add(min + 720);
      }
    }
  }

  for (const wt of wordingTimes) {
    const min = parseTimeToMinutes(wt);
    if (min === null) {
      unlistedTokens.push(wt);
      continue;
    }
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

  // For replies: Proper noun candidate place extraction
  if (options?.isReply) {
    const unlistedProperNouns = extractUnlistedProperNouns(wording, suppliedFacts);
    for (const pn of unlistedProperNouns) {
      unlistedTokens.push(pn);
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

  // 4. Validate Rating Tokens (Exact Numeric Match)
  const ratingTokens = extractRatingTokens(wording);
  if (ratingTokens.length > 0) {
    const suppliedRatings = (suppliedFacts.ratings ?? []).map(r => r.trim());
    for (const rt of ratingTokens) {
      const rtNum = parseFloat(rt);
      const allowed = suppliedRatings.some(sr => {
        const srNum = parseFloat(sr);
        return !isNaN(rtNum) && !isNaN(srNum) && Math.abs(rtNum - srNum) < 0.01;
      });
      if (!allowed) {
        unlistedTokens.push(rt);
      }
    }
  }

  // 5. Validate Distance Tokens (Normalized Value + Unit Matching)
  const distTokens = extractDistanceTokens(wording);
  if (distTokens.length > 0) {
    const suppliedDistances = suppliedFacts.distances ?? [];
    const parsedSupplied = suppliedDistances.map(d => ({
      raw: d.toLowerCase().replace(/\s+/g, ''),
      meters: parseDistanceToMeters(d),
    }));

    for (const dt of distTokens) {
      const parsedDt = parseDistanceToMeters(dt);
      const normDt = dt.toLowerCase().replace(/\s+/g, '');
      let matched = false;

      for (const ps of parsedSupplied) {
        if (normDt === ps.raw) {
          matched = true;
          break;
        }
        if (parsedDt !== null && ps.meters !== null) {
          const diff = Math.abs(parsedDt - ps.meters);
          const maxVal = Math.max(parsedDt, ps.meters);
          if (maxVal > 0 && diff / maxVal < 0.01) {
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        unlistedTokens.push(dt);
      }
    }
  }

  // For replies: Numeric allowlist and weather validation
  if (options?.isReply) {
    // 6. Numeric Allowlist (Every numeral in text must match a supplied fact)
    const numericAllowlist = buildNumericAllowlist(suppliedFacts, options?.appliedAction);
    const numericTokens = wording.match(/\b\d+(?:\.\d+)?\b/g);
    if (numericTokens) {
      for (const nt of numericTokens) {
        const parsed = parseFloat(nt);
        const inAllowlist =
          numericAllowlist.has(nt) ||
          (!isNaN(parsed) && numericAllowlist.has(String(parsed)));
        if (!inAllowlist) {
          unlistedTokens.push(nt);
        }
      }
    }

    // 7. Weather Condition Words
    const weatherWordsRegex = /\b(sunny|rain|raining|rainy|clear|cloudy|clouds|snow|snowing|drizzle|thunderstorm|umbrella|degrees|°c|°f)\b/i;
    if (weatherWordsRegex.test(wording)) {
      const suppliedWeather = (suppliedFacts.weather ?? []).map(w => w.toLowerCase());
      if (suppliedWeather.length === 0) {
        unlistedTokens.push('unlisted weather');
      } else {
        const wordingLower = wording.toLowerCase();
        const hasRainCondition = suppliedWeather.some(w => w.includes('rain') || w.includes('drizzle') || w.includes('shower'));
        const hasClearCondition = suppliedWeather.some(w => w.includes('clear') || w.includes('sunny'));

        if (hasRainCondition && (wordingLower.includes('sunny') || wordingLower.includes('clear') || wordingLower.includes('no umbrella'))) {
          unlistedTokens.push('contradictory weather condition');
        }
        if (hasClearCondition && (wordingLower.includes('rain') || wordingLower.includes('umbrella needed'))) {
          unlistedTokens.push('contradictory weather condition');
        }
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
  intent?: string,
  appliedAction?: AppliedAction
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

  const effectiveAction = appliedAction ?? suppliedFacts.appliedAction;
  const effectiveIntent = intent ?? effectiveAction?.intent;

  // Action alignment check BEFORE fact check so action discrepancies are reported accurately
  if (effectiveIntent === 'UNSUPPORTED' || effectiveIntent === 'WHY') {
    if (
      /\b(i(?:'ve|'ll| have| will)?\s+(?:booked|reserved|ordered|called|sent|set|scheduled|changed|moved|switched|updated|canceled))\b/i.test(trimmed) ||
      /\b(?:have\s+been|was|is|table\s+is|table\s+has\s+been)\s+(?:booked|reserved|ordered)\b/i.test(trimmed) ||
      /\b(?:booked|reserved)\s+(?:a\s+table|for\s+you)\b/i.test(trimmed) ||
      /\b(booked|reserved|ordered)\b/i.test(trimmed)
    ) {
      return { valid: false, reason: 'action_mismatch', error: 'Reply claims action on non-action intent' };
    }
  }

  if (effectiveIntent === 'FIND_LUNCH') {
    if (/\b(switched (?:primary )?route|route switched|switched to (?:bus|driving)|leave \d+ minutes later|moves your departure|departure plan is updated)\b/i.test(trimmed)) {
      return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than FIND_LUNCH' };
    }
  } else if (effectiveIntent === 'LEAVE_LATER') {
    if (/\b(lunch options?|lunch recommendation|quieter spots?|vegetarian options?|switched (?:primary )?route)\b/i.test(trimmed)) {
      return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than LEAVE_LATER' };
    }
    const deltaMatch = trimmed.match(/\b(\d+)\s*(?:min|minutes?)\s*(?:later|earlier)?\b/i);
    if (deltaMatch && effectiveAction?.deltaMinutes !== undefined) {
      const statedDelta = parseInt(deltaMatch[1]!, 10);
      if (statedDelta !== effectiveAction.deltaMinutes) {
        return {
          valid: false,
          reason: 'action_mismatch',
          error: `Stated delta (${statedDelta}m) does not match applied delta (${effectiveAction.deltaMinutes}m)`,
        };
      }
    }
  } else if (effectiveIntent === 'CHANGE_ROUTE') {
    if (/\b(lunch options?|lunch recommendation|quieter spots?|leave \d+ minutes later)\b/i.test(trimmed)) {
      return { valid: false, reason: 'action_mismatch', error: 'Reply claims different action than CHANGE_ROUTE' };
    }
    if (effectiveAction?.mode) {
      if (effectiveAction.mode === 'bus' && /\b(driving|drive)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: 'Reply claims driving when bus was applied' };
      }
      if (effectiveAction.mode === 'drive' && /\b(bus|transit)\b/i.test(trimmed)) {
        return { valid: false, reason: 'action_mismatch', error: 'Reply claims bus when drive was applied' };
      }
    }
  } else if (effectiveIntent === 'ACCEPT' || effectiveIntent === 'UNDO') {
    if (/\b(switched (?:primary )?route|lunch options?|leave \d+ minutes later)\b/i.test(trimmed)) {
      return { valid: false, reason: 'action_mismatch', error: `Reply claims different action than ${effectiveIntent}` };
    }
  }

  const factCheck = validateFactsInWording(trimmed, suppliedFacts, {
    appliedAction: effectiveAction,
    isReply: true,
  });
  if (!factCheck.valid) {
    return {
      valid: false,
      reason: 'unlisted_fact_token',
      error: `Reply contains unlisted fact token: ${factCheck.unlistedTokens.join(', ')}`,
    };
  }

  return { valid: true };
}
