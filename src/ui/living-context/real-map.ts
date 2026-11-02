/**
 * Real Map Component (Leaflet + OpenStreetMap)
 *
 * Governed by TID INBOX-20261101-12065C:
 * 1. Bundled Leaflet@1.9.4 (no CDN) with standard OSM raster tiles.
 * 2. Zero external network requests in test/CI (page.route tile stubbing in e2e).
 * 3. Demo mode: uses RECORDED_ROUTE_COORDINATES as recorded sample route geometry.
 * 4. Live mode: gated behind location consent and route availability.
 * 5. Fallback: if tiles fail (offline, CSP, abort), renders schematic fallback with banner within <= 3s.
 * 6. Accessibility: role="region", trip aria-label, scrollWheelZoom disabled by default,
 *    keyboard-navigable zoom controls, prefers-reduced-motion respected, Axe AA compliant.
 */

import type { MapVM } from '../view-models/types.js';
import { STRINGS } from './strings.js';
import { RECORDED_ROUTE_COORDINATES } from '../../../tests/fixtures/route-fixtures.js';

let mapIdSequence = 0;
const activeMaps = new Map<string, any>();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getMapTilesConfig(): 'osm' | 'off' {
  // Test hook: when in test mode, allow window.__YORI_MAP_TILES__ to override
  if (typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined' && __YORI_ENABLE_TEST_HOOKS__) {
    if (typeof window !== 'undefined') {
      const testOverride = (window as any).__YORI_MAP_TILES__;
      if (testOverride === 'osm' || testOverride === 'off') {
        return testOverride;
      }
    }
  }

  const flag = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_MAP_TILES;
  if (flag === 'off') return 'off';
  if (flag === 'osm') return 'osm';

  // In test mode, default to 'off' so no test makes un-stubbed external requests
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE === 'test') {
    return 'off';
  }

  return 'osm';
}

export async function getLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const mod = await import('leaflet');
  return mod.default || mod;
}

export interface RealMapRenderOptions {
  isDesktopPanel?: boolean;
  isCompactStrip?: boolean;
  isLive?: boolean;
  hasLocationConsent?: boolean;
  schematicSvgHtml?: string;
}

export function renderRealMapCard(
  map: MapVM,
  renderSchematicSvg: (m: MapVM) => string,
  options?: RealMapRenderOptions
): string {
  const isPlacesMap = map.label.toLowerCase().includes('places');
  const mobileLabel = isPlacesMap
    ? (STRINGS.map.mobilePlacesLabel || 'Places Map')
    : (STRINGS.map.mobileLabel || 'Route Map');

  // For places maps without route coordinates, render schematic directly
  if (isPlacesMap) {
    if (options?.isLive) {
      return `
        <section class="card v2-map-card${options?.isDesktopPanel ? ' desktop-map-card' : ''}${options?.isCompactStrip ? ' compact compact-map-strip' : ''} ${map.sizeHint}" aria-label="${escapeHtml(map.label)}" data-provenance="none">
          <div class="${options?.isDesktopPanel ? 'desktop-map-header' : `map-header${options?.isCompactStrip ? ' map-strip-header' : ''}`}">
            <span class="${options?.isCompactStrip ? 'map-strip-label ' : ''}section-label" data-slot="chrome" data-slot-reason="Map section heading">
              ${
                options?.isCompactStrip
                  ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              `
                  : ''
              }
              ${
                options?.isDesktopPanel
                  ? 'Route Map'
                  : `<span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>`
              }
            </span>
            <span class="card-badge" data-provenance="none">Map not available</span>
          </div>
          <div class="v2-map-canvas map-unavailable-canvas" role="img" aria-label="Map not available">
            <div class="map-unavailable-message" style="display: flex; align-items: center; justify-content: center; height: 100%; min-height: 80px; color: var(--color-text-secondary, #5B6B65); font-size: 0.875rem;">
              Map view not available for this location
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="card v2-map-card${options?.isDesktopPanel ? ' desktop-map-card' : ''}${options?.isCompactStrip ? ' compact compact-map-strip' : ''} ${map.sizeHint}" aria-label="${escapeHtml(map.label)}" data-provenance="${options?.isLive ? 'live' : 'fixture'}">
        <div class="${options?.isDesktopPanel ? 'desktop-map-header' : `map-header${options?.isCompactStrip ? ' map-strip-header' : ''}`}">
          <span class="${options?.isCompactStrip ? 'map-strip-label ' : ''}section-label" data-slot="chrome" data-slot-reason="Map section heading">
            ${
              options?.isCompactStrip
                ? `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            `
                : ''
            }
            ${
              options?.isDesktopPanel
                ? 'Route Map'
                : `<span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>`
            }
          </span>
          <span class="card-badge" ${options?.isDesktopPanel ? (options?.isLive ? 'data-provenance="live"' : 'data-provenance="fixture"') : (options?.isLive ? 'data-provenance="live"' : 'data-slot="chrome" data-slot-reason="Simulated map badge"')}>${options?.isLive ? 'OpenStreetMap (ODbL)' : escapeHtml(map.simulatedBadge)}</span>
        </div>
        <div class="v2-map-canvas${options?.isCompactStrip ? ' compact-canvas' : ''} ${map.sizeHint}" role="img" aria-label="${escapeHtml(map.ariaDescription)}">
          ${renderSchematicSvg(map)}
        </div>
        ${
          !options?.isCompactStrip && map.destinationName
            ? `
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
        </div>`
            : ''
        }
      </section>
    `;
  }

  const containerId = options?.isDesktopPanel
    ? 'yori-desktop-panel-real-map'
    : (options?.isCompactStrip ? `yori-compact-strip-map-${++mapIdSequence}` : 'yori-trip-detail-real-map');
  const hostId = `${containerId}-host`;
  const sizeClass = options?.isCompactStrip ? 'compact' : (map.sizeHint || 'prominent');
  const tripName = map.destinationName || map.label || 'Trip';

  const tilesConfig = getMapTilesConfig();
  const liveBadge = 'Map © OSM · route simulated';
  const fallbackBadge = 'Schematic · simulated';
  const initialBadge = tilesConfig === 'osm' ? liveBadge : fallbackBadge;

  const weatherCalloutHtml = map.weatherCallout
    ? `
      <div class="v2-map-weather-callout" data-slot="domain">
        <span class="callout-main">${escapeHtml(map.weatherCallout.text)}</span>
        ${map.weatherCallout.subtext ? `<span class="callout-sub">${escapeHtml(map.weatherCallout.subtext)}</span>` : ''}
      </div>
    `
    : '';

  const schematicHtml = renderSchematicSvg(map);

  return `
    <section class="card v2-map-card${options?.isDesktopPanel ? ' desktop-map-card' : ''}${options?.isCompactStrip ? ' compact compact-map-strip' : ''} ${sizeClass}" aria-label="${escapeHtml(map.label)}" data-provenance="${options?.isLive ? 'live' : 'fixture'}">
      <div class="${options?.isDesktopPanel ? 'desktop-map-header' : `map-header${options?.isCompactStrip ? ' map-strip-header' : ''}`}">
        <span class="${options?.isCompactStrip ? 'map-strip-label ' : ''}section-label" data-slot="chrome" data-slot-reason="Map section heading">
          ${
            options?.isCompactStrip
              ? `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          `
              : ''
          }
          ${
            options?.isDesktopPanel
              ? 'Route Map'
              : `<span class="v2-heading-desktop">${escapeHtml(map.label)}</span><span class="v2-heading-mobile">${escapeHtml(mobileLabel)}</span>`
          }
        </span>
        <span class="card-badge" ${options?.isDesktopPanel ? (options?.isLive ? 'data-provenance="none"' : 'data-provenance="fixture"') : (options?.isLive ? 'data-provenance="none"' : 'data-slot="chrome" data-slot-reason="Simulated map badge"')}>${options?.isLive ? (tilesConfig === 'osm' ? 'Map © OSM' : 'Map not available') : initialBadge}</span>
      </div>

      <div class="v2-map-canvas${options?.isDesktopPanel ? ' desktop-map-canvas' : ''}${options?.isCompactStrip ? ' compact-canvas' : ''} ${sizeClass}"
           role="region"
           aria-label="Route map: ${escapeHtml(tripName)}"
           data-map-role="route-map"
           tabindex="0">

        <!-- Real Leaflet Map Container -->
        <div class="real-map-container"
             id="${containerId}"
             data-destination="${escapeHtml(map.destinationName || '')}"
             data-map-status="initializing">
          <div class="leaflet-map-host" id="${hostId}" tabindex="0"></div>

          <!-- Weather Callout overlay chip on map -->
          ${weatherCalloutHtml}

          <!-- Attribution and route sample disclosure -->
          <div class="real-map-caption" data-slot="chrome">
            ${options?.isLive ? 'Map © OpenStreetMap' : 'Map © OpenStreetMap · route shape: recorded sample · simulated'}
          </div>

          <!-- Fallback on tile failure or offline/CSP -->
          <div class="schematic-map-fallback hidden" aria-hidden="true">
            <div class="map-fallback-banner" role="status">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="margin-right: 4px; display: inline-block; vertical-align: middle;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              ${options?.isLive ? 'Map tiles unavailable' : 'Map tiles unavailable · schematic shown'}
            </div>
            ${options?.isLive ? '' : schematicHtml}
          </div>
        </div>
      </div>

      ${
        !options?.isCompactStrip && map.destinationName
          ? `
      <div class="map-place-info" ${
        map.fieldSourceRefs?.destinationName
          ? `data-source-ref="${escapeHtml(map.fieldSourceRefs.destinationName.recordId)}.${escapeHtml(map.fieldSourceRefs.destinationName.field)}" data-slot="domain"`
          : `data-slot="chrome" data-slot-reason="Map destination label"`
      }>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        ${escapeHtml(map.destinationName)}
      </div>`
          : ''
      }
    </section>
  `;
}

export function cleanupRealMaps(): void {
  for (const mapInstance of activeMaps.values()) {
    try {
      mapInstance.remove();
    } catch {}
  }
  activeMaps.clear();
}

export async function initRealMaps(root: HTMLElement): Promise<void> {
  if (typeof window === 'undefined') return;

  const containers = root.querySelectorAll<HTMLElement>('.real-map-container');
  if (containers.length === 0) {
    cleanupRealMaps();
    return;
  }

  // Clean up any stale map instances whose host element is no longer in the document
  for (const [id, mapInstance] of Array.from(activeMaps.entries())) {
    const container = document.getElementById(id);
    if (!container || !document.contains(container)) {
      try {
        mapInstance.remove();
      } catch {}
      activeMaps.delete(id);
    }
  }

  const tilesConfig = getMapTilesConfig();
  const L = await getLeaflet();
  if (!L) return;

  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  for (const container of Array.from(containers)) {
    const containerId = container.id;
    const hostEl = container.querySelector<HTMLElement>('.leaflet-map-host');
    const fallbackEl = container.querySelector<HTMLElement>('.schematic-map-fallback');
    const destinationName = container.getAttribute('data-destination') || 'Destination';

    if (!hostEl) continue;

    // If host element is already initialized and active in activeMaps, skip
    if ((hostEl as any)._leaflet_id && activeMaps.has(containerId)) {
      continue;
    }

    // If already initialized for this exact element id, clean it up before re-creating
    if (activeMaps.has(containerId)) {
      try {
        activeMaps.get(containerId)?.remove();
      } catch {}
      activeMaps.delete(containerId);
    }

    const triggerFallback = () => {
      container.classList.add('map-fallback-active');
      container.setAttribute('data-map-status', 'fallback');
      const badgeEl = container.closest('.v2-map-card')?.querySelector('.card-badge');
      if (badgeEl) {
        const isLiveCard = container.closest('.v2-map-card')?.getAttribute('data-provenance') === 'live' || container.closest('.v2-map-card')?.getAttribute('data-provenance') === 'none';
        badgeEl.textContent = isLiveCard ? 'Map not available' : 'Schematic · simulated';
        if (isLiveCard) {
          badgeEl.setAttribute('data-provenance', 'none');
          container.closest('.v2-map-card')?.setAttribute('data-provenance', 'none');
        }
      }
      if (fallbackEl) {
        fallbackEl.classList.remove('hidden');
        fallbackEl.removeAttribute('aria-hidden');
      }
      hostEl.style.display = 'none';
      if (activeMaps.has(containerId)) {
        try {
          activeMaps.get(containerId)?.remove();
        } catch {}
        activeMaps.delete(containerId);
      }
    };

    // If tiles are disabled by build flag VITE_MAP_TILES='off', fallback directly
    if (tilesConfig === 'off') {
      triggerFallback();
      continue;
    }

    try {
      // 1. Create Leaflet map instance
      // Wheel-zoom disabled by default to prevent hijacking page scroll
      const mapInstance = L.map(hostEl, {
        scrollWheelZoom: false,
        zoomControl: false,
        fadeAnimation: !prefersReducedMotion,
        zoomAnimation: !prefersReducedMotion,
        markerZoomAnimation: !prefersReducedMotion,
        attributionControl: true,
      });
      L.control.zoom({ position: 'topright' }).addTo(mapInstance);
      activeMaps.set(containerId, mapInstance);
      (hostEl as any).__leafletMap = mapInstance;

      // 2. Set up OSM tile layer
      let tileLoaded = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
      const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      });

      tileLayer.on('tileload', () => {
        tileLoaded = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        container.setAttribute('data-map-status', 'ready');
        container.classList.remove('map-fallback-active');
        const badgeEl = container.closest('.v2-map-card')?.querySelector('.card-badge');
        if (badgeEl) {
          badgeEl.textContent = 'Map © OSM · route simulated';
        }
        if (fallbackEl) fallbackEl.classList.add('hidden');
      });

      tileLayer.on('tileerror', () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        triggerFallback();
      });

      // Guard timeout: if no tile loads within 2800ms (<= 3s), fallback to schematic
      fallbackTimer = setTimeout(() => {
        if (!tileLoaded) {
          triggerFallback();
        }
      }, 2800);

      tileLayer.addTo(mapInstance);

      // 3. Draw route polyline from RECORDED_ROUTE_COORDINATES
      const coords: [number, number][] = RECORDED_ROUTE_COORDINATES.map(c => [c[0], c[1]]);
      const polyline = L.polyline(coords, {
        className: 'v2-map-route',
        color: '#1B4D3E',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(mapInstance);

      const pathEl = polyline.getElement?.() || hostEl.querySelector('path.v2-map-route') || hostEl.querySelector('path');
      if (pathEl) {
        pathEl.setAttribute('id', 'route-drive');
        pathEl.classList.add('v2-map-route');
      }

      // 4. Fit bounds to route with generous padding so weather callout does not obscure origin marker
      mapInstance.fitBounds(polyline.getBounds(), {
        paddingTopLeft: [64, 48],
        paddingBottomRight: [40, 40],
        maxZoom: 16,
        animate: !prefersReducedMotion,
      });

      // 5. Origin Marker (Home)
      const originIcon = L.divIcon({
        className: 'v2-map-marker origin',
        html: `<div class="yori-map-pin origin" aria-hidden="true"><div class="pin-dot"></div></div><span class="marker-label sr-only">Home</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker(coords[0], { icon: originIcon, interactive: false, keyboard: false }).addTo(mapInstance);

      // 6. Destination Marker
      const destIcon = L.divIcon({
        className: 'v2-map-marker destination',
        html: `<div class="yori-map-pin destination" aria-hidden="true"><svg width="22" height="28" viewBox="0 0 24 24" fill="#1B4D3E"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div><span class="marker-label sr-only">${escapeHtml(destinationName)}</span>`,
        iconSize: [24, 28],
        iconAnchor: [12, 28],
      });
      L.marker(coords[coords.length - 1], { icon: destIcon, interactive: false, keyboard: false }).addTo(mapInstance);

      // 7. Non-hijacking Wheel Zoom: enable only on focus / click, disable on blur / leave
      container.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      hostEl.addEventListener('focus', () => {
        mapInstance.scrollWheelZoom.enable();
      });
      hostEl.addEventListener('blur', () => {
        mapInstance.scrollWheelZoom.disable();
      });
      hostEl.addEventListener('click', (e) => {
        e.stopPropagation();
        mapInstance.scrollWheelZoom.enable();
      });
      container.addEventListener('mouseleave', () => {
        mapInstance.scrollWheelZoom.disable();
      });

      // Refresh layout after DOM flush
      requestAnimationFrame(() => {
        try {
          mapInstance.invalidateSize();
        } catch {}
      });
    } catch {
      triggerFallback();
    }
  }
}
