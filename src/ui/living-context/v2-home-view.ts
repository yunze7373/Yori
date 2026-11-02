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
import { renderRealMapCard, type RealMapRenderOptions } from './real-map.js';
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

export function renderCompactMapStrip(map: MapVM, isLive?: boolean): string {
  const isPlacesMap = map.label.toLowerCase().includes('places');
  const mobileLabel = isPlacesMap
    ? (STRINGS.map.mobilePlacesLabel || 'Places Map')
    : (STRINGS.map.mobileLabel || 'Route Map');

  if (isLive) {
    return `
    <section class="card v2-map-card compact compact-map-strip" aria-label="${escapeHtml(map.label)}" data-provenance="none">
      <div class="map-header map-strip-header">
        <span class="map-strip-label section-label" data-slot="chrome" data-slot-reason="Map strip label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>
        </span>
        <span class="card-badge" data-provenance="none">Map not available</span>
      </div>
      <div class="v2-map-canvas compact-canvas map-unavailable-canvas" role="img" aria-label="Map not available">
        <div class="map-unavailable-message" style="display: flex; align-items: center; justify-content: center; height: 100%; min-height: 48px; color: var(--color-text-secondary, #5B6B65); font-size: 0.8125rem;">
          Map view not available
        </div>
      </div>
    </section>
  `;
  }

  return `
    <section class="card v2-map-card compact compact-map-strip" aria-label="${escapeHtml(map.label)}" data-provenance="${isLive ? 'live' : 'fixture'}">
      <div class="map-header map-strip-header">
        <span class="map-strip-label section-label" data-slot="chrome" data-slot-reason="Map strip label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>
        </span>
        ${
          isLive
            ? `<span class="card-badge live-badge" data-provenance="live" data-source="osm">Live map</span>`
            : `<span class="card-badge" data-slot="chrome" data-slot-reason="Simulated map badge">Schematic · simulated</span>`
        }
      </div>
      <div class="v2-map-canvas compact-canvas" role="img" aria-label="${escapeHtml(map.ariaDescription)}">
        ${renderCompactMapSvg(map)}
      </div>
    </section>
  `;
}

export function renderMapCard(map: MapVM, options?: RealMapRenderOptions): string {
  return renderRealMapCard(map, renderMapSvg, options);
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
            Not now
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
          Not now
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
          <div class="v2-location-notice-desc">${
            vm.isLive
              ? 'Grant permission to discover nearby dining options.'
              : 'Grant permission to discover nearby fuel stations or select a location manually.'
          }</div>
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
          <div class="v2-location-notice-desc">${
            vm.isLive
              ? 'Location access was denied. Grant permission to discover nearby dining.'
              : 'Location access was denied. You can select a city or enter coordinates manually below.'
          }</div>
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
              (vm.isLive
                ? 'Unable to acquire current position. Check device location services.'
                : 'Unable to acquire current position. Please select a city or enter coordinates manually.')
          )}</div>
        </div>
      `
          : ''
      }

      ${
        vm.isLive
          ? ''
          : `
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
      `
      }
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

function renderSignalTiles(vm: HomeCompositionVM): string {
  // 1. Weather Value
  let weatherValue: string;
  if (vm.isLive) {
    if (vm.weatherEnabled === false || vm.livingHeader?.weatherDisplay === 'Weather: Off') {
      weatherValue = 'Off (owner setting)';
    } else if (
      vm.weatherError ||
      (!vm.weatherSignalValue?.condition && typeof vm.weatherSignalValue?.temperatureC !== 'number') ||
      vm.livingHeader?.weatherDisplay === 'Weather unavailable'
    ) {
      weatherValue = 'Unavailable';
    } else {
      const cond =
        vm.weatherSignalValue?.condition
          ? vm.weatherSignalValue.condition.charAt(0).toUpperCase() +
            vm.weatherSignalValue.condition.slice(1)
          : '';
      if (cond && typeof vm.weatherSignalValue?.temperatureC === 'number') {
        weatherValue = `${cond} · ${vm.weatherSignalValue.temperatureC}°C`;
      } else if (cond) {
        weatherValue = cond;
      } else if (typeof vm.weatherSignalValue?.temperatureC === 'number') {
        weatherValue = `${vm.weatherSignalValue.temperatureC}°C`;
      } else {
        weatherValue = 'Unavailable';
      }
    }
  } else {
    weatherValue = vm.isRain ? 'Rain forecast · 18°C' : 'Clear sky · 20°C';
  }

  // 2. Calendar Value
  let calendarValue: string;
  if (vm.isLive) {
    calendarValue = 'Not connected';
  } else if (vm.layoutKind === 'journey') {
    calendarValue = vm.apptTimeStr
      ? `${vm.subjectTitle || 'Piano lesson'} at ${vm.apptTimeStr}`
      : (vm.title || 'Piano lesson at 3:00 PM');
  } else {
    calendarValue =
      vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel')
        ? 'Drive route · ongoing'
        : 'Lunch break · 12:15 PM';
  }

  // 3. Transit Value
  let transitValue: string;
  if (vm.isLive) {
    transitValue = vm.topCandidateDistance
      ? `${vm.topCandidateDistance} · walk`
      : (vm.options?.[0]?.detail || 'Nearby dining');
  } else if (vm.layoutKind === 'journey') {
    transitValue =
      vm.options?.[0]?.detail ||
      vm.options?.[0]?.label ||
      (vm.leaveTimeStr ? `Drive · leave ${vm.leaveTimeStr}` : 'Drive · 25 min drive + 5m margin');
  } else {
    transitValue = vm.topCandidateDistance || '5m away · walk';
  }

  // 4. Memory Value & Inclusion (in Live, ONLY render if confirmed fact exists)
  const shouldRenderMemory = !vm.isLive || Boolean(vm.confirmedMemoryNote || vm.confirmedMemoryFact);
  let memoryValue = '';
  if (shouldRenderMemory) {
    if (vm.isLive) {
      memoryValue = vm.confirmedMemoryNote || 'Confirmed taste preference';
    } else if (vm.layoutKind === 'journey') {
      memoryValue = vm.habitNote || (vm.isRain ? 'Prefers driving when it rains' : 'Buffer before leaving');
    } else {
      memoryValue =
        vm.habitNote ||
        (vm.title === 'Low Fuel Warning' ? 'Low fuel threshold' : 'Prefers quiet dining');
    }
  }

  return `
    <div class="hero-signals-grid" id="hero-signals-grid" role="group" aria-label="Signal Inputs">
      <div class="signal-tile" id="signal-tile-weather">
        <div class="signal-tile-top">
          <div class="signal-icon-circle weather" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line></svg>
          </div>
          <span class="signal-label">WEATHER</span>
        </div>
        <div class="signal-value">${escapeHtml(weatherValue)}</div>
      </div>

      <div class="signal-tile" id="signal-tile-calendar">
        <div class="signal-tile-top">
          <div class="signal-icon-circle calendar" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <span class="signal-label">CALENDAR</span>
        </div>
        <div class="signal-value">${escapeHtml(calendarValue)}</div>
      </div>

      <div class="signal-tile" id="signal-tile-transit">
        <div class="signal-tile-top">
          <div class="signal-icon-circle transit" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
          </div>
          <span class="signal-label">TRANSIT</span>
        </div>
        <div class="signal-value">${escapeHtml(transitValue)}</div>
      </div>

      ${
        shouldRenderMemory
          ? `
      <div class="signal-tile" id="signal-tile-memory">
        <div class="signal-tile-top">
          <div class="signal-icon-circle memory" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.93 7.07"></path></svg>
          </div>
          <span class="signal-label">MEMORY</span>
        </div>
        <div class="signal-value">${escapeHtml(memoryValue)}</div>
      </div>
      `
          : ''
      }
    </div>
  `;
}

export function renderV2Home(vm: HomeCompositionVM): string {
  // 1. Quiet State
  if (vm.layoutKind === 'quiet') {
    return `
      <div class="v2-home-container quiet">
        ${renderStateNotices(vm)}
        <section class="card quiet-card ${vm.suppressedQuiet ? 'suppressed-quiet-card' : ''}" aria-label="Quiet State" data-provenance="${vm.isLive ? 'none' : 'fixture'}">
          <div class="quiet-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
            </svg>
          </div>
          <h2 class="quiet-title" id="quiet-title">${escapeHtml(vm.suppressedQuiet?.message || vm.title)}</h2>
          <p class="quiet-subtitle" id="quiet-subtitle">${escapeHtml(vm.headline)}</p>
          ${
            vm.suppressedQuiet
              ? `
            <div class="suppressed-quiet-notice" id="suppressed-quiet-notice" role="status">
              <div class="budget-meter" id="budget-meter" aria-label="Prompt budget">
                <span class="budget-meter-icon" aria-hidden="true">⏱️</span>
                <span class="budget-meter-label">Daily prompt budget: </span>
                <span class="budget-meter-value" id="budget-meter-value">${escapeHtml(vm.suppressedQuiet.budgetMeter)}</span>
              </div>
            </div>
          `
              : ''
          }
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
        <!-- Weather / Insight Alert Banner (omitted when changeMoment is active to avoid duplicate cause markers) -->
        ${
          !vm.changeMoment && vm.isRain && vm.rainBanner
            ? `
          <div class="v2-insight-banner" role="status" ${vm.isLive ? 'data-provenance="live" data-source="open-meteo"' : 'data-provenance="fixture"'}>
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
          <section class="card now-card v2-journey-card" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}" data-provenance="${vm.isLive ? 'live' : 'fixture'}" ${vm.isLive ? 'data-source="live_pipeline"' : ''}>
            ${!vm.changeMoment ? renderPlanDiffBanner(vm.planDiff) : ''}
            <div class="v2-card-header">
              <!-- Hero Thought Badge & Relative Time -->
              <div class="hero-thought-header">
                <span class="hero-thought-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-right: 4px;">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                  <span>THOUGHT AHEAD FOR YOU</span>
                </span>
                <div class="hero-header-meta">
                  <span class="now-relative-time">${escapeHtml(vm.countdownStr || '')}</span>
                  ${
                    vm.isLive
                      ? `<span class="card-badge live-badge" data-provenance="live" data-source="live_pipeline">Live</span>`
                      : `<span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>`
                  }
                </div>
              </div>

              ${
                vm.changeMoment
                  ? `
                <div class="change-moment-container" id="change-moment-container">
                  <div class="plan-status-transition" id="plan-status-transition" role="status" aria-live="polite">
                    ${escapeHtml(vm.changeMoment.statusTransition || 'Updated plan ready')}
                  </div>
                  <div class="what-changed-marker" id="what-changed-marker">
                    <span class="what-changed-chip">
                      <span class="what-changed-icon" aria-hidden="true">⚡</span>
                      <span class="what-changed-text">${escapeHtml(vm.changeMoment.causeMarker)}</span>
                    </span>
                  </div>
                  <div class="hero-cause-effect" id="hero-cause-effect" data-slot="chrome">
                    ${escapeHtml(vm.changeMoment.heroCauseEffect)}
                  </div>
                  ${
                    vm.changeMoment.priorLeaveTime && vm.changeMoment.newLeaveTime
                      ? `
                    <div class="time-diff-display" id="time-diff-display" aria-label="Leave time updated from ${escapeHtml(vm.changeMoment.priorLeaveTime)} to ${escapeHtml(vm.changeMoment.newLeaveTime)}">
                      <span class="prior-time-struck"><s class="struck-through">${escapeHtml(vm.changeMoment.priorLeaveTime)}</s></span>
                      <span class="time-arrow" aria-hidden="true"> → </span>
                      <span class="new-time-highlight">${escapeHtml(vm.changeMoment.newLeaveTime)}</span>
                    </div>
                  `
                      : ''
                  }
                </div>
              `
                  : ''
              }

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
                  <span class="hero-prep-line"><span data-slot="chrome" data-slot-reason="Departure prep prefix">Get ready at </span><span class="now-prep-time ${vm.planDiff?.fieldName === 'prepareTime' ? 'plan-diff-highlight' : ''}" data-source-ref="${escapeHtml(vm.fieldSourceRefs.prepareTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.prepareTime.field)}" data-slot="domain">${escapeHtml(vm.prepareTimeStr)}</span>, </span><span class="hero-leave-headline"><span data-slot="chrome" data-slot-reason="Departure leave connector">leave by </span><span class="now-leave-time ${vm.planDiff?.fieldName === 'leaveTime' ? 'plan-diff-highlight' : ''}" data-source-ref="${escapeHtml(vm.fieldSourceRefs.leaveTime.recordId)}.${escapeHtml(vm.fieldSourceRefs.leaveTime.field)}" data-slot="domain">${escapeHtml(vm.leaveTimeStr)}</span></span>
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
                  <span class="checklist-chip" id="chip-umbrella" data-slot="chrome" data-slot-reason="Checklist chip" style="display: inline-flex; align-items: center;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right: 4px;">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    Umbrella
                  </span>
                  <span class="now-rationale-forecast">Rain forecast</span>
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
                          ? `<span class="v2-active-mode-badge" data-slot="chrome" data-slot-reason="Active transit mode" style="font-weight: 600;">·&nbsp;Bus</span>`
                          : `<span class="v2-active-mode-badge" data-slot="chrome" data-slot-reason="Active transit mode" style="font-weight: 600;">·&nbsp;Drive</span>`;
                      })()
                    : ''
                }
              </div>

              ${renderActionRow(vm)}

              <!-- Signal Tiles Grid -->
              ${renderSignalTiles(vm)}
            </div>

            <!-- Compact Map Strip (<= 140px tall, Finding P2) -->
            ${vm.map ? `<div class="v2-card-inline-map now-inline-map now-map-strip">${renderCompactMapStrip(vm.map, vm.isLive)}</div>` : ''}

            <div class="now-basis">
              <p data-slot="chrome" data-slot-reason="Static basis template">${escapeHtml(vm.basis)}</p>
            </div>
          </section>
        </div>

        ${renderSectionedFeed(vm)}
      </div>
    `;
  }

  // 3. Candidates Layout (Lunch Away)
  return `
    <div class="v2-home-container candidates">
      ${renderStateNotices(vm)}
      <section class="card now-card v2-candidates-hero" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}" data-provenance="${vm.isLive ? 'live' : 'fixture'}" ${vm.isLive ? 'data-source="live_pipeline"' : ''}>
        ${!vm.changeMoment ? renderPlanDiffBanner(vm.planDiff) : ''}
        <div class="v2-card-header">
          <!-- Hero Thought Badge & Relative Time -->
          <div class="hero-thought-header">
            <span class="hero-thought-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-right: 4px;">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
              <span>THOUGHT AHEAD FOR YOU</span>
            </span>
            <div class="hero-header-meta">
              <span class="now-relative-time">${vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel') ? 'nearby' : (vm.isLive ? 'nearby' : 'nearby · 12:15 PM')}</span>
              ${
                vm.isLive
                  ? `<span class="card-badge live-badge" data-provenance="live" data-source="live_pipeline">Live</span>`
                  : `<span class="card-badge" data-slot="chrome" data-slot-reason="Simulated fixture badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>`
              }
            </div>
          </div>

          ${
            vm.changeMoment
              ? `
            <div class="change-moment-container" id="change-moment-container">
              <div class="plan-status-transition" id="plan-status-transition" role="status" aria-live="polite">
                ${escapeHtml(vm.changeMoment.statusTransition || 'Updated plan ready')}
              </div>
              <div class="what-changed-marker" id="what-changed-marker">
                <span class="what-changed-chip">
                  <span class="what-changed-icon" aria-hidden="true">⚡</span>
                  <span class="what-changed-text">${escapeHtml(vm.changeMoment.causeMarker)}</span>
                </span>
              </div>
              <div class="hero-cause-effect" id="hero-cause-effect" data-slot="chrome">
                ${escapeHtml(vm.changeMoment.heroCauseEffect)}
              </div>
              ${
                vm.changeMoment.priorLeaveTime && vm.changeMoment.newLeaveTime
                  ? `
                <div class="time-diff-display" id="time-diff-display" aria-label="Leave time updated from ${escapeHtml(vm.changeMoment.priorLeaveTime)} to ${escapeHtml(vm.changeMoment.newLeaveTime)}">
                  <span class="prior-time-struck"><s class="struck-through">${escapeHtml(vm.changeMoment.priorLeaveTime)}</s></span>
                  <span class="time-arrow" aria-hidden="true"> → </span>
                  <span class="new-time-highlight">${escapeHtml(vm.changeMoment.newLeaveTime)}</span>
                </div>
              `
                  : ''
              }
            </div>
          `
              : ''
          }
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
          <div class="mock-places-notice" data-slot="chrome" data-slot-reason="Places disclosure notice">${
            vm.isLive
              ? 'OpenStreetMap via Overpass (ODbL) · live nearby dining'
              : escapeHtml(
                  vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel')
                    ? STRINGS.fuel.mockPlacesNotice
                    : STRINGS.lunch.mockPlacesNotice
                )
          }</div>
          ${
            vm.isLive
              ? `
            <div class="v2-active-location-bar" role="region" aria-label="Active Location" data-slot="chrome" data-slot-reason="Location status bar">
              <span class="v2-location-badge" data-provenance="live" data-source="geolocation">📍 Location: ${escapeHtml(
                vm.locationLabel || 'Location shared'
              )}</span>
            </div>
          `
              : (vm.title === 'Low Fuel Warning' || vm.planId?.includes('fuel') || Boolean(vm.locationLabel))
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

        ${renderActionRow(vm)}

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
                data-provenance="${vm.isLive ? 'live' : 'fixture'}"
                ${vm.isLive ? 'data-source="overpass"' : ''}
              >
                <div class="v2-candidate-art compact-hero-thumb" role="img" aria-label="${escapeHtml(topC.photo.altText)}">
                  ${topC.photo.svgMarkup}
                  ${
                    vm.isLive
                      ? ''
                      : `<span class="v2-illustration-badge" data-slot="chrome" data-slot-reason="Simulated illustration badge">${escapeHtml(topC.photo.simulatedBadge)}</span>`
                  }
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
                  data-provenance="${vm.isLive ? 'live' : 'fixture'}"
                  ${vm.isLive ? 'data-source="overpass"' : ''}
                >
                  <div class="v2-candidate-art" role="img" aria-label="${escapeHtml(c.photo.altText)}">
                    ${c.photo.svgMarkup}
                    ${
                      vm.isLive
                        ? ''
                        : `<span class="v2-illustration-badge" data-slot="chrome" data-slot-reason="Simulated illustration badge">${escapeHtml(c.photo.simulatedBadge)}</span>`
                    }
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

        <!-- Signal Tiles Grid -->
        ${renderSignalTiles(vm)}

        <!-- Compact Map Strip inside Candidates Card (Finding 5) -->
        ${vm.map ? `<div class="v2-card-inline-map now-inline-map now-map-strip">${renderCompactMapStrip(vm.map, vm.isLive)}</div>` : ''}

        <div class="now-basis">
          <p data-slot="chrome" data-slot-reason="Static basis template">${escapeHtml(vm.basis)}</p>
        </div>
      </section>

      ${renderSectionedFeed(vm)}
    </div>
  `;
}

function renderSectionedFeed(vm: HomeCompositionVM): string {
  const ahead = vm.aheadItems || [];
  const proposals = vm.proposals || [];

  const nowTitle = vm.subjectTitle || vm.title;
  const arrivePart = vm.arriveTimeStr ? `Arrive ${vm.arriveTimeStr}` : undefined;
  const apptPart = vm.apptTimeStr ? `Starts ${vm.apptTimeStr}` : undefined;
  const timingParts = [
    vm.leaveTimeStr ? `Leave by ${vm.leaveTimeStr}` : undefined,
    arrivePart,
    apptPart,
  ].filter(Boolean);
  const nowSubtitle = timingParts.length > 0
    ? timingParts.join(' · ')
    : (vm.headline || 'Active recommendation for your day');
  const nowCountdown = vm.countdownStr || '';

  return `
    <div class="v2-sectioned-feed" id="v2-sectioned-feed">
      <!-- Section 1: Now -->
      <section class="feed-section feed-section-now" id="feed-section-now" aria-label="Now">
        <div class="feed-section-header">
          <div class="feed-section-heading-group">
            <h2 class="feed-section-title">Now</h2>
            <span class="feed-section-subtitle">What's happening right now.</span>
          </div>
        </div>
        <div class="card feed-now-card" data-provenance="${vm.isLive ? 'live' : 'fixture'}">
          <div class="feed-now-body">
            <div class="feed-now-text">
              <h3 class="feed-now-title">${escapeHtml(nowTitle)}</h3>
              <p class="feed-now-desc">${escapeHtml(nowSubtitle)}</p>
            </div>
            <span class="feed-countdown-pill">${escapeHtml(nowCountdown)}</span>
          </div>
        </div>
      </section>

      <!-- Section 2: Ahead -->
      <section class="feed-section feed-section-ahead" id="feed-section-ahead" aria-label="${escapeHtml(STRINGS.sections.ahead)}">
        <div class="feed-section-header">
          <div class="feed-section-heading-group">
            <h2 class="feed-section-title">${escapeHtml(STRINGS.sections.ahead)}</h2>
            <span class="feed-section-subtitle">What's coming up later.</span>
          </div>
          <button type="button" class="btn-see-all v2-see-all-link" id="link-ahead-see-all" aria-label="See all upcoming plans">See all ›</button>
        </div>
        <div class="ahead-list feed-ahead-grid">
          ${
            ahead.length > 0
              ? ahead
                  .map(
                    item => `
            <div class="card ahead-card" data-ahead-id="${escapeHtml(item.id)}" data-provenance="${vm.isLive ? 'live' : 'fixture'}" data-slot="chrome" data-slot-reason="Ahead card container">
              <h3 class="ahead-title" data-slot="chrome" data-slot-reason="Ahead card title">${escapeHtml(item.title)}</h3>
              <p class="ahead-subtitle" data-slot="chrome" data-slot-reason="Ahead card subtitle">${escapeHtml(item.subtitle)}</p>
            </div>
          `
                  )
                  .join('')
              : `
            <div class="card ahead-card feed-empty-card" data-provenance="${vm.isLive ? 'none' : 'fixture'}">
              <p class="ahead-subtitle" style="color: var(--color-muted);">No other plans scheduled for today.</p>
            </div>
          `
          }
        </div>
      </section>

      <!-- Section 3: For You -->
      <section class="feed-section feed-section-foryou" id="feed-section-foryou" aria-label="${escapeHtml(STRINGS.sections.forYou)}">
        <div class="feed-section-header">
          <div class="feed-section-heading-group">
            <h2 class="feed-section-title">${escapeHtml(STRINGS.sections.forYou)}</h2>
            <span class="feed-section-subtitle">Personalized suggestions, just for you.</span>
          </div>
          <button type="button" class="btn-see-all v2-see-all-link" id="link-foryou-see-all" aria-label="See all memory proposals">See all ›</button>
        </div>
        <div class="for-you-list">
          ${
            proposals.length > 0
              ? proposals
                  .map(
                    prop => `
            <div class="card proposal-card" data-proposal-key="${escapeHtml(prop.key)}" data-provenance="${prop.provenance || (prop.basis?.includes('Confirmed') ? 'user' : 'fixture')}" data-slot="chrome" data-slot-reason="Proposal card container">
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
                  .join('')
              : `
            <div class="card proposal-card feed-empty-card" data-provenance="${vm.isLive ? 'none' : 'fixture'}">
              <p class="proposal-basis" style="color: var(--color-muted);">No suggestions pending right now.</p>
            </div>
          `
          }
        </div>
      </section>
    </div>
  `;
}
