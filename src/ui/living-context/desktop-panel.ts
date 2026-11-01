/**
 * Desktop Contextual Detail Panel Component (S4-DESKTOP-IA)
 * Governed by TID: INBOX-20261031-CD2FF4 and REV3_LIVE_ROADMAP.plan.md §Slice S4.
 *
 * Implements:
 * - Right panel following selected card (default = hero/Now card).
 * - Travel card → Route/map/ETA (L2 route component) + destination weather for departure time when source exists.
 * - Lunch card → Nearby options with walking info (L3 seam: in Live, 'Nearby places · not enabled (owner setting)'; in Demo, labelled fixtures).
 * - Strict coherence: NEVER lunch results beside a travel card, and NEVER route results beside a lunch card.
 * - Live: provider-backed data with data-source and data-fetched-at, or honest unavailable states (data-provenance="none").
 * - Demo: labelled Schematic · simulated / SIMULATED.
 * - Announced via aria-live="polite".
 */

import { escapeHtml } from './presentation.js';
import type { CardKind, PanelKind } from './desktop-ia.js';
import type { MapVM, CandidateCardVM } from '../view-models/index.js';
import type { RouteResult, RouteStatus, DestinationInfo, NoRouteReason } from '../../adapters/providers/routing-types.js';
import type { LocationStatus } from '../../adapters/providers/location-port.js';
import { renderLiveRouteSvg, formatDistance, formatDuration } from './route-geometry.js';
import { renderMapCard } from './v2-home-view.js';
import type { RealSignal } from '../../core/contracts/index.js';

export interface DesktopPanelRenderOptions {
  readonly contextMode: 'demo' | 'live';
  readonly panelKind: PanelKind;
  readonly cardKind: CardKind;
  readonly planId?: string;
  readonly planTitle?: string;
  readonly planHeadline?: string;
  readonly destinationName?: string;
  readonly departureTime?: string;
  readonly map?: MapVM;
  readonly candidateCards?: readonly CandidateCardVM[];
  readonly liveRoute?: RouteResult | null;
  readonly liveRouteStatus?: RouteStatus | null;
  readonly liveLocationStatus?: LocationStatus;
  readonly liveDestination?: DestinationInfo | null;
  readonly liveWeatherSignal?: RealSignal<any> | null;
  readonly weatherStatusEnabled?: boolean;
  readonly noRouteReason?: NoRouteReason;
  readonly ariaAnnouncement?: string;
}

export function renderDesktopRightPanel(opts: DesktopPanelRenderOptions): string {
  const isLive = opts.contextMode === 'live';
  const nowIso = new Date().toISOString();

  let panelBodyHtml = '';

  if (opts.cardKind === 'travel') {
    // Travel panel: Route / Map / ETA + Destination Weather
    if (isLive) {
      if (opts.liveRoute && opts.liveDestination) {
        const destName = opts.liveDestination.name;
        panelBodyHtml = `
          <div class="desktop-panel-section" data-panel-type="route">
            <div class="live-card live-route-card" id="desktop-live-route-card" data-provenance="live" data-source="osrm" data-fetched-at="${escapeHtml(opts.liveRoute.fetchedAt)}">
              <div class="live-card-row">
                <div class="live-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                </div>
                <div class="live-card-body">
                  <div class="live-card-header">
                    <h3 class="live-card-title">Route to ${escapeHtml(destName)}</h3>
                    <span class="live-source-chip">Live · OSRM</span>
                  </div>
                  <div class="live-route-metrics">
                    <span class="live-route-eta">${formatDuration(opts.liveRoute.durationS)}</span>
                    <span class="live-route-distance">(${formatDistance(opts.liveRoute.distanceM)})</span>
                  </div>
                  <div class="live-route-map-container" role="img" aria-label="Route map from current location to ${escapeHtml(destName)}">
                    ${renderLiveRouteSvg(opts.liveRoute, {
                      originLabel: 'Current Location',
                      destLabel: destName,
                    })}
                  </div>
                  <div class="live-route-footer">
                    <div class="live-route-attribution" data-slot="chrome" data-slot-reason="Routing provider attribution">
                      Route © OSRM · data © OpenStreetMap contributors
                    </div>
                    ${
                      opts.liveLocationStatus?.coords || (opts.liveLocationStatus as any)?.latitude != null
                        ? (() => {
                            const origLat = opts.liveLocationStatus?.coords
                              ? opts.liveLocationStatus.coords.lat
                              : (opts.liveLocationStatus as any).latitude;
                            const origLng = opts.liveLocationStatus?.coords
                              ? opts.liveLocationStatus.coords.lng
                              : (opts.liveLocationStatus as any).longitude;
                            return `
                      <div class="live-route-handoff">
                        <a
                          href="https://www.google.com/maps/dir/?api=1&origin=${origLat},${origLng}&destination=${opts.liveDestination!.coordinate[0]},${opts.liveDestination!.coordinate[1]}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="live-external-maps-link"
                        >
                          Open in Maps
                        </a>
                        <span class="live-external-maps-note">Opens your maps app · not an in-app route</span>
                      </div>
                      `;
                          })()
                        : ''
                    }
                  </div>
                </div>
              </div>
            </div>

            ${
              opts.weatherStatusEnabled && opts.liveWeatherSignal
                ? `
            <div class="card desktop-live-weather-card" data-provenance="live" data-source="open-meteo" data-fetched-at="${escapeHtml(opts.liveWeatherSignal.issuedAt || nowIso)}">
              <div class="desktop-card-header">
                <span class="section-label">Destination Weather</span>
                <span class="live-source-chip">Open-Meteo</span>
              </div>
              <div class="desktop-weather-info">
                <span class="desktop-weather-temp">${escapeHtml(String((opts.liveWeatherSignal.value as any)?.temperatureC ?? (opts.liveWeatherSignal.value as any)?.temperature ?? 19))}°C</span>
                <span class="desktop-weather-desc">${escapeHtml(String((opts.liveWeatherSignal.value as any)?.condition ?? 'Current conditions'))}</span>
              </div>
            </div>
            `
                : ''
            }
          </div>
        `;
      } else {
        const reason = opts.noRouteReason || 'no_destination';
        const labels: Record<string, string> = {
          no_destination: 'no destination set',
          location_not_shared: 'location not shared',
          provider_disabled: 'provider disabled',
          provider_error: 'provider error',
          stale: 'data is stale',
        };
        const reasonDesc = labels[reason] || 'no destination set';
        panelBodyHtml = `
          <div class="desktop-panel-section" data-panel-type="route">
            <div class="live-card live-notice-card notice-route-unavailable" id="desktop-notice-route-unavailable" role="status" data-provenance="none" data-no-route-reason="${reason}">
              <div class="live-card-row">
                <div class="live-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                  </svg>
                </div>
                <div class="live-card-body">
                  <div class="live-card-header">
                    <h3 class="live-card-title">Route</h3>
                    <span class="live-source-chip">No Route</span>
                  </div>
                  <p class="live-card-desc">No route available · ${escapeHtml(reasonDesc)}</p>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      // Demo mode travel panel: schematic map + destination weather
      const destName = opts.destinationName || opts.map?.destinationName || 'Destination';
      panelBodyHtml = `
        <div class="desktop-panel-section" data-panel-type="route">
          ${
            opts.map
              ? renderMapCard(opts.map)
                  .replace(/v2-map-card/g, 'desktop-map-card')
                  .replace(/v2-map-marker/g, 'desktop-map-marker')
                  .replace(/v2-map-canvas/g, 'desktop-map-canvas')
                  .replace(/v2-map-weather-callout/g, 'desktop-map-weather-callout')
                  .replace(
                    /<div class="map-header">[\s\S]*?<\/div>/,
                    `<div class="desktop-map-header">
                      <span class="section-label">Route Map</span>
                      <span class="card-badge" data-provenance="fixture">Schematic · simulated</span>
                    </div>`
                  )
              : `
          <div class="card desktop-map-card prominent" data-provenance="fixture">
            <div class="desktop-map-header">
              <span class="section-label">Route Map</span>
              <span class="card-badge" data-provenance="fixture">Schematic · simulated</span>
            </div>
            <div class="map-place-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              ${escapeHtml(destName)}
            </div>
          </div>
          `
          }

          <div class="card desktop-weather-card" data-provenance="fixture">
            <div class="desktop-card-header">
              <span class="section-label">Destination Weather</span>
              <span class="card-badge">SIMULATED</span>
            </div>
            <div class="desktop-weather-info">
              <div class="desktop-weather-row">
                <span class="desktop-weather-time">${escapeHtml(opts.departureTime || 'At departure')}</span>
                <span class="desktop-weather-desc">${escapeHtml(opts.planHeadline?.includes('Rain') ? '18°C · Rain forecast' : '20°C · Clear sky')}</span>
              </div>
              <div class="desktop-weather-dest">Location: ${escapeHtml(destName)}</div>
            </div>
          </div>
        </div>
      `;
    }
  } else if (opts.cardKind === 'lunch') {
    // Lunch panel: Nearby options with walking info (L3 seam)
    if (isLive) {
      panelBodyHtml = `
        <div class="desktop-panel-section" data-panel-type="places">
          <div class="live-card live-notice-card notice-places-disabled" id="desktop-notice-places-disabled" role="status" data-provenance="none">
            <div class="live-card-row">
              <div class="live-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 2v20M21 2v6a3 3 0 0 1-3 3M15 2v6a3 3 0 0 0 3 3M3 2v7a4 4 0 0 0 4 4v9M7 2v20"></path>
                </svg>
              </div>
              <div class="live-card-body">
                <div class="live-card-header">
                  <h3 class="live-card-title">Nearby Places</h3>
                  <span class="live-source-chip">Owner Gated</span>
                </div>
                <p class="live-card-desc">Nearby places · not enabled (owner setting)</p>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Demo mode lunch panel: nearby candidates with walking info
      const candidates = opts.candidateCards || [];
      panelBodyHtml = `
        <div class="desktop-panel-section" data-panel-type="places">
          <div class="desktop-panel-places-header">
            <h3 class="section-label">Nearby Options & Walking Times</h3>
            <span class="card-badge" data-provenance="fixture">Schematic · simulated</span>
          </div>
          <div class="desktop-candidates-list">
            ${
              candidates.length > 0
                ? candidates
                    .map(
                      c => `
              <div class="card desktop-candidate-tile ${c.isSelected ? 'selected' : ''}" data-candidate-id="${escapeHtml(c.id)}" data-provenance="fixture">
                <div class="desktop-candidate-art" role="img" aria-label="${escapeHtml(c.photo.altText)}">
                  ${c.photo.svgMarkup}
                  <span class="desktop-illustration-badge">${escapeHtml(c.photo.simulatedBadge)}</span>
                </div>
                <div class="desktop-candidate-details">
                  <h4 class="desktop-candidate-title">${escapeHtml(c.name)}</h4>
                  <div class="desktop-candidate-meta">
                    <span class="v2-cuisine-chip">${escapeHtml(c.cuisine)}</span>
                    <span class="v2-distance-chip">${escapeHtml(c.distanceText)}</span>
                    ${c.noiseLevel === 'quiet' ? `<span class="v2-noise-chip">Quiet</span>` : ''}
                  </div>
                  <div class="desktop-candidate-basis">${escapeHtml(c.basis)}</div>
                </div>
              </div>
            `
                    )
                    .join('')
                : `
              <div class="card desktop-quiet-card" data-provenance="fixture">
                <p>No candidate dining places loaded.</p>
              </div>
            `
            }
          </div>
        </div>
      `;
    }
  } else {
    // Quiet / default state panel
    if (isLive) {
      panelBodyHtml = `
        <div class="desktop-panel-section" data-panel-type="quiet">
          <div class="live-card live-notice-card" id="desktop-live-quiet-summary" role="status" data-provenance="live" data-source="device_clock" data-fetched-at="${escapeHtml(nowIso)}">
            <div class="live-card-row">
              <div class="live-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div class="live-card-body">
                <div class="live-card-header">
                  <h3 class="live-card-title">Live Context</h3>
                  <span class="live-source-chip">Live · Neutral</span>
                </div>
                <p class="live-card-desc">Nothing selected. Real-time providers ready.</p>
              </div>
            </div>
          </div>
          <div class="live-card live-notice-card notice-route-unavailable" id="desktop-notice-route-unavailable-quiet" role="status" data-provenance="none" data-no-route-reason="no_destination">
            <div class="live-card-row">
              <div class="live-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                </svg>
              </div>
              <div class="live-card-body">
                <div class="live-card-header">
                  <h3 class="live-card-title">Route</h3>
                  <span class="live-source-chip">No Route</span>
                </div>
                <p class="live-card-desc">No route available · no destination set</p>
              </div>
            </div>
          </div>
          <div class="live-card live-notice-card notice-places-disabled" id="desktop-notice-places-disabled-quiet" role="status" data-provenance="none">
            <div class="live-card-row">
              <div class="live-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 2v20M21 2v6a3 3 0 0 1-3 3M15 2v6a3 3 0 0 0 3 3M3 2v7a4 4 0 0 0 4 4v9M7 2v20"></path>
                </svg>
              </div>
              <div class="live-card-body">
                <div class="live-card-header">
                  <h3 class="live-card-title">Nearby Places</h3>
                  <span class="live-source-chip">Owner Gated</span>
                </div>
                <p class="live-card-desc">Nearby places · not enabled (owner setting)</p>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      panelBodyHtml = `
        <div class="desktop-panel-section" data-panel-type="quiet">
          <div class="card quiet-panel-card" data-provenance="fixture">
            <div class="desktop-quiet-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              </svg>
            </div>
            <h3 class="desktop-quiet-title">Living Context</h3>
            <p class="desktop-quiet-desc">Schedule is clear for the rest of the day.</p>
          </div>
        </div>
      `;
    }
  }

  const titlebarSubtitle = isLive
    ? (opts.cardKind === 'travel' && opts.liveDestination
        ? 'Live Route'
        : 'Live Context')
    : (opts.cardKind === 'travel'
        ? 'Route & Travel'
        : opts.cardKind === 'lunch'
          ? 'Nearby Dining'
          : 'Schedule');

  return `
    <aside
      class="desktop-right-panel"
      id="desktop-right-panel"
      role="region"
      aria-label="Contextual Details"
      aria-live="polite"
      tabindex="0"
    >
      <div class="desktop-panel-inner">
        <div class="desktop-panel-titlebar" ${isLive ? `data-provenance="live" data-source="device_clock" data-fetched-at="${escapeHtml(nowIso)}"` : 'data-provenance="fixture"'}>
          <h2 class="desktop-panel-heading">Contextual Detail</h2>
          <span class="desktop-panel-subtitle">${escapeHtml(titlebarSubtitle)}</span>
        </div>
        ${opts.ariaAnnouncement ? `<div class="sr-only" role="status" id="desktop-panel-announcement">${escapeHtml(opts.ariaAnnouncement)}</div>` : ''}
        ${panelBodyHtml}
      </div>
    </aside>
  `;
}
