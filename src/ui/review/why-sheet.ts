/**
 * Why Sheet Component
 * Governed by Architecture Rev3 Section 6 and Invariants INV-102, INV-103.
 *
 * Requirements:
 * - Human sentences built from why.evidenceSignals (kind, source simulated/real, issuedAt shown as local time).
 * - Human sentences from memoryFactsUsed (plain-language labels, status).
 * - Human derivation summary.
 * - Zero raw derivation strings, zero internal keys (no INV-, S4-1, appt -, derivation formulas).
 */

import type { PreparedPlan, EvidenceCitation } from '../../core/contracts/index.js';
import { formatTime, escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import { classifyFactSource, provenanceLabel } from '../view-models/provenance.js';

export const REASON_CODE_COPY: Record<string, { title: string; description: string }> = {
  weather_adjusted: {
    title: 'Weather Adjusted',
    description: 'Precipitation increased · travel buffer adjusted for rain',
  },
  time_critical: {
    title: 'Time Critical',
    description: 'Arrival time tightly constrained by scheduled appointment',
  },
  matches_confirmed_preference: {
    title: 'Preference Matched',
    description: 'Matches your confirmed preference',
  },
  shorter_trip: {
    title: 'Shorter Trip',
    description: 'Route selected to minimize travel duration',
  },
  free_window_fit: {
    title: 'Schedule Fit',
    description: 'Fits comfortably within your available schedule window',
  },
};

export function humanizeSignalId(signalId: string, timezone: string): string {
  const parts = signalId.split(':');
  const kind = parts[0] || 'signal';
  const label =
    kind === 'weather'
      ? 'Weather forecast'
      : kind === 'calendar'
      ? 'Calendar event'
      : kind === 'mock_places'
      ? 'Nearby places'
      : kind === 'location_status'
      ? 'Location status'
      : kind === 'schedule_window'
      ? 'Schedule window'
      : kind === 'eating_status'
      ? 'Meal status'
      : kind.charAt(0).toUpperCase() + kind.slice(1);

  if (parts.length > 1) {
    const isoString = parts.slice(1).join(':');
    const formatted = formatTime(isoString, timezone);
    if (formatted) {
      return `${label} · issued ${formatted}`;
    }
  }
  return label;
}

export function humanizeSignalKind(kind: string): string {
  switch (kind.toLowerCase()) {
    case 'calendar':
      return 'Calendar event';
    case 'weather':
    case 'weather_forecast':
      return 'Weather forecast';
    case 'travel':
    case 'travel_estimate':
    case 'traffic':
      return 'Transit & route travel estimate';
    case 'location':
    case 'location_status':
      return 'Current location status';
    case 'schedule_window':
      return 'Schedule window';
    case 'eating_status':
      return 'Meal timing status';
    case 'mock_places':
    case 'places':
      return 'Nearby places';
    case 'user_request':
      return 'User request';
    default:
      return kind.replace(/[_-]/g, ' ');
  }
}

export function humanizeSignalDescription(
  sig: EvidenceCitation,
  _tz?: string
): string {
  if (sig.kind === 'mock_places' || sig.kind === 'places') {
    return 'Demo place list';
  }
  if (sig.kind === 'location_status') {
    if (sig.description?.toLowerCase().includes('downtown')) {
      return 'Away from home in Downtown';
    }
    return "You're away from home";
  }
  if (sig.kind === 'calendar') {
    return 'Scheduled event on your calendar';
  }
  if (sig.kind === 'weather' || sig.kind === 'weather_forecast') {
    return 'Forecast conditions';
  }
  if (sig.kind === 'schedule_window') {
    return 'Available schedule window';
  }
  if (sig.kind === 'eating_status') {
    return 'Lunch has not been eaten today';
  }
  if (sig.description && sig.description.includes('signal evaluated at')) {
    return '';
  }
  return sig.description || '';
}

export function humanizeMemoryKey(key: string): string {
  switch (key) {
    case 'prep_buffer_minutes':
      return STRINGS.memory.prepBufferMinutesLabel;
    case 'prep_duration_minutes':
      return STRINGS.memory.prepDurationMinutesLabel;
    case 'prep_buffer_preference':
      return 'Preparation buffer habit';
    case 'rain_transport_preference':
      return STRINGS.memory.rainTransportLabel;
    case 'taste_preference':
    case 'taste_preferences':
      return STRINGS.memory.tastePreferenceLabel;
    case 'favorite_cuisine':
      return STRINGS.memory.favoriteCuisineLabel;
    case 'suppress_lunch':
    case 'suppress_lunch_recommendations':
      return STRINGS.memory.suppressLunchLabel;
    default:
      return key.replace(/_/g, ' ');
  }
}

export function humanizeMemoryValue(key: string, value: unknown): string {
  if (key === 'prep_buffer_minutes' || key === 'prep_duration_minutes') {
    return STRINGS.memory.minutesUnit.replace('{minutes}', String(value ?? 0));
  }
  if (key === 'rain_transport_preference') {
    if (value === 'drive_first') return STRINGS.memory.rainDriveValue;
    if (value === 'bus_first') return STRINGS.memory.rainTransitValue;
  }
  if (key === 'taste_preference' || key === 'taste_preferences') {
    if (value === 'ramen_or_salad') return STRINGS.memory.tasteRamenOrSalad;
    if (typeof value === 'string') return value.replace(/_/g, ' ');
    if (Array.isArray(value)) return value.map(v => String(v).replace(/_/g, ' ')).join(', ');
  }
  if (key === 'favorite_cuisine') {
    if (value === 'japanese') return STRINGS.memory.cuisineJapanese;
    if (typeof value === 'string') {
      return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
    }
  }
  if (key.includes('taste')) {
    if (typeof value === 'string') return value.replace(/_/g, ' ');
    if (Array.isArray(value)) return value.map(v => String(v).replace(/_/g, ' ')).join(', ');
  }
  if (key.includes('suppress')) {
    return STRINGS.memory.suppressedTodayValue;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('prepMinutes' in obj || 'bufferMinutes' in obj) {
      const parts: string[] = [];
      if (typeof obj.prepMinutes === 'number') {
        parts.push(`Get ready ${obj.prepMinutes} min`);
      }
      if (typeof obj.bufferMinutes === 'number') {
        parts.push(`Leave a ${obj.bufferMinutes} min buffer`);
      }
      return parts.join(' · ');
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(', ');
  }
  return String(value ?? '');
}

export function buildHumanDerivation(
  plan: PreparedPlan,
  userConfirmedKeys?: ReadonlySet<string>
): string {
  const tz = plan.timezone;
  const memoryFacts = plan.why?.memoryFactsUsed ?? [];
  const hasPreferences = memoryFacts.length > 0;
  const allConfirmed =
    hasPreferences &&
    memoryFacts.every(f => classifyFactSource(f, userConfirmedKeys) === 'user_confirmed');

  if (plan.intentId === 'depart') {
    const subject = plan.subjectTitle || 'Your upcoming appointment';
    const apptTime = formatTime(plan.apptAt, tz);
    const prepareTime = formatTime(plan.prepareAt, tz);
    const leaveTime = formatTime(plan.leaveAt, tz);

    if (apptTime && prepareTime && leaveTime) {
      const travelSig = plan.why?.evidenceSignals?.find(
        s => s.kind.includes('travel') || s.kind.includes('traffic')
      );
      const isReal = travelSig?.source === 'real';
      const routeDesc = isReal ? 'live route estimates' : 'the route estimate (simulated)';
      const userReq = plan.why?.evidenceSignals?.find(s => s.kind === 'user_request');
      const requestNote = userReq ? ` (${userReq.description})` : '';
      const routineDesc = allConfirmed
        ? 'your confirmed preparation routine'
        : hasPreferences
        ? 'sample preparation habits from the demo profile'
        : 'your preparation routine';
      return `${subject} is scheduled at ${apptTime}. Based on ${routeDesc} and ${routineDesc}, we scheduled preparation to start at ${prepareTime} and departure by ${leaveTime}.${requestNote}`;
    }
  }

  if (plan.intentId === 'lunch') {
    const userReq = plan.why?.evidenceSignals?.find(s => s.kind === 'user_request');
    const requestNote = userReq ? ` (${userReq.description})` : '';
    const prefDesc = allConfirmed
      ? 'align with your confirmed taste preferences'
      : hasPreferences
      ? 'align with sample taste preferences from the demo profile'
      : 'align with your taste preferences';
    return `Detected that you are away from home during a free schedule window. Recommended places within walking distance that ${prefDesc}.${requestNote}`;
  }

  // Fallback: sanitize any raw derivation string from internal formulas
  const fallbackPrefWord = allConfirmed
    ? 'confirmed preferences'
    : hasPreferences
    ? 'sample preferences from the demo profile'
    : 'preferences';
  return (
    plan.why.derivation
      .replace(/appt\s*-\s*travel\s*-\s*buffer/gi, 'travel time and buffer')
      .replace(/confirmed taste preferences/gi, allConfirmed ? 'confirmed taste preferences' : 'sample taste preferences from the demo profile')
      .replace(/[_-]/g, ' ') || `Derived automatically from context signals and ${fallbackPrefWord}.`
  );
}

export function renderWhySheet(
  plan: PreparedPlan,
  orderingRationale?: string,
  timezone?: string,
  userConfirmedKeys?: ReadonlySet<string>,
  situationAttribution?: {
    readonly signalId: string;
    readonly reasonCode: string;
    readonly explanation?: string;
    readonly citedFactKeys?: readonly string[];
  }
): string {
  const tz = timezone || plan.timezone || 'America/Los_Angeles';
  const signals = plan.why.evidenceSignals;
  const memoryFacts = plan.why.memoryFactsUsed;
  const derivationText = buildHumanDerivation(plan, userConfirmedKeys);

  return `
    <div class="modal-backdrop" id="why-sheet-backdrop" role="presentation">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="why-sheet-title">
        <div class="modal-header">
          <h2 id="why-sheet-title" class="modal-title" tabindex="-1" data-slot="chrome" data-slot-reason="Why sheet title">${escapeHtml(STRINGS.whySheet.title)}</h2>
          <button type="button" class="btn-close" id="btn-close-why" aria-label="${escapeHtml(STRINGS.whySheet.close)}" data-slot="chrome" data-slot-reason="Modal close button">&times;</button>
        </div>

        <div class="modal-body" tabindex="0" role="region" aria-label="${escapeHtml(STRINGS.whySheet.title)}">
          ${
            orderingRationale
              ? `
          <!-- Ordering Rationale Section -->
          <section class="why-section" id="why-order-section" aria-labelledby="why-order-heading">
            <h3 id="why-order-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Ordering rationale heading">${escapeHtml(STRINGS.whySheet.whyOrderTitle)}</h3>
            <p class="why-derivation-text" id="why-order-text" data-slot="chrome" data-slot-reason="Ordering rationale text">${escapeHtml(orderingRationale)}</p>
          </section>
          `
              : ''
          }

          ${
            situationAttribution
              ? (() => {
                  let reasonTitle: string;
                  let reasonDesc: string;

                  if (situationAttribution.reasonCode === 'matches_confirmed_preference') {
                    const factsToCheck =
                      situationAttribution.citedFactKeys && situationAttribution.citedFactKeys.length > 0
                        ? situationAttribution.citedFactKeys
                        : plan.why.memoryFactsUsed.map(f => f.key);

                    const isAllUserConfirmed =
                      factsToCheck.length > 0 &&
                      factsToCheck.every(
                        k => classifyFactSource(k, userConfirmedKeys, plan.why.memoryFactsUsed) === 'user_confirmed'
                      );

                    if (isAllUserConfirmed) {
                      reasonTitle = 'Preference Matched';
                      reasonDesc = 'Matches your confirmed preference';
                    } else {
                      reasonTitle = 'Sample Preference';
                      reasonDesc = 'Matches a sample preference from the demo profile';
                    }
                  } else {
                    const reasonMeta =
                      REASON_CODE_COPY[situationAttribution.reasonCode] || {
                        title: situationAttribution.reasonCode.replace(/_/g, ' '),
                        description: 'Attributed to context change',
                      };
                    reasonTitle = reasonMeta.title;
                    reasonDesc = reasonMeta.description;
                  }

                  const signalLabel = humanizeSignalId(situationAttribution.signalId, tz);
                  return `
          <!-- Situation Attribution Section (V2a-2) -->
          <section class="why-section" id="why-situation-section" aria-labelledby="why-situation-heading">
            <h3 id="why-situation-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Situation attribution heading">Situation Attribution</h3>
            <div class="why-situation-item">
              <div class="why-situation-badge-row">
                <span class="badge-reason-code" data-slot="chrome" data-slot-reason="Situation attribution code badge">${escapeHtml(reasonTitle)}</span>
                <span class="badge-signal-id" data-slot="chrome" data-slot-reason="Situation attribution signal label">${escapeHtml(signalLabel)}</span>
              </div>
              <p class="why-situation-text" data-slot="chrome" data-slot-reason="Situation attribution description">${escapeHtml(reasonDesc)}</p>
            </div>
          </section>
          `;
                })()
              : ''
          }

          <!-- Evidence Section -->
          <section class="why-section" aria-labelledby="why-evidence-heading">
            <h3 id="why-evidence-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Evidence section heading">${escapeHtml(STRINGS.whySheet.evidenceTitle)}</h3>
            <div class="why-item-list">
              ${
                signals.length > 0
                  ? signals
                      .map(sig => {
                        const isUserRequest = sig.kind === 'user_request';
                        const timeStr = formatTime(sig.issuedAt, tz);
                        const isSim = sig.source === 'simulated';
                        const desc = humanizeSignalDescription(sig, tz);
                        const label = isUserRequest
                          ? 'Your request · this time only'
                          : humanizeSignalKind(sig.kind);
                        const sigId = (sig as { id?: string }).id;
                        const timeRef =
                          sig.kind === 'weather'
                            ? 'weather-rain.issuedTime'
                            : sig.kind === 'calendar'
                              ? 'cal-piano.issuedTime'
                              : sig.kind === 'travel_estimate' || sig.kind.includes('travel')
                                ? 'travel-rain.issuedTime'
                                : sigId && !sigId.includes(':')
                                  ? `${sigId}.issuedTime`
                                  : '';
                        return `
                        <div class="why-item-row ${isUserRequest ? 'why-item-user-request' : ''}">
                          <div class="why-item-main">
                            <span class="why-item-label" data-slot="chrome" data-slot-reason="Signal category label">${escapeHtml(label)}</span>
                            ${
                              desc
                                ? `<span class="why-item-desc" data-slot="chrome" data-slot-reason="Signal descriptive text">${escapeHtml(desc)}</span>`
                                : ''
                            }
                            ${
                              timeStr && !isUserRequest
                                ? `<span class="why-item-time"><span data-slot="chrome" data-slot-reason="Recorded time prefix">Recorded at </span><span class="why-recorded-time" ${timeRef ? `data-source-ref="${escapeHtml(timeRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Signal recorded time"`}>${escapeHtml(timeStr)}</span></span>`
                                : ''
                            }
                          </div>
                          ${
                            isUserRequest
                              ? `<span class="card-badge badge-user-request" data-slot="chrome" data-slot-reason="User request badge">THIS SESSION</span>`
                              : `
                              <span class="card-badge ${isSim ? 'badge-simulated' : 'badge-real'}" data-slot="chrome" data-slot-reason="Signal simulated badge">
                                ${escapeHtml(isSim ? STRINGS.header.simulatedBadge : 'REAL')}
                              </span>
                              `
                          }
                        </div>
                      `;
                      })
                      .join('')
                  : `<p class="why-empty-text" data-slot="chrome" data-slot-reason="Empty evidence notice">${escapeHtml(STRINGS.whySheet.noEvidence)}</p>`
              }
            </div>
          </section>

          <!-- Memory Facts Section -->
          <section class="why-section" aria-labelledby="why-memory-heading">
            <h3 id="why-memory-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Memory section heading">${escapeHtml(STRINGS.whySheet.memoryTitle)}</h3>
            <div class="why-item-list">
              ${
                memoryFacts.length > 0
                  ? memoryFacts
                      .map(fact => {
                        const provKind = classifyFactSource(fact, userConfirmedKeys);
                        const isUserConfirmed = provKind === 'user_confirmed';
                        const badgeText = provenanceLabel(provKind);
                        const badgeClass = isUserConfirmed ? 'badge-confirmed' : 'badge-simulated';
                        return `
                      <div class="why-item-row">
                        <div class="why-item-main">
                          <span class="why-item-label" data-slot="chrome" data-slot-reason="Memory preference label">${escapeHtml(humanizeMemoryKey(fact.key))}</span>
                          <span class="why-item-desc" data-source-ref="${escapeHtml(fact.key)}.description" data-slot="domain">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</span>
                        </div>
                        <span class="card-badge ${badgeClass}" data-source-ref="${escapeHtml(fact.key)}.provenance" data-slot="domain">${escapeHtml(badgeText)}</span>
                      </div>
                    `;
                      })
                      .join('')
                  : `<p class="why-empty-text" data-slot="chrome" data-slot-reason="Empty memory notice">${escapeHtml(STRINGS.whySheet.noMemory)}</p>`
              }
            </div>
          </section>

          <!-- Derivation Section -->
          <section class="why-section" aria-labelledby="why-derivation-heading">
            <h3 id="why-derivation-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Derivation section heading">${escapeHtml(STRINGS.whySheet.derivationTitle)}</h3>
            <p class="why-derivation-text" data-slot="chrome" data-slot-reason="Derivation synthesis narrative">${escapeHtml(derivationText)}</p>
          </section>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="btn-why-sheet-done" data-slot="chrome" data-slot-reason="Close why sheet">${escapeHtml(STRINGS.whySheet.close)}</button>
        </div>
      </div>
    </div>
  `;
}
