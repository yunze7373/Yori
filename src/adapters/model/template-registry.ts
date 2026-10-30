/**
 * Server-Side Model Template Registry & Fact Schema Validator
 * Governed by Architecture Rev3 Section 9.1 and AC-201-1 (Plan yori_ph002_001 Slice A1).
 *
 * Requirements:
 * 1. Prompt text lives server-side in a registry keyed by fixed IDs.
 * 2. Unknown templateId -> 400 with no upstream model call.
 * 3. Client-supplied prompt/template text is rejected: presence of templateWording -> 400.
 * 4. Facts are validated against a strict per-template schema: allowed keys only (extra keys -> 400),
 *    typed values, bounded array lengths and string lengths.
 * 5. Facts are passed to the upstream prompt as quoted JSON data, never concatenated as instructions.
 * 6. Deterministic fallback rendering produces byte-identical D1-D6 outputs when model is disabled.
 */

import { VALID_REASON_CODES, CLOSED_DECISION_INTENTS } from './reasoning.js';

export const DECISION_COMMAND_VALID_REASON_CODES_LIST = Array.from(VALID_REASON_CODES).join(', ');
export const DECISION_COMMAND_VALID_INTENTS_LIST = Array.from(CLOSED_DECISION_INTENTS).join(', ');

export interface FactFieldRule {
  readonly type: 'string' | 'number' | 'boolean' | 'string_array';
  readonly required?: boolean;
  readonly minItems?: number;
  readonly maxLength?: number;
  readonly maxItems?: number;
  readonly itemMaxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface ServerTemplate {
  readonly id: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly promptInstruction: string;
  readonly allowedFactRules: Readonly<Record<string, FactFieldRule>>;
  renderDeterministic(facts: Record<string, unknown>): string;
  extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] };
}

/**
 * Validates facts against a template's schema rules.
 * Extra keys, type mismatches, or bounds violations return descriptive error messages.
 */
export function validateFactsSchema(
  facts: unknown,
  rules: Record<string, FactFieldRule>
): { valid: true; validatedFacts: Record<string, unknown> } | { valid: false; error: string } {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return { valid: false, error: 'Facts must be a non-null JSON object' };
  }

  const rawFacts = facts as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(rules));
  const validatedFacts: Record<string, unknown> = {};

  // Check for unauthorized extra keys
  for (const key of Object.keys(rawFacts)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Invalid facts: property '${key}' is not allowed` };
    }
  }

  // Validate each field by its rule
  for (const [key, rule] of Object.entries(rules)) {
    const value = rawFacts[key];

    if (value === undefined || value === null) {
      if (rule.required) {
        return { valid: false, error: `Invalid facts: required property '${key}' is missing` };
      }
      continue;
    }

    if (rule.type === 'string') {
      if (typeof value !== 'string') {
        return { valid: false, error: `Invalid facts: property '${key}' must be a string` };
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        return {
          valid: false,
          error: `Invalid facts: property '${key}' exceeds maximum length of ${rule.maxLength}`,
        };
      }
      validatedFacts[key] = value;
    } else if (rule.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { valid: false, error: `Invalid facts: property '${key}' must be a finite number` };
      }
      if (rule.integer && !Number.isInteger(value)) {
        return { valid: false, error: `Invalid facts: property '${key}' must be an integer` };
      }
      if (rule.min !== undefined && value < rule.min) {
        return { valid: false, error: `Invalid facts: property '${key}' must be >= ${rule.min}` };
      }
      if (rule.max !== undefined && value > rule.max) {
        return { valid: false, error: `Invalid facts: property '${key}' must be <= ${rule.max}` };
      }
      validatedFacts[key] = value;
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Invalid facts: property '${key}' must be a boolean` };
      }
      validatedFacts[key] = value;
    } else if (rule.type === 'string_array') {
      if (!Array.isArray(value)) {
        return { valid: false, error: `Invalid facts: property '${key}' must be an array of strings` };
      }
      if (rule.minItems !== undefined && value.length < rule.minItems) {
        return {
          valid: false,
          error: `Invalid facts: property '${key}' must contain at least ${rule.minItems} item(s)`,
        };
      }
      if (rule.maxItems !== undefined && value.length > rule.maxItems) {
        return {
          valid: false,
          error: `Invalid facts: property '${key}' exceeds maximum of ${rule.maxItems} items`,
        };
      }
      const itemMax = rule.itemMaxLength ?? 100;
      for (const item of value) {
        if (typeof item !== 'string') {
          return { valid: false, error: `Invalid facts: items in '${key}' must be strings` };
        }
        if (item.length > itemMax) {
          return {
            valid: false,
            error: `Invalid facts: item in '${key}' exceeds maximum length of ${itemMax}`,
          };
        }
      }
      validatedFacts[key] = Object.freeze([...value]);
    }
  }

  return { valid: true, validatedFacts: Object.freeze(validatedFacts) };
}

/**
 * Static registry of server-side prompt templates.
 */
export const SERVER_TEMPLATES: Readonly<Record<string, ServerTemplate>> = Object.freeze({
  depart: Object.freeze({
    id: 'depart',
    description: 'Standard calendar appointment departure recommendation',
    systemPrompt:
      'You are a calm context-aware assistant refining notification wording for departure planning. Use ONLY provided facts. Do NOT add new times, places, or prices. Reply with JSON: {"wording": "..."}',
    promptInstruction:
      'Refine the departure notification wording clearly and calmly using provided times and places.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      headline: { type: 'string', maxLength: 300 },
      subjectTitle: { type: 'string', maxLength: 100 },
      prepareTime: { type: 'string', maxLength: 30 },
      leaveTime: { type: 'string', maxLength: 30 },
      appointmentTime: { type: 'string', maxLength: 30 },
      times: { type: 'string_array', maxItems: 10, itemMaxLength: 30 },
      places: { type: 'string_array', maxItems: 10, itemMaxLength: 100 },
      contextSummary: { type: 'string', maxLength: 200 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (typeof facts.headline === 'string' && facts.headline.length > 0) {
        return facts.headline;
      }
      const prep = facts.prepareTime ? `Get ready at ${facts.prepareTime}` : '';
      const leave = facts.leaveTime ? `leave by ${facts.leaveTime}` : '';
      const timing = [prep, leave].filter(Boolean).join(', ');
      const subject = facts.subjectTitle ? `${facts.subjectTitle}: ` : '';
      return `${subject}${timing}` || 'Upcoming departure';
    },
    extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] } {
      const times: string[] = [];
      const places: string[] = [];
      if (Array.isArray(facts.times)) times.push(...(facts.times as string[]));
      if (typeof facts.prepareTime === 'string') times.push(facts.prepareTime);
      if (typeof facts.leaveTime === 'string') times.push(facts.leaveTime);
      if (typeof facts.appointmentTime === 'string') times.push(facts.appointmentTime);
      if (Array.isArray(facts.places)) places.push(...(facts.places as string[]));
      if (typeof facts.subjectTitle === 'string') places.push(facts.subjectTitle);
      return { times, places };
    },
  }),

  rain_depart: Object.freeze({
    id: 'rain_depart',
    description: 'Departure recommendation adapted for rain forecast with travel options',
    systemPrompt:
      'You are a calm context-aware assistant refining departure notification wording with rain re-planning. Use ONLY provided facts. Do NOT add new times, places, or prices. Reply with JSON: {"wording": "..."}',
    promptInstruction:
      'Refine the departure notification wording under rain conditions, highlighting umbrella and transit choices calmly.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      headline: { type: 'string', maxLength: 300 },
      subjectTitle: { type: 'string', maxLength: 100 },
      prepareTime: { type: 'string', maxLength: 30 },
      leaveTime: { type: 'string', maxLength: 30 },
      appointmentTime: { type: 'string', maxLength: 30 },
      hasRain: { type: 'boolean' },
      primaryMode: { type: 'string', maxLength: 50 },
      times: { type: 'string_array', maxItems: 10, itemMaxLength: 30 },
      places: { type: 'string_array', maxItems: 10, itemMaxLength: 100 },
      contextSummary: { type: 'string', maxLength: 200 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (typeof facts.headline === 'string' && facts.headline.length > 0) {
        return facts.headline;
      }
      const prep = facts.prepareTime ? `Get ready at ${facts.prepareTime}` : '';
      const leave = facts.leaveTime ? `leave by ${facts.leaveTime}` : '';
      const timing = [prep, leave].filter(Boolean).join(', ');
      return timing || 'Upcoming departure with rain';
    },
    extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] } {
      const times: string[] = [];
      const places: string[] = [];
      if (Array.isArray(facts.times)) times.push(...(facts.times as string[]));
      if (typeof facts.prepareTime === 'string') times.push(facts.prepareTime);
      if (typeof facts.leaveTime === 'string') times.push(facts.leaveTime);
      if (typeof facts.appointmentTime === 'string') times.push(facts.appointmentTime);
      if (Array.isArray(facts.places)) places.push(...(facts.places as string[]));
      if (typeof facts.subjectTitle === 'string') places.push(facts.subjectTitle);
      return { times, places };
    },
  }),

  lunch: Object.freeze({
    id: 'lunch',
    description: 'Proactive lunch recommendation within walking distance',
    systemPrompt:
      'You are a calm context-aware assistant refining lunch dining recommendations. Use ONLY provided facts. Do NOT add new places, cuisines, or prices. Reply with JSON: {"wording": "..."}',
    promptInstruction:
      'Refine the lunch options headline calmly using confirmed taste memories and nearby place facts.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      headline: { type: 'string', maxLength: 300 },
      cuisines: { type: 'string_array', maxItems: 5, itemMaxLength: 50 },
      places: { type: 'string_array', maxItems: 5, itemMaxLength: 100 },
      distanceMinutes: { type: 'number', min: 0, max: 120 },
      times: { type: 'string_array', maxItems: 5, itemMaxLength: 30 },
      contextSummary: { type: 'string', maxLength: 200 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (typeof facts.headline === 'string' && facts.headline.length > 0) {
        return facts.headline;
      }
      return 'Places matching what you like, within walking distance';
    },
    extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] } {
      const times: string[] = [];
      const places: string[] = [];
      if (Array.isArray(facts.times)) times.push(...(facts.times as string[]));
      if (Array.isArray(facts.places)) places.push(...(facts.places as string[]));
      return { times, places };
    },
  }),

  grocery: Object.freeze({
    id: 'grocery',
    description: 'Proactive grocery shopping recommendation',
    systemPrompt:
      'You are a calm context-aware assistant refining grocery shopping recommendations. Use ONLY provided facts. Do NOT add new items or store brands. Reply with JSON: {"wording": "..."}',
    promptInstruction:
      'Refine the grocery run recommendation calmly from list item facts and confirmed preferences.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      headline: { type: 'string', maxLength: 300 },
      storeName: { type: 'string', maxLength: 100 },
      itemCount: { type: 'number', integer: true, min: 1, max: 100 },
      items: { type: 'string_array', maxItems: 10, itemMaxLength: 50 },
      times: { type: 'string_array', maxItems: 5, itemMaxLength: 30 },
      places: { type: 'string_array', maxItems: 5, itemMaxLength: 100 },
      contextSummary: { type: 'string', maxLength: 200 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (typeof facts.headline === 'string' && facts.headline.length > 0) {
        return facts.headline;
      }
      const count = typeof facts.itemCount === 'number' ? facts.itemCount : 1;
      return `Grocery run: ${count} item${count === 1 ? '' : 's'} on your list`;
    },
    extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] } {
      const times: string[] = [];
      const places: string[] = [];
      if (Array.isArray(facts.times)) times.push(...(facts.times as string[]));
      if (Array.isArray(facts.places)) places.push(...(facts.places as string[]));
      if (typeof facts.storeName === 'string') places.push(facts.storeName);
      return { times, places };
    },
  }),

  notice: Object.freeze({
    id: 'notice',
    description: 'Calm system status and fail-closed notice wording',
    systemPrompt:
      'You are a calm context-aware assistant phrasing system status notices honestly and without technical jargon. Use ONLY provided facts. Reply with JSON: {"wording": "..."}',
    promptInstruction:
      'Phrase the status notice calmly and directly without technical error codes.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      headline: { type: 'string', maxLength: 300 },
      signalKind: { type: 'string', maxLength: 50 },
      isStale: { type: 'boolean' },
      contextSummary: { type: 'string', maxLength: 200 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (typeof facts.headline === 'string' && facts.headline.length > 0) {
        return facts.headline;
      }
      return "Some real-time information isn't available right now.";
    },
    extractFactTokens(_facts: Record<string, unknown>): { times: string[]; places: string[] } {
      return { times: [], places: [] };
    },
  }),

  reason_rank: Object.freeze({
    id: 'reason_rank',
    description: 'Constrained reasoning to rank engine candidate plans and propose intents',
    systemPrompt:
      'You are a strict calm reasoning assistant ranking candidate plans or proposing an intent. You may ONLY reorder candidate plan IDs and provide citations using provided signal IDs and confirmed memory fact keys. You must NEVER invent times, places, prices, or candidate IDs. Reply with JSON: {"orderedPlanIds": [...], "rationale": [{"planId": "...", "citedSignalIds": [...], "citedFactKeys": [...], "text": "..."}], "proposedIntent": {"intent": "...", "confidence": 0.8, "citedSignalIds": [...]}}',
    promptInstruction:
      'Rank the candidate plans based on confirmed preferences and real-time signals. All claims must cite provided signal IDs or fact keys.',
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      candidatePlanIds: { type: 'string_array', maxItems: 6, itemMaxLength: 64 },
      availableSignalIds: { type: 'string_array', maxItems: 20, itemMaxLength: 64 },
      confirmedFactKeys: { type: 'string_array', maxItems: 20, itemMaxLength: 64 },
    }),
    renderDeterministic(facts: Record<string, unknown>): string {
      if (Array.isArray(facts.candidatePlanIds) && facts.candidatePlanIds.length > 0) {
        return JSON.stringify({
          orderedPlanIds: facts.candidatePlanIds,
          rationale: [],
        });
      }
      return JSON.stringify({ orderedPlanIds: [], rationale: [] });
    },
    extractFactTokens(_facts: Record<string, unknown>): { times: string[]; places: string[] } {
      return { times: [], places: [] };
    },
  }),

  decision_command: Object.freeze({
    id: 'decision_command',
    description: 'Muse Spark constrained command interpreter and situation attribution',
    systemPrompt:
      `You are Muse Spark, a constrained decision engine for Yori. Map user utterance strictly to closed intents: ${DECISION_COMMAND_VALID_INTENTS_LIST}. Closed slots: modes drive|bus, filters quieter|vegetarian|nearer, deltaMinutes 1..240. Reason codes MUST be chosen ONLY from: ${DECISION_COMMAND_VALID_REASON_CODES_LIST}. reasonCodes may be [] and situationAttribution may be omitted when no code applies. situationAttribution shape: {"signalId": "...", "reasonCode": "...", "explanation": "...", "citedFactKeys": [...]}, where signalId must be one of availableSignalIds, and reasonCode must be one of the allowed reason codes (${DECISION_COMMAND_VALID_REASON_CODES_LIST}). Output compact schema-validated JSON only. No prose. Never originate unlisted facts, times, or places.`,
    promptInstruction:
      `Evaluate utterance under available signals, modes, and confirmed facts. Output compact JSON: {"intent": "...", "slots": {...}, "situationAttribution": {"signalId": "...", "reasonCode": "..."}, "citedSignalIds": [...], "citedFactKeys": [...], "reasonCodes": [...]}. Allowed reason codes: ${DECISION_COMMAND_VALID_REASON_CODES_LIST}. reasonCodes may be [] and situationAttribution may be omitted when no code applies. No prose.`,
    allowedFactRules: Object.freeze<Record<string, FactFieldRule>>({
      utterance: { type: 'string', required: true, maxLength: 200 },
      availableModes: { type: 'string_array', maxItems: 10, itemMaxLength: 20 },
      availableSignalIds: { type: 'string_array', maxItems: 20, itemMaxLength: 80 },
      knownFactKeys: { type: 'string_array', required: true, minItems: 1, maxItems: 20, itemMaxLength: 80 },
      confirmedFactKeys: { type: 'string_array', maxItems: 20, itemMaxLength: 80 },
      validTimes: { type: 'string_array', maxItems: 20, itemMaxLength: 50 },
      validPlaces: { type: 'string_array', maxItems: 20, itemMaxLength: 100 },
      currentPlanIntent: { type: 'string', maxLength: 50 },
    }),
    renderDeterministic(_facts: Record<string, unknown>): string {
      return JSON.stringify({
        intent: 'UNSUPPORTED',
        slots: {},
        citedSignalIds: [],
        citedFactKeys: [],
        reasonCodes: [],
      });
    },
    extractFactTokens(facts: Record<string, unknown>): { times: string[]; places: string[] } {
      const times = Array.isArray(facts.validTimes) ? (facts.validTimes as string[]) : [];
      const places = Array.isArray(facts.validPlaces) ? (facts.validPlaces as string[]) : [];
      return { times, places };
    },
  }),
});

/**
 * Retrieves a server template by ID.
 */
export function getTemplate(id: string): ServerTemplate | undefined {
  return SERVER_TEMPLATES[id];
}

export interface ValidationSuccess {
  readonly valid: true;
  readonly template: ServerTemplate;
  readonly facts: Record<string, unknown>;
}

export interface ValidationFailure {
  readonly valid: false;
  readonly statusCode: number;
  readonly error: string;
}

export type TemplateValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates an incoming HTTP request body for `/api/model/refine`.
 * Enforces:
 * - Reject presence of `templateWording` field with 400.
 * - Require `templateId` (string).
 * - Require registered `templateId` (400 if unknown).
 * - Require `facts` object.
 * - Validate `facts` strictly against template schema rules (400 on violation).
 */
export function validateTemplateRequest(body: unknown): TemplateValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Invalid JSON payload: expected a JSON object',
    };
  }

  const payload = body as Record<string, unknown>;

  // Requirement 1: client-supplied templateWording is prohibited!
  if ('templateWording' in payload) {
    return {
      valid: false,
      statusCode: 400,
      error:
        'Client-supplied templateWording is not accepted; prompts are managed server-side by templateId',
    };
  }

  // Requirement 2: templateId must be present and known
  const templateId = payload.templateId;
  if (typeof templateId !== 'string' || !templateId.trim()) {
    return {
      valid: false,
      statusCode: 400,
      error: "Missing required 'templateId' parameter",
    };
  }

  const template = getTemplate(templateId.trim());
  if (!template) {
    return {
      valid: false,
      statusCode: 400,
      error: `Unknown templateId '${templateId}'; must be one of: ${Object.keys(SERVER_TEMPLATES).join(', ')}`,
    };
  }

  // Requirement 3: facts must be an object and strictly valid
  const facts = payload.facts;
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return {
      valid: false,
      statusCode: 400,
      error: "Missing required 'facts' parameter",
    };
  }

  const factValidation = validateFactsSchema(facts, template.allowedFactRules);
  if (!factValidation.valid) {
    return {
      valid: false,
      statusCode: 400,
      error: factValidation.error,
    };
  }

  return {
    valid: true,
    template,
    facts: factValidation.validatedFacts,
  };
}
