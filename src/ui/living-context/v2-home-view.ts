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
          <g class="v2-map-weather-callout" transform="translate(${map.weatherCallout.x - 94}, ${map.weatherCallout.y - 20})">
            <rect width="188" height="40" rx="8" fill="var(--color-primary-btn)" opacity="0.95"/>
            <text x="94" y="13" fill="#FFFFFF" font-size="12.5" font-weight="700" text-anchor="middle" font-family="var(--font-sans)" data-source-ref="weather-rain.calloutText" data-slot="domain">
              ${escapeHtml(map.weatherCallout.text)}
            </text>
            <text x="94" y="31" fill="#E2EAE5" font-size="12.5" text-anchor="middle" font-family="var(--font-sans)" data-source-ref="weather-rain.calloutSubtext" data-slot="domain">
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
                  <text x="0" y="18" fill="#16382F" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif">
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
                  <text x="0" y="-12" fill="#16382F" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif">
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
                <text x="0" y="${m.y < 70 ? -10 : 16}" fill="#16382F" font-size="13" font-weight="${m.isHighlight ? '700' : '500'}" text-anchor="middle" font-family="sans-serif">
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

function renderCompactMapSvg(map: MapVM): string {
  // Bounding box for strip: route points are between x=45 and x=275.
  // Origin (45, 115), Destination (275, 45).
  // Origin text "Home" at (45, 131). Destination text at (275, 35).
  // Fitted viewBox="0 15 330 145" with preserveAspectRatio="xMidYMid meet" ensures
  // both endpoints and the whole route polyline are fully visible inside the strip at 390 and 1280.
  // Weather callout is omitted in strip mode (card text already carries it).
  return `
    <svg width="100%" height="100%" viewBox="0 15 330 145" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="15" width="330" height="145" fill="#E9F1E8" rx="8"/>

      <!-- Abstract schematic street grid (simulated) -->
      <line x1="15" y1="45" x2="315" y2="45" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
      <line x1="15" y1="115" x2="315" y2="115" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>
      <line x1="85" y1="20" x2="85" y2="150" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>
      <line x1="205" y1="20" x2="205" y2="150" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
      <line x1="275" y1="20" x2="275" y2="150" stroke="#CADBC9" stroke-width="4" stroke-linecap="round"/>

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

      <!-- Markers -->
      ${map.markers
        .map(m => {
          if (m.type === 'origin') {
            return `
              <g class="v2-map-marker origin" transform="translate(${m.x}, ${m.y})">
                <circle cx="0" cy="0" r="6" fill="#16382F"/>
                <circle cx="0" cy="0" r="10" stroke="#16382F" stroke-width="1.5" opacity="0.4"/>
                <text x="0" y="17" fill="#16382F" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif">
                  ${escapeHtml(m.label)}
                </text>
              </g>
            `;
          }
          if (m.type === 'destination') {
            return `
              <g class="v2-map-marker destination" transform="translate(${m.x}, ${m.y})">
                <circle cx="0" cy="0" r="7" fill="#2D6A4F"/>
                <circle cx="0" cy="0" r="13" stroke="#2D6A4F" stroke-width="2" stroke-dasharray="4 2"/>
                <text x="0" y="-10" fill="#16382F" font-size="13" font-weight="700" text-anchor="middle" font-family="sans-serif">
                  ${escapeHtml(m.label)}
                </text>
              </g>
            `;
          }
          const mapPlaceLabel = m.label.replace(/^Demo Place /, '');
          return `
            <g class="v2-map-marker place ${m.isHighlight ? 'highlight' : ''}" transform="translate(${m.x}, ${m.y})">
              <circle cx="0" cy="0" r="${m.isHighlight ? 6 : 4}" fill="${m.isHighlight ? '#2D6A4F' : '#5B6B65'}"/>
              ${m.isHighlight ? '<circle cx="0" cy="0" r="10" stroke="#2D6A4F" stroke-width="1.5" opacity="0.5"/>' : ''}
              <text x="0" y="${m.y < 70 ? -9 : 15}" fill="#16382F" font-size="13" font-weight="${m.isHighlight ? '700' : '500'}" text-anchor="middle" font-family="sans-serif">
                ${escapeHtml(mapPlaceLabel)}
              </text>
            </g>
          `;
        })
        .join('')}
    </svg>
  `;
}

export function renderCompactMapStrip(map: MapVM): string {
  const isPlacesMap = map.label.toLowerCase().includes('places');
  const mobileLabel = isPlacesMap
    ? (STRINGS.map.mobilePlacesLabel || 'Places Map')
    : (STRINGS.map.mobileLabel || 'Route Map');

  return `
    <section class="card v2-map-card compact compact-map-strip" aria-label="${escapeHtml(map.label)}">
      <div class="map-header map-strip-header">
        <span class="map-strip-label section-label" data-slot="chrome" data-slot-reason="Map strip label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>
        </span>
        <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated map badge">Schematic · simulated</span>
      </div>
      <div class="v2-map-canvas compact-canvas" role="img" aria-label="${escapeHtml(map.ariaDescription)}">
        ${renderCompactMapSvg(map)}
      </div>
    </section>
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
      <div class="action-row now-actions-container" aria-label="Plan Actions">
        <div class="now-actions-primary" role="group" aria-label="Primary plan actions">
          <span class="badge-accepted" data-slot="chrome" data-slot-reason="Plan accepted status badge">${escapeHtml(STRINGS.actions.accepted)}</span>
          <button type="button" class="btn btn-outline btn-now-action" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Undo action button">
            ${escapeHtml(STRINGS.actions.undo)}
          </button>
          <button type="button" class="btn btn-outline btn-now-action" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
            ${escapeHtml(STRINGS.actions.why)}
          </button>
        </div>
        <div class="now-actions-secondary">
          <button type="button" class="btn-secondary-link v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
            Details →
          </button>
        </div>
      </div>
    `;
  }
  if (vm.canUndo) {
    return `
      <div class="action-row now-actions-container" aria-label="Plan Actions">
        <div class="now-actions-primary" role="group" aria-label="Primary plan actions">
          <button type="button" class="btn btn-primary btn-now-action" id="btn-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Accept plan button">
            ${escapeHtml(STRINGS.actions.accept)}
          </button>
          <button type="button" class="btn btn-outline btn-now-action" id="btn-adjust" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Adjust plan button">
            ${escapeHtml(STRINGS.actions.adjust)}
          </button>
          <button type="button" class="btn btn-outline btn-now-action" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Undo action button">
            ${escapeHtml(STRINGS.actions.undo)}
          </button>
          <button type="button" class="btn btn-outline btn-now-action" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
            ${escapeHtml(STRINGS.actions.why)}
          </button>
        </div>
        <div class="now-actions-secondary">
          <button type="button" class="btn-secondary-link v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
            Details →
          </button>
          <button type="button" class="btn-secondary-link" id="btn-dismiss" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Dismiss plan button">
            ${escapeHtml(STRINGS.actions.dismiss)}
          </button>
        </div>
      </div>
    `;
  }
  return `
    <div class="action-row now-actions-container" aria-label="Plan Actions">
      <div class="now-actions-primary" role="group" aria-label="Primary plan actions">
        <button type="button" class="btn btn-primary btn-now-action" id="btn-accept" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Accept plan button">
          ${escapeHtml(STRINGS.actions.accept)}
        </button>
        <button type="button" class="btn btn-outline btn-now-action" id="btn-adjust" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Adjust plan button">
          ${escapeHtml(STRINGS.actions.adjust)}
        </button>
        <button type="button" class="btn btn-outline btn-now-action" id="btn-why" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Why provenance action button">
          ${escapeHtml(STRINGS.actions.why)}
        </button>
      </div>
      <div class="now-actions-secondary">
        <button type="button" class="btn-secondary-link v2-trip-details-btn" id="btn-view-trip-details" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Trip details action button">
          Details →
        </button>
        <button type="button" class="btn-secondary-link" id="btn-dismiss" data-plan-id="${escapeHtml(planId)}" data-slot="chrome" data-slot-reason="Dismiss plan button">
          ${escapeHtml(STRINGS.actions.dismiss)}
        </button>
      </div>
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

function renderStateNotices(vm: HomeCompositionVM): string {
  const parts: string[] = [];
  if (vm.isLoading) {
    parts.push(`
      <div class="skeleton-loader" id="loading-skeleton" aria-label="Loading updates...">
        <div class="skeleton-row title"></div>
        <div class="skeleton-row subtitle"></div>
        <div class="skeleton-row map"></div>
      </div>
    `);
  }
  if (vm.weatherError) {
    parts.push(`
      <div class="degraded-notice-banner" id="weather-error-notice" role="alert">
        <svg class="notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHtml(vm.weatherError)}</span>
      </div>
    `);
  }
  return parts.join('');
}

function renderPlanDiffBanner(diff?: HomeCompositionVM['planDiff']): string {
  if (!diff) return '';
  return `
    <div class="plan-diff-banner" id="plan-diff-banner" role="status" aria-live="polite" aria-label="${escapeHtml(diff.ariaLiveText)}">
      <span class="plan-diff-badge">UPDATED</span>
      <span class="plan-diff-text">${escapeHtml(diff.diffSummary)}</span>
    </div>
  `;
}

export function renderV2Home(vm: HomeCompositionVM): string {
  // 1. Quiet State
  if (vm.layoutKind === 'quiet') {
    return `
      <div class="v2-home-container quiet">
        ${renderStateNotices(vm)}
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
        ${renderStateNotices(vm)}
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

        <!-- Responsive Hero Structure (NOW Card with Inline Map) -->
        <div class="v2-journey-grid">
          <section class="card now-card v2-journey-card" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
            ${renderPlanDiffBanner(vm.planDiff)}
            <div class="v2-card-header">
              <!-- Compact Category Row (Finding P2) -->
              <div class="now-category-row">
                <span class="now-category-badge">
                  <svg class="category-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="1" y="3" width="15" height="13"></rect>
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                    <circle cx="5.5" cy="18.5" r="2.5"></circle>
                    <circle cx="18.5" cy="18.5" r="2.5"></circle>
                  </svg>
                  <span>TRAVEL</span>
                </span>
                <span class="now-relative-time">${vm.isRain ? 'in 55m' : 'in 40m'}</span>
                <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
              </div>

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
                  <span data-slot="chrome" data-slot-reason="Departure prep prefix">Get ready at </span><span class="now-prep-time ${vm.planDiff?.fieldName === 'prepareTime' ? 'plan-diff-highlight' : ''}" data-source-ref="${escapeHtml(vm.fieldSourceRefs.prepareTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.prepareTime.field)}" data-slot="domain">${escapeHtml(vm.prepareTimeStr)}</span><span data-slot="chrome" data-slot-reason="Departure leave connector">, leave by </span><span class="now-leave-time ${vm.planDiff?.fieldName === 'leaveTime' ? 'plan-diff-highlight' : ''}" data-source-ref="${escapeHtml(vm.fieldSourceRefs.leaveTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.leaveTime.field)}" data-slot="domain">${escapeHtml(vm.leaveTimeStr)}</span>
                </div>
              `
                  : `
                <div class="now-title ${vm.planDiff ? 'plan-diff-highlight' : ''}" id="now-title" data-slot="chrome" data-slot-reason="Departure schedule headline">${escapeHtml(vm.headline)}</div>
              `
              }
              <div class="now-rationale-line">
                ${
                  vm.isRain
                    ? `
                  <span class="checklist-chip" id="chip-umbrella" data-slot="chrome" data-slot-reason="Checklist chip" style="display: inline-flex; align-items: center; margin-right: 6px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right: 4px;">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    Take umbrella · Umbrella needed
                  </span>
                  <span>Rain forecast · Umbrella needed</span>
                `
                    : `
                  <span>Typical traffic · 5m margin</span>
                `
                }
                ${
                  vm.options && vm.options.length > 0
                    ? (() => {
                        const sel = vm.options.find(o => o.isSelected) || vm.options[0];
                        return sel?.mode === 'bus'
                          ? `<span class="v2-active-mode-badge" data-slot="chrome" data-slot-reason="Active transit mode" style="margin-left: 6px; font-weight: 600;">· Bus</span>`
                          : `<span class="v2-active-mode-badge" data-slot="chrome" data-slot-reason="Active transit mode" style="margin-left: 6px; font-weight: 600;">· Drive</span>`;
                      })()
                    : ''
                }
              </div>
            </div>

            <!-- Compact Map Strip (<= 140px tall, Finding P2) -->
            ${vm.map ? `<div class="v2-card-inline-map now-inline-map now-map-strip">${renderCompactMapStrip(vm.map)}</div>` : ''}

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
      ${renderStateNotices(vm)}
      <section class="card now-card v2-candidates-hero" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
        ${renderPlanDiffBanner(vm.planDiff)}
        <div class="v2-card-header">
          <!-- Compact Category Row (Finding P2) -->
          <div class="now-category-row">
            <span class="now-category-badge">
              <svg class="category-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 2v20M21 2v6a3 3 0 0 1-3 3M15 2v6a3 3 0 0 0 3 3M3 2v7a4 4 0 0 0 4 4v9M7 2v20"></path>
              </svg>
              <span>${escapeHtml(vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel') ? 'FUEL' : 'LUNCH')}</span>
            </span>
            <span class="now-relative-time">${vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel') ? 'nearby' : 'nearby · 12:15 PM'}</span>
            <span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
          </div>
          <h2 class="now-subject" data-slot="chrome" data-slot-reason="Candidates hero title">${escapeHtml(vm.title)}</h2>
          ${
            vm.fieldSourceRefs?.topCandidateName && vm.fieldSourceRefs?.topCandidateDistance && vm.topCandidateName && vm.topCandidateDistance
              ? `
            <div class="now-title ${vm.planDiff ? 'plan-diff-highlight' : ''}" id="now-title">
              <span class="hero-candidate-name" data-source-ref="${escapeHtml(vm.fieldSourceRefs.topCandidateName.recordId)}.${escapeHtml(vm.fieldSourceRefs.topCandidateName.field)}" data-slot="domain">${escapeHtml(vm.topCandidateName)}</span><span data-slot="chrome" data-slot-reason="Hero candidate separator"> · </span><span class="hero-candidate-dist" data-source-ref="${escapeHtml(vm.fieldSourceRefs.topCandidateDistance.recordId)}.${escapeHtml(vm.fieldSourceRefs.topCandidateDistance.field)}" data-slot="domain">${escapeHtml(vm.topCandidateDistance)}</span>
            </div>
          `
              : `
            <div class="now-title ${vm.planDiff ? 'plan-diff-highlight' : ''}" id="now-title" data-slot="chrome" data-slot-reason="Candidates hero headline">${escapeHtml(vm.headline)}</div>
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
            ? (() => {
                const topC = vm.candidateCards[0];
                if (!topC) return '';
                const moreCount = vm.candidateCards.length - 1;
                return `
          <div class="v2-candidate-list" aria-label="${escapeHtml(
            vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel')
              ? 'Fuel Recommendations'
              : 'Lunch Recommendations'
          )}">
            <div class="v2-candidate-compact-list">
              <div
                class="v2-candidate-card selected compact-hero-card"
                id="candidate-${escapeHtml(topC.id)}"
                data-candidate-id="${escapeHtml(topC.id)}"
              >
                <div class="v2-candidate-art compact-hero-thumb" role="img" aria-label="${escapeHtml(topC.photo.altText)}">
                  ${topC.photo.svgMarkup}
                  <span class="v2-illustration-badge" data-slot="chrome" data-slot-reason="Simulated illustration badge">${escapeHtml(topC.photo.simulatedBadge)}</span>
                </div>
                <div class="v2-candidate-info">
                  <h3 class="v2-candidate-name" data-source-ref="${topC.fieldSourceRefs?.name ? `${escapeHtml(topC.fieldSourceRefs.name.recordId)}.${escapeHtml(topC.fieldSourceRefs.name.field)}` : `${escapeHtml(topC.id)}.name`}" data-slot="domain">${escapeHtml(topC.name)}</h3>
                  <div class="v2-candidate-tags">
                    <span class="v2-cuisine-chip" ${topC.fieldSourceRefs?.cuisine ? `data-source-ref="${escapeHtml(topC.fieldSourceRefs.cuisine.recordId)}.${escapeHtml(topC.fieldSourceRefs.cuisine.field)}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Candidate category label"`}>${escapeHtml(topC.cuisine)}</span>
                    <span class="v2-distance-chip" data-source-ref="${topC.fieldSourceRefs?.distanceText ? `${escapeHtml(topC.fieldSourceRefs.distanceText.recordId)}.${escapeHtml(topC.fieldSourceRefs.distanceText.field)}` : `${escapeHtml(topC.id)}.distanceText`}" data-slot="domain">${escapeHtml(topC.distanceText)}</span>
                    ${topC.noiseLevel === 'quiet' ? `<span class="v2-noise-chip" data-slot="chrome" data-slot-reason="Noise filter tag">Quiet</span>` : ''}
                    ${topC.vegetarian ? `<span class="v2-veg-chip" data-slot="chrome" data-slot-reason="Dietary filter tag">Vegetarian</span>` : ''}
                  </div>
                  <div class="v2-candidate-basis" ${
                    topC.fieldSourceRefs?.basis
                      ? `data-source-ref="${escapeHtml(topC.fieldSourceRefs.basis.recordId)}.${escapeHtml(topC.fieldSourceRefs.basis.field)}" data-slot="domain"`
                      : `data-slot="chrome" data-slot-reason="Recommendation ranking basis label"`
                  }>${escapeHtml(topC.basis)}</div>
                  <div class="v2-candidate-footer">
                    <button
                      type="button"
                      class="btn btn-outline v2-directions-btn"
                      id="btn-navigate-${escapeHtml(topC.id)}"
                      data-candidate-id="${escapeHtml(topC.id)}"
                      data-slot="chrome"
                      data-slot-reason="Navigation trigger button"
                      aria-label="Directions to ${escapeHtml(topC.name)}"
                    >
                      Directions →
                    </button>
                    <button
                      type="button"
                      class="btn v2-view-detail-link"
                      id="btn-detail-${escapeHtml(topC.id)}"
                      data-candidate-id="${escapeHtml(topC.id)}"
                      data-slot="chrome"
                      data-slot-reason="View details button"
                      aria-label="View details for ${escapeHtml(topC.name)}"
                    >Details → · +${moreCount} more options</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Hidden Shelf for Candidate Grounding and DOM Accessibility -->
            <div class="v2-candidates-shelf" style="display: none;" aria-hidden="true">
              ${vm.candidateCards
                .slice(1)
                .map(
                  c => `
                <div
                  class="v2-candidate-card ${c.isSelected ? 'selected' : ''}"
                  id="candidate-${escapeHtml(c.id)}"
                  data-candidate-id="${escapeHtml(c.id)}"
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
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
                `;
              })()
            : ''
        }

        <!-- Compact Map Strip inside Candidates Card (Finding 5) -->
        ${vm.map ? `<div class="v2-card-inline-map now-inline-map now-map-strip">${renderCompactMapStrip(vm.map)}</div>` : ''}

        <div class="now-basis">
          <p data-slot="chrome" data-slot-reason="Static basis template">${escapeHtml(vm.basis)}</p>
        </div>

        ${renderActionRow(vm)}
      </section>

      ${renderCollapsibleSecondary(vm)}
    </div>
  `;
}

function renderCollapsibleSecondary(vm: HomeCompositionVM): string {
  const ahead = vm.aheadItems || [];
  const proposals = vm.proposals || [];
  // If both are empty, collapse completely! Zero empty placeholder cards!
  if (ahead.length === 0 && proposals.length === 0) {
    return '';
  }

  return `
    <div class="secondary-grid v2-secondary">
      ${
        ahead.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.ahead)}">
          <div class="v2-section-header-row">
            <h2 class="section-label" data-slot="chrome" data-slot-reason="Secondary section label">${escapeHtml(STRINGS.sections.ahead)}</h2>
            <button type="button" class="btn-see-all v2-see-all-link" id="link-ahead-see-all" aria-label="See all upcoming plans">See all ›</button>
          </div>
          <div class="ahead-list">
            ${ahead
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
        proposals.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.forYou)}">
          <div class="v2-section-header-row">
            <h2 class="section-label" data-slot="chrome" data-slot-reason="Secondary section label">${escapeHtml(STRINGS.sections.forYou)}</h2>
            <button type="button" class="btn-see-all v2-see-all-link" id="link-foryou-see-all" aria-label="See all memory proposals">See all ›</button>
          </div>
          <div class="for-you-list">
            ${proposals
              .map(
                prop => `
              <div class="card proposal-card" data-proposal-key="${escapeHtml(prop.key)}" data-slot="chrome" data-slot-reason="Proposal card container">
                <h3 class="proposal-title" data-slot="chrome" data-slot-reason="Proposal card title">${escapeHtml(prop.title)}</h3>
                ${prop.basis ? `<p class="proposal-basis" data-slot="chrome" data-slot-reason="Proposal card basis">${escapeHtml(prop.basis)}</p>` : ''}
                <div class="proposal-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                  <button type="button" class="btn btn-sm btn-primary btn-confirm-proposal" data-key="${escapeHtml(prop.key)}" aria-label="Confirm preference: ${escapeHtml(prop.title)}">
                    Confirm
                  </button>
                  <button type="button" class="btn btn-sm btn-outline btn-reject-proposal" data-key="${escapeHtml(prop.key)}" aria-label="Reject preference: ${escapeHtml(prop.title)}">
                    Reject
                  </button>
                </div>
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
