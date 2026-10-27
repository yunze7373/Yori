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

import type { PreparedPlan } from '../../core/contracts/index.js';
import { formatTime, escapeHtml } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';

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
    default:
      return kind.replace(/[_-]/g, ' ');
  }
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
  if (key.includes('taste')) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
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

export function buildHumanDerivation(plan: PreparedPlan): string {
  const tz = plan.timezone;
  if (plan.intentId === 'depart') {
    const subject = plan.subjectTitle || 'Your upcoming appointment';
    const apptTime = formatTime(plan.apptAt, tz);
    const prepareTime = formatTime(plan.prepareAt, tz);
    const leaveTime = formatTime(plan.leaveAt, tz);

    if (apptTime && prepareTime && leaveTime) {
      return `${subject} is scheduled at ${apptTime}. Based on live route estimates and your preparation routine, we scheduled preparation to start at ${prepareTime} and departure by ${leaveTime}.`;
    }
  }

  if (plan.intentId === 'lunch') {
    return 'Detected that you are away from home during a free schedule window. Recommended places within walking distance that align with your confirmed taste preferences.';
  }

  // Fallback: sanitize any raw derivation string from internal formulas
  return (
    plan.why.derivation
      .replace(/appt\s*-\s*travel\s*-\s*buffer/gi, 'travel time and buffer')
      .replace(/[_-]/g, ' ') || 'Derived automatically from context signals and your confirmed preferences.'
  );
}

export function renderWhySheet(plan: PreparedPlan): string {
  const tz = plan.timezone;
  const signals = plan.why.evidenceSignals;
  const memoryFacts = plan.why.memoryFactsUsed;
  const derivationText = buildHumanDerivation(plan);

  return `
    <div class="modal-backdrop" id="why-sheet-backdrop" role="presentation">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="why-sheet-title">
        <div class="modal-header">
          <h2 id="why-sheet-title" class="modal-title">${escapeHtml(STRINGS.whySheet.title)}</h2>
          <button type="button" class="btn-close" id="btn-close-why" aria-label="${escapeHtml(STRINGS.whySheet.close)}">&times;</button>
        </div>

        <div class="modal-body">
          <!-- Evidence Section -->
          <section class="why-section" aria-labelledby="why-evidence-heading">
            <h3 id="why-evidence-heading" class="why-section-title">${escapeHtml(STRINGS.whySheet.evidenceTitle)}</h3>
            <div class="why-item-list">
              ${
                signals.length > 0
                  ? signals
                      .map(sig => {
                        const timeStr = formatTime(sig.issuedAt, tz);
                        const isSim = sig.source === 'simulated';
                        return `
                        <div class="why-item-row">
                          <div class="why-item-main">
                            <span class="why-item-label">${escapeHtml(humanizeSignalKind(sig.kind))}</span>
                            ${
                              sig.description
                                ? `<span class="why-item-desc">${escapeHtml(sig.description)}</span>`
                                : ''
                            }
                            ${
                              timeStr
                                ? `<span class="why-item-time">Recorded at ${escapeHtml(timeStr)}</span>`
                                : ''
                            }
                          </div>
                          <span class="card-badge ${isSim ? 'badge-simulated' : 'badge-real'}">
                            ${escapeHtml(isSim ? STRINGS.header.simulatedBadge : 'REAL')}
                          </span>
                        </div>
                      `;
                      })
                      .join('')
                  : `<p class="why-empty-text">${escapeHtml(STRINGS.whySheet.noEvidence)}</p>`
              }
            </div>
          </section>

          <!-- Memory Facts Section -->
          <section class="why-section" aria-labelledby="why-memory-heading">
            <h3 id="why-memory-heading" class="why-section-title">${escapeHtml(STRINGS.whySheet.memoryTitle)}</h3>
            <div class="why-item-list">
              ${
                memoryFacts.length > 0
                  ? memoryFacts
                      .map(fact => `
                      <div class="why-item-row">
                        <div class="why-item-main">
                          <span class="why-item-label">${escapeHtml(humanizeMemoryKey(fact.key))}</span>
                          <span class="why-item-desc">${escapeHtml(humanizeMemoryValue(fact.key, fact.value))}</span>
                        </div>
                        <span class="card-badge badge-confirmed">Confirmed</span>
                      </div>
                    `)
                      .join('')
                  : `<p class="why-empty-text">${escapeHtml(STRINGS.whySheet.noMemory)}</p>`
              }
            </div>
          </section>

          <!-- Derivation Section -->
          <section class="why-section" aria-labelledby="why-derivation-heading">
            <h3 id="why-derivation-heading" class="why-section-title">${escapeHtml(STRINGS.whySheet.derivationTitle)}</h3>
            <p class="why-derivation-text">${escapeHtml(derivationText)}</p>
          </section>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-primary" id="btn-why-sheet-done">${escapeHtml(STRINGS.whySheet.close)}</button>
        </div>
      </div>
    </div>
  `;
}
