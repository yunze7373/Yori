/**
 * V2 Scene-Driven Home View Component (LIVING_CONTEXT_V2.md §4)
 *
 * Implements:
 * - Information-value driven layout (Journey vs Candidates vs Quiet).
 * - Prominent route map for travel/rain; compact map for lunch candidates.
 * - Local labelled SVG illustrations for candidate cards.
 * - Departure timeline with steps and arrival buffers.
 * - Collapsed empty blocks (no empty fixed NOW/AHEAD/FOR YOU placeholders).
 * - Full button and event compatibility with existing review loops.
 */

import { escapeHtml } from './presentation.js';
import { STRINGS } from './strings.js';
import type { HomeCompositionVM, MapVM } from '../view-models/index.js';

function renderMapSvg(map: MapVM): string {
  const isProminent = map.sizeHint === 'prominent';
  const viewBoxHeight = isProminent ? 180 : 130;

  return `
    <div class="v2-map-canvas ${map.sizeHint}" role="img" aria-label="${escapeHtml(map.ariaDescription)}">
      <svg width="100%" height="100%" viewBox="0 0 340 ${viewBoxHeight}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="100%" height="100%" fill="#E9F1E8" rx="14"/>

        <!-- Abstract schematic street grid (simulated, no fake roads) -->
        <line x1="20" y1="45" x2="320" y2="45" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
        <line x1="20" y1="115" x2="320" y2="115" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
        ${
          isProminent
            ? `<line x1="20" y1="155" x2="320" y2="155" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>`
            : ''
        }
        <line x1="90" y1="15" x2="90" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
        <line x1="210" y1="15" x2="210" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
        <line x1="275" y1="15" x2="275" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>

        <!-- Route Polylines -->
        ${map.polylines
          .map(
            poly => `
          <polyline
            id="${poly.id}"
            points="${poly.points}"
            stroke="${poly.strokeColor}"
            stroke-width="${poly.strokeWidth}"
            stroke-linecap="round"
            stroke-linejoin="round"
            ${poly.strokeDasharray ? `stroke-dasharray="${poly.strokeDasharray}"` : ''}
          />
        `
          )
          .join('')}

        <!-- Weather Callout on Map if rain is present -->
        ${
          map.weatherCallout
            ? `
          <g class="v2-map-weather-callout" transform="translate(${map.weatherCallout.x - 94}, ${map.weatherCallout.y - 18})">
            <rect width="188" height="38" rx="8" fill="var(--color-primary-btn)" opacity="0.95"/>
            <text x="94" y="14" fill="#FFFFFF" font-size="12" font-weight="700" text-anchor="middle" font-family="var(--font-sans)" data-source-ref="weather-rain.calloutText" data-slot="domain">
              ${escapeHtml(map.weatherCallout.text)}
            </text>
            <text x="94" y="30" fill="#E2EAE5" font-size="12" text-anchor="middle" font-family="var(--font-sans)" data-source-ref="weather-rain.calloutSubtext" data-slot="domain">
              ${escapeHtml(map.weatherCallout.subtext || '')}
            </text>
          </g>
        `
            : ''
        }

        <!-- Markers -->
        ${map.markers
          .map(m => {
            if (m.type === 'origin') {
              return `
                <g class="v2-map-marker origin" transform="translate(${m.x}, ${m.y})">
                  <circle cx="0" cy="0" r="6" fill="#16382F"/>
                  <circle cx="0" cy="0" r="10" stroke="#16382F" stroke-width="1.5" opacity="0.4"/>
                  <text x="0" y="18" fill="#16382F" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">
                    ${escapeHtml(m.label)}
                  </text>
                </g>
              `;
            }
            if (m.type === 'destination') {
              return `
                <g class="v2-map-marker destination" transform="translate(${m.x}, ${m.y})">
                  <circle cx="0" cy="0" r="8" fill="#2D6A4F"/>
                  <circle cx="0" cy="0" r="14" stroke="#2D6A4F" stroke-width="2" stroke-dasharray="4 2"/>
                  <text x="0" y="-12" fill="#16382F" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">
                    ${escapeHtml(m.label)}
                  </text>
                </g>
              `;
            }
            // Candidate place marker
            // Shorten demo place labels in schematic map (e.g. 'A · Ramen', 'C · Sushi') to prevent SVG edge clipping while cards retain full names
            const mapPlaceLabel = m.label.replace(/^Demo Place /, '');
            return `
              <g class="v2-map-marker place ${m.isHighlight ? 'highlight' : ''}" transform="translate(${m.x}, ${m.y})">
                <circle cx="0" cy="0" r="${m.isHighlight ? 7 : 5}" fill="${m.isHighlight ? '#2D6A4F' : '#5B6B65'}"/>
                ${m.isHighlight ? '<circle cx="0" cy="0" r="11" stroke="#2D6A4F" stroke-width="1.5" opacity="0.5"/>' : ''}
                <text x="0" y="${m.y < 70 ? -10 : 16}" fill="#16382F" font-size="12" font-weight="${m.isHighlight ? '700' : '500'}" text-anchor="middle" font-family="sans-serif">
                  ${escapeHtml(mapPlaceLabel)}
                </text>
              </g>
            `;
          })
          .join('')}
      </svg>
    </div>
  `;
}

export function renderMapCard(map: MapVM): string {
  const isPlacesMap = map.label.toLowerCase().includes('places');
  const mobileLabel = isPlacesMap
    ? (STRINGS.map.mobilePlacesLabel || 'Places Map')
    : (STRINGS.map.mobileLabel || 'Route Map');

  return `
    <section class="card v2-map-card ${map.sizeHint}" aria-label="${escapeHtml(map.label)}">
      <div class="map-header">
        <span class="section-label" data-slot="chrome" data-slot-reason="Map section heading"><span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span></span>
        <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated map badge">${escapeHtml(map.simulatedBadge)}</span>
      </div>
      ${renderMapSvg(map)}
      <div class="map-place-info" ${
        map.fieldSourceRefs?.destinationName
          ? `data-source-ref="${escapeHtml(map.fieldSourceRefs.destinationName.recordId)}.${escapeHtml(map.fieldSourceRefs.destinationName.field)}" data-slot="domain"`
          : `data-slot="chrome" data-slot-reason="Map schematic destination label"`
      }>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        ${escapeHtml(map.destinationName)}
      </div>
    </section>
  `;
}

function renderActionRow(vm: HomeCompositionVM): string {
  const planId = vm.planId || '';
  if (vm.isAccepted) {
    return `
      <div class="action-row" aria-label="Plan Actions">
        <span class="badge-accepted" data-slot="chrome" data-slot-reason="Plan accepted status badge">${escapeHtml(STRINGS.actions.accepted)}</span>
        <button type="button" class="btn btn-outline" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Undo action button">
          ${escapeHtml(STRINGS.actions.undo)}
        </button>
        <button type="button" class="btn btn-outline v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
          Details →
        </button>
        <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
          ${escapeHtml(STRINGS.actions.why)}
        </button>
      </div>
    `;
  }
  if (vm.canUndo) {
    return `
      <div class="action-row" aria-label="Plan Actions">
        <span class="badge-accepted" data-slot="chrome" data-slot-reason="Plan updated status badge">Updated</span>
        <button type="button" class="btn btn-primary" id="btn-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Accept plan button">
          ${escapeHtml(STRINGS.actions.accept)}
        </button>
        <button type="button" class="btn btn-outline" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Undo action button">
          ${escapeHtml(STRINGS.actions.undo)}
        </button>
        <button type="button" class="btn btn-outline v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
          Details →
        </button>
        <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
          ${escapeHtml(STRINGS.actions.why)}
        </button>
      </div>
    `;
  }
  return `
    <div class="action-row" aria-label="Plan Actions">
      <button type="button" class="btn btn-primary" id="btn-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Accept plan button">
        ${escapeHtml(STRINGS.actions.accept)}
      </button>
      <button type="button" class="btn btn-outline" id="btn-adjust" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Adjust plan button">
        ${escapeHtml(STRINGS.actions.adjust)}
      </button>
      <button type="button" class="btn btn-outline v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
        Details →
      </button>
      <button type="button" class="btn btn-outline" id="btn-dismiss" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Dismiss plan button">
        ${escapeHtml(STRINGS.actions.dismiss)}
      </button>
      <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
        ${escapeHtml(STRINGS.actions.why)}
      </button>
    </div>
  `;
}

export function renderLocationControls(vm: HomeCompositionVM): string {
  const isPrompt = vm.locationState === 'prompt';
  const isDenied = vm.locationState === 'denied';
  const isUnavailable = vm.locationState === 'unavailable';

  return `
    <div class="v2-location-controls" role="region" aria-label="Location Controls">
      ${
        isPrompt
          ? `
        <div class="v2-location-notice-banner prompt" role="status">
          <div class="v2-location-notice-title">Location Permission Needed</div>
          <div class="v2-location-notice-desc">Grant permission to discover nearby fuel stations or select a location manually.</div>
        </div>
        <div class="v2-location-action-row">
          <button type="button" class="btn btn-primary v2-location-btn" id="btn-request-location" aria-label="Use My Location">
            Use My Location
          </button>
          <button type="button" class="btn btn-outline v2-location-btn" id="btn-deny-location" aria-label="Deny Location Access">
            Deny
          </button>
        </div>
      `
          : isDenied
          ? `
        <div class="v2-location-notice-banner denied" role="status">
          <div class="v2-location-notice-title">Location Access Denied</div>
          <div class="v2-location-notice-desc">Location access was denied. You can select a city or enter coordinates manually below.</div>
        </div>
        <div class="v2-location-action-row">
          <button type="button" class="btn btn-outline v2-location-btn" id="btn-request-location" aria-label="Retry Location Access">
            Try Again
          </button>
        </div>
      `
          : isUnavailable
          ? `
        <div class="v2-location-notice-banner unavailable" role="status">
          <div class="v2-location-notice-title">Location Unavailable</div>
          <div class="v2-location-notice-desc">${escapeHtml(
            vm.locationNotice ||
              'Unable to acquire current position. Please select a city or enter coordinates manually.'
          )}</div>
        </div>
      `
          : ''
      }

      <div class="v2-manual-location-container">
        <button
          type="button"
          class="btn btn-outline v2-manual-toggle-btn"
          id="btn-manual-location-toggle"
          aria-expanded="true"
          aria-controls="v2-manual-location-section"
        >
          Enter Location Manually
        </button>

        <div class="v2-manual-location-section" id="v2-manual-location-section">
          <div class="v2-city-chips-label">Demo City Presets:</div>
          <div class="v2-city-chips-group" role="group" aria-label="Demo City Presets">
            <button type="button" class="btn btn-outline v2-city-chip" id="btn-city-sf" data-lat="37.7749" data-lng="-122.4194">
              San Francisco
            </button>
            <button type="button" class="btn btn-outline v2-city-chip" id="btn-city-la" data-lat="34.0522" data-lng="-118.2437">
              Los Angeles
            </button>
          </div>

          <form class="v2-coords-form" id="v2-coords-form" onsubmit="return false;">
            <div class="v2-coords-inputs">
              <div class="v2-input-field">
                <label for="input-manual-lat" class="v2-input-label">Latitude</label>
                <input
                  type="number"
                  step="any"
                  id="input-manual-lat"
                  class="v2-coords-input"
                  placeholder="37.7749"
                  value="37.7749"
                  aria-label="Manual Latitude"
                />
              </div>
              <div class="v2-input-field">
                <label for="input-manual-lng" class="v2-input-label">Longitude</label>
                <input
                  type="number"
                  step="any"
                  id="input-manual-lng"
                  class="v2-coords-input"
                  placeholder="-122.4194"
                  value="-122.4194"
                  aria-label="Manual Longitude"
                />
              </div>
            </div>
            <button type="button" class="btn btn-primary v2-coords-apply-btn" id="btn-apply-manual-coords">
              Set Coordinates
            </button>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function renderV2Home(vm: HomeCompositionVM): string {
  // 1. Quiet State
  if (vm.layoutKind === 'quiet') {
    return `
      <div class="v2-home-container quiet">
        <section class="card quiet-card" aria-label="Quiet State">
          <div class="quiet-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
            </svg>
          </div>
          <h2 class="quiet-title">${escapeHtml(vm.title)}</h2>
          <p class="quiet-subtitle">${escapeHtml(vm.headline)}</p>
          ${vm.basis ? `<p class="quiet-basis">${escapeHtml(vm.basis)}</p>` : ''}
          ${vm.locationState ? renderLocationControls(vm) : ''}
        </section>
      </div>
    `;
  }

  // 2. Journey Layout (Depart / Rain)
  if (vm.layoutKind === 'journey') {
    return `
      <div class="v2-home-container journey">
        <!-- Weather / Insight Alert Banner -->
        ${
          vm.isRain && vm.rainBanner
            ? `
          <div class="v2-insight-banner" role="status">
            <div class="v2-insight-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
                <line x1="8" y1="19" x2="8" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
                <line x1="16" y1="19" x2="16" y2="21"></line>
              </svg>
            </div>
            <div class="v2-insight-body">
              <h2 class="v2-insight-title" data-source-ref="weather-rain.rainBanner" data-slot="domain">${escapeHtml(vm.rainBanner)}</h2>
              ${
                vm.weatherIssuedTime && vm.fieldSourceRefs?.weatherIssuedTime
                  ? `
                <p class="v2-insight-desc">
                  <span data-slot="chrome" data-slot-reason="Insight alert prefix">Rain in the forecast for your travel window · simulated (issued </span><span class="v2-insight-issued-time" data-source-ref="${escapeHtml(vm.fieldSourceRefs.weatherIssuedTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.weatherIssuedTime.field)}" data-slot="domain">${escapeHtml(vm.weatherIssuedTime)}</span><span data-slot="chrome" data-slot-reason="Insight alert suffix">). I've prepared an updated departure schedule.</span>
                </p>
              `
                  : `
                <p class="v2-insight-desc" data-slot="chrome" data-slot-reason="Insight alert description">${escapeHtml(vm.rainInsightDesc || "I've prepared an updated departure schedule.")}</p>
              `
              }
              ${
                vm.umbrellaChip
                  ? `
                <div class="checklist-container" aria-label="Recommended Checklist">
                  <span class="checklist-chip" id="chip-umbrella" data-slot="chrome" data-slot-reason="Checklist chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    ${escapeHtml(vm.umbrellaChip)}
                  </span>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `
            : ''
        }

        <!-- Responsive Hero Structure (Prominent Map + NOW Card) -->
        <div class="v2-journey-grid">
          ${vm.map ? renderMapCard(vm.map) : ''}

          <section class="card now-card v2-journey-card" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
            <div class="v2-card-header">
              <span class="section-label" data-slot="chrome" data-slot-reason="Section header label">${escapeHtml(STRINGS.sections.now)}</span>
              <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
              ${
                vm.fieldSourceRefs?.subjectTitle && vm.fieldSourceRefs?.apptTime && vm.apptTimeStr
                  ? `
                <h2 class="now-subject">
                  <span class="now-subject-title" data-source-ref="${escapeHtml(vm.fieldSourceRefs.subjectTitle.recordId)}.${escapeHtml(vm.fieldSourceRefs.subjectTitle.field)}" data-slot="domain">${escapeHtml(vm.subjectTitle || vm.title)}</span><span data-slot="chrome" data-slot-reason="Appointment time connector"> at </span><span class="now-subject-time" data-source-ref="${escapeHtml(vm.fieldSourceRefs.apptTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.apptTime.field)}" data-slot="domain">${escapeHtml(vm.apptTimeStr)}</span>
                </h2>
              `
                  : `
                <h2 class="now-subject" data-slot="chrome" data-slot-reason="Appointment subject heading">${escapeHtml(vm.title)}</h2>
              `
              }
              ${
                vm.fieldSourceRefs?.prepareTime && vm.fieldSourceRefs?.leaveTime && vm.prepareTimeStr && vm.leaveTimeStr
                  ? `
                <div class="now-title" id="now-title">
                  <span data-slot="chrome" data-slot-reason="Departure prep prefix">Get ready at </span><span class="now-prep-time" data-source-ref="${escapeHtml(vm.fieldSourceRefs.prepareTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.prepareTime.field)}" data-slot="domain">${escapeHtml(vm.prepareTimeStr)}</span><span data-slot="chrome" data-slot-reason="Departure leave connector">, leave by </span><span class="now-leave-time" data-source-ref="${escapeHtml(vm.fieldSourceRefs.leaveTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.leaveTime.field)}" data-slot="domain">${escapeHtml(vm.leaveTimeStr)}</span>
                </div>
              `
                  : `
                <div class="now-title" id="now-title" data-slot="chrome" data-slot-reason="Departure schedule headline">${escapeHtml(vm.headline)}</div>
              `
              }
              ${
                vm.umbrellaChip
                  ? `
                <div class="checklist-container" aria-label="Recommended Checklist">
                  <span class="checklist-chip" id="chip-umbrella" data-slot="chrome" data-slot-reason="Checklist chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    ${escapeHtml(vm.umbrellaChip)}
                  </span>
                </div>
              `
                  : ''
              }
            </div>

            <!-- Departure Timeline -->
            ${
              vm.timeline
                ? `
              <div class="v2-timeline" aria-label="${escapeHtml(vm.timeline.title)}">
                <div class="v2-timeline-track"></div>
                ${vm.timeline.steps
                  .map(
                    step => {
                      const stepTimeRef = step.sourceRef ? `${step.sourceRef.recordId}.${step.sourceRef.field}` : '';
                      const stepDetailRef = step.fieldSourceRefs?.travelMinutes
                        ? `${step.fieldSourceRefs.travelMinutes.recordId}.${step.fieldSourceRefs.travelMinutes.field}`
                        : step.fieldSourceRefs?.bufferMinutes
                          ? `${step.fieldSourceRefs.bufferMinutes.recordId}.${step.fieldSourceRefs.bufferMinutes.field}`
                          : step.fieldSourceRefs?.prepDetail
                            ? `${step.fieldSourceRefs.prepDetail.recordId}.${step.fieldSourceRefs.prepDetail.field}`
                            : '';
                      const stepLabelRef = step.fieldSourceRefs?.subjectTitle
                        ? `${step.fieldSourceRefs.subjectTitle.recordId}.${step.fieldSourceRefs.subjectTitle.field}`
                        : '';
                      let detailHtml = '';
                      if (step.detail) {
                        if (step.detail.startsWith('Take umbrella · ')) {
                          const durationText = step.detail.replace('Take umbrella · ', '');
                          detailHtml = `<span class="v2-step-detail"><span data-slot="chrome" data-slot-reason="Checklist prep prefix">Take umbrella · </span><span class="v2-step-duration" ${stepDetailRef ? `data-source-ref="${escapeHtml(stepDetailRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Timeline step detail"`}>${escapeHtml(durationText)}</span></span>`;
                        } else {
                          detailHtml = `<span class="v2-step-detail" ${stepDetailRef ? `data-source-ref="${escapeHtml(stepDetailRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Timeline step detail"`}>${escapeHtml(step.detail)}</span>`;
                        }
                      }
                      return `
                  <div class="v2-timeline-step ${step.isPrimary ? 'primary' : ''} ${step.isEvent ? 'event' : ''}">
                    <span class="v2-step-time" ${stepTimeRef ? `data-source-ref="${escapeHtml(stepTimeRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Timeline step time"`}>${escapeHtml(step.time)}</span>
                    <span class="v2-step-node" aria-hidden="true"></span>
                    <div class="v2-step-content">
                      <strong class="v2-step-label" ${stepLabelRef ? `data-source-ref="${escapeHtml(stepLabelRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Static timeline step label"`}>${escapeHtml(step.label)}</strong>
                      ${detailHtml}
                    </div>
                  </div>
                `;
                    }
                  )
                  .join('')}
              </div>
            `
                : ''
            }

            <!-- Transit Option Cards -->
            ${
              vm.options && vm.options.length > 0
                ? `
              <div class="v2-options-grid" aria-label="Travel Options">
                ${vm.options
                  .map(
                    opt => {
                      const optTitleRef = opt.fieldSourceRefs?.leaveTime
                        ? `${opt.fieldSourceRefs.leaveTime.recordId}.${opt.fieldSourceRefs.leaveTime.field}`
                        : opt.sourceRef
                          ? `${opt.sourceRef.recordId}.${opt.sourceRef.field}`
                          : '';
                      const optMetaRef = opt.fieldSourceRefs?.travelMinutes
                        ? `${opt.fieldSourceRefs.travelMinutes.recordId}.${opt.fieldSourceRefs.travelMinutes.field}`
                        : '';
                      const optBasisRef = opt.fieldSourceRefs?.rankingBasis
                        ? `${opt.fieldSourceRefs.rankingBasis.recordId}.${opt.fieldSourceRefs.rankingBasis.field}`
                        : 'rain_transport_preference.rankingBasis';
                      const optLateRef = opt.fieldSourceRefs?.lateMinutes
                        ? `${opt.fieldSourceRefs.lateMinutes.recordId}.${opt.fieldSourceRefs.lateMinutes.field}`
                        : 'user_override_timing.lateMinutes';
                      const modeLabel = opt.mode ? opt.mode.charAt(0).toUpperCase() + opt.mode.slice(1) : (opt.title.startsWith('Bus') ? 'Bus' : 'Drive');
                      const leaveTimeVal = opt.leaveTime || (opt.title.includes('leave ') ? opt.title.split('leave ')[1] : '');
                      let detailHtml = '';
                      if (opt.detail) {
                        if (opt.detail.includes('late by')) {
                          const splitIdx = opt.detail.indexOf(' · ');
                          const travelPart = splitIdx >= 0 ? opt.detail.slice(0, splitIdx) : opt.detail;
                          const latePart = splitIdx >= 0 ? opt.detail.slice(splitIdx + 3) : '';
                          detailHtml = `<div class="v2-option-meta"><span ${optMetaRef ? `data-source-ref="${escapeHtml(optMetaRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option travel meta"`}>${escapeHtml(travelPart)}</span><span data-slot="chrome" data-slot-reason="Option late connector"> · </span><span data-source-ref="${escapeHtml(optLateRef)}" data-slot="domain">${escapeHtml(latePart)}</span></div>`;
                        } else {
                          detailHtml = `<div class="v2-option-meta" ${optMetaRef ? `data-source-ref="${escapeHtml(optMetaRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option travel meta"`}>${escapeHtml(opt.detail)}</div>`;
                        }
                      }
                      return `
                  <div class="v2-option-card ${opt.isSelected ? 'selected' : ''}">
                    <div class="v2-option-top">
                      <span class="v2-option-label">
                        <span data-slot="chrome" data-slot-reason="Option mode label">${escapeHtml(modeLabel)} · leave </span><span class="v2-option-leave-time" ${optTitleRef ? `data-source-ref="${escapeHtml(optTitleRef)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option leave time"`}>${escapeHtml(leaveTimeVal || opt.title)}</span>
                      </span>
                      ${opt.badge ? `<span class="v2-option-badge ${opt.isRecommended ? 'recommended' : ''}" data-slot="chrome" data-slot-reason="Option recommendation badge">${escapeHtml(opt.badge)}</span>` : ''}
                    </div>
                    ${detailHtml}
                    ${opt.rankingBasis ? `<div class="v2-option-basis" data-source-ref="${optBasisRef}" data-slot="domain">${escapeHtml(opt.rankingBasis)}</div>` : ''}
                  </div>
                `;
                    }
                  )
                  .join('')}
              </div>
            `
                : ''
            }

            ${vm.habitNote ? `<div class="habit-note" data-source-ref="rain_transport_preference.habitNote" data-slot="domain">${escapeHtml(vm.habitNote)}</div>` : ''}

            <div class="now-basis">
              <p data-slot="chrome" data-slot-reason="Static basis template">${escapeHtml(vm.basis)}</p>
            </div>

            ${renderActionRow(vm)}
          </section>
        </div>

        ${renderCollapsibleSecondary(vm)}
      </div>
    `;
  }

  // 3. Candidates Layout (Lunch Away)
  return `
    <div class="v2-home-container candidates">
      <section class="card now-card v2-candidates-hero" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
        <div class="v2-card-header">
          <span class="section-label" data-slot="chrome" data-slot-reason="Section header label">${escapeHtml(STRINGS.sections.now)}</span>
          <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
          <h2 class="now-subject" data-slot="chrome" data-slot-reason="Candidates hero title">${escapeHtml(vm.title)}</h2>
          ${
            vm.fieldSourceRefs?.topCandidateName && vm.fieldSourceRefs?.topCandidateDistance && vm.topCandidateName && vm.topCandidateDistance
              ? `
            <div class="now-title" id="now-title">
              <span class="hero-candidate-name" data-source-ref="${escapeHtml(vm.fieldSourceRefs.topCandidateName.recordId)}.${escapeHtml(vm.fieldSourceRefs.topCandidateName.field)}" data-slot="domain">${escapeHtml(vm.topCandidateName)}</span><span data-slot="chrome" data-slot-reason="Hero candidate separator"> · </span><span class="hero-candidate-dist" data-source-ref="${escapeHtml(vm.fieldSourceRefs.topCandidateDistance.recordId)}.${escapeHtml(vm.fieldSourceRefs.topCandidateDistance.field)}" data-slot="domain">${escapeHtml(vm.topCandidateDistance)}</span>
            </div>
          `
              : `
            <div class="now-title" id="now-title" data-slot="chrome" data-slot-reason="Candidates hero headline">${escapeHtml(vm.headline)}</div>
          `
          }
          <div class="mock-places-notice" data-slot="chrome" data-slot-reason="Places disclosure notice">${escapeHtml(
            vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel')
              ? STRINGS.fuel.mockPlacesNotice
              : STRINGS.lunch.mockPlacesNotice
          )}</div>
          ${
            vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel') || Boolean(vm.locationLabel)
              ? `
            <div class="v2-active-location-bar" role="region" aria-label="Active Location" data-slot="chrome" data-slot-reason="Location status bar">
              <span class="v2-location-badge" data-slot="chrome" data-slot-reason="Simulated location status badge">📍 Location: ${escapeHtml(
                vm.locationLabel || 'Selected City (simulated)'
              )}</span>
              <button type="button" class="btn btn-outline btn-sm v2-change-loc-btn" id="btn-change-location" aria-expanded="false" aria-controls="v2-manual-location-section" data-slot="chrome" data-slot-reason="Change location button">
                Change Location
              </button>
            </div>
            <div class="v2-manual-location-section" id="v2-manual-location-section" style="display: none; margin-bottom: var(--space-4);">
              <div class="v2-city-chips-label" data-slot="chrome" data-slot-reason="City preset selector label">Demo City Presets:</div>
              <div class="v2-city-chips-group" role="group" aria-label="Demo City Presets">
                <button type="button" class="btn btn-outline v2-city-chip" id="btn-city-sf" data-lat="37.7749" data-lng="-122.4194" data-slot="chrome" data-slot-reason="City preset selection button">
                  San Francisco
                </button>
                <button type="button" class="btn btn-outline v2-city-chip" id="btn-city-la" data-lat="34.0522" data-lng="-118.2437" data-slot="chrome" data-slot-reason="City preset selection button">
                  Los Angeles
                </button>
              </div>
            </div>
          `
              : ''
          }
        </div>

        <!-- Candidate Cards with Local Labelled SVG Illustrations -->
        ${
          vm.candidateCards && vm.candidateCards.length > 0
            ? `
          <div class="v2-candidate-list" aria-label="${escapeHtml(
            vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel')
              ? 'Fuel Recommendations'
              : 'Lunch Recommendations'
          )}">
            ${vm.candidateCards
              .map(
                c => `
              <div
                class="v2-candidate-card ${c.isSelected ? 'selected' : ''}"
                id="candidate-${c.id}"
                data-candidate-id="${c.id}"
              >
                <div class="v2-candidate-art" role="img" aria-label="${escapeHtml(c.photo.altText)}">
                  ${c.photo.svgMarkup}
                  <span class="v2-illustration-badge" data-slot="chrome" data-slot-reason="Simulated illustration badge">${escapeHtml(c.photo.simulatedBadge)}</span>
                </div>
                <div class="v2-candidate-info">
                  <h3 class="v2-candidate-name" data-source-ref="${c.fieldSourceRefs?.name ? `${escapeHtml(c.fieldSourceRefs.name.recordId)}.${escapeHtml(c.fieldSourceRefs.name.field)}` : `${escapeHtml(c.id)}.name`}" data-slot="domain">${escapeHtml(c.name)}</h3>
                  <div class="v2-candidate-tags">
                    <span class="v2-cuisine-chip" ${c.fieldSourceRefs?.cuisine ? `data-source-ref="${escapeHtml(c.fieldSourceRefs.cuisine.recordId)}.${escapeHtml(c.fieldSourceRefs.cuisine.field)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Candidate category label"`}>${escapeHtml(c.cuisine)}</span>
                    <span class="v2-distance-chip" data-source-ref="${c.fieldSourceRefs?.distanceText ? `${escapeHtml(c.fieldSourceRefs.distanceText.recordId)}.${escapeHtml(c.fieldSourceRefs.distanceText.field)}` : `${escapeHtml(c.id)}.distanceText`}" data-slot="domain">${escapeHtml(c.distanceText)}</span>
                    ${c.noiseLevel === 'quiet' ? `<span class="v2-noise-chip" data-slot="chrome" data-slot-reason="Noise filter tag">Quiet</span>` : ''}
                    ${c.vegetarian ? `<span class="v2-veg-chip" data-slot="chrome" data-slot-reason="Dietary filter tag">Vegetarian</span>` : ''}
                  </div>
                  <div class="v2-candidate-basis" ${
                    c.fieldSourceRefs?.basis
                      ? `data-source-ref="${escapeHtml(c.fieldSourceRefs.basis.recordId)}.${escapeHtml(c.fieldSourceRefs.basis.field)}" data-slot="domain"`
                      : `data-slot="chrome" data-slot-reason="Recommendation ranking basis label"`
                  }>${escapeHtml(c.basis)}</div>
                  <div class="v2-candidate-footer">
                    <button
                      type="button"
                      class="btn btn-outline v2-directions-btn"
                      id="btn-navigate-${c.id}"
                      data-candidate-id="${c.id}"
                      data-slot="chrome"
                      data-slot-reason="Navigation trigger button"
                      aria-label="Directions to ${escapeHtml(c.name)}"
                    >
                      Directions →
                    </button>
                    <button
                      type="button"
                      class="btn v2-view-detail-link"
                      id="btn-detail-${c.id}"
                      data-candidate-id="${c.id}"
                      data-slot="chrome"
                      data-slot-reason="View details button"
                      aria-label="View details for ${escapeHtml(c.name)}"
                    >Details →</button>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        <div class="now-basis">
          <p data-slot="chrome" data-slot-reason="Static basis template">${escapeHtml(vm.basis)}</p>
        </div>

        ${renderActionRow(vm)}
      </section>

      <!-- Compact Location Map -->
      ${vm.map ? renderMapCard(vm.map) : ''}

      ${renderCollapsibleSecondary(vm)}
    </div>
  `;
}

function renderCollapsibleSecondary(vm: HomeCompositionVM): string {
  // If both are empty, collapse completely! Zero empty placeholder cards!
  if (vm.aheadItems.length === 0 && vm.proposals.length === 0) {
    return '';
  }

  return `
    <div class="secondary-grid v2-secondary">
      ${
        vm.aheadItems.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.ahead)}">
          <h2 class="section-label" data-slot="chrome" data-slot-reason="Secondary section label">${escapeHtml(STRINGS.sections.ahead)}</h2>
          <div class="ahead-list">
            ${vm.aheadItems
              .map(
                item => `
              <div class="card ahead-card" data-ahead-id="${escapeHtml(item.id)}" data-slot="chrome" data-slot-reason="Ahead card container">
                <h3 class="ahead-title" data-slot="chrome" data-slot-reason="Ahead card title">${escapeHtml(item.title)}</h3>
                <p class="ahead-subtitle" data-slot="chrome" data-slot-reason="Ahead card subtitle">${escapeHtml(item.subtitle)}</p>
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `
          : ''
      }

      ${
        vm.proposals.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.forYou)}">
          <h2 class="section-label" data-slot="chrome" data-slot-reason="Secondary section label">${escapeHtml(STRINGS.sections.forYou)}</h2>
          <div class="for-you-list">
            ${vm.proposals
              .map(
                prop => `
              <div class="card proposal-card" data-proposal-key="${escapeHtml(prop.key)}" data-slot="chrome" data-slot-reason="Proposal card container">
                <h3 class="proposal-title" data-slot="chrome" data-slot-reason="Proposal card title">${escapeHtml(prop.title)}</h3>
                ${prop.basis ? `<p class="proposal-basis" data-slot="chrome" data-slot-reason="Proposal card basis">${escapeHtml(prop.basis)}</p>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `
          : ''
      }
    </div>
  `;
}
