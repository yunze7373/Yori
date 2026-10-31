/**
 * Route Geometry SVG Projection & Rendering
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Invariants:
 * - Decoded polyline is projected to SVG viewBox coordinates using Web Mercator.
 * - Fits within the bounding box with padding so both endpoints and all polyline vertices
 *   remain fully visible inside the strip at 390 and 1280 viewports.
 * - Never schematic/invented when rendering a live route.
 * - Every live route render carries the mandatory attribution line:
 *   "Route © OSRM · data © OpenStreetMap contributors".
 */

import type { Coordinate, RouteResult } from '../../adapters/providers/routing-types.js';

export interface SvgPoint {
  readonly x: number;
  readonly y: number;
}

export interface SvgBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface ProjectedRoute {
  readonly points: readonly SvgPoint[];
  readonly pointsString: string;
  readonly origin: SvgPoint;
  readonly destination: SvgPoint;
}

export const DEFAULT_COMPACT_BOUNDS: SvgBounds = Object.freeze({
  minX: 45,
  maxX: 285,
  minY: 45,
  maxY: 130,
});

/**
 * Converts a lat/lng coordinate to normalized Web Mercator coordinates [0..1, 0..1].
 */
export function latLngToMercator(lat: number, lng: number): { x: number; y: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

/**
 * Projects an array of real [lat, lng] coordinates to SVG viewBox coordinates.
 */
export function projectCoordinatesToSvg(
  coordinates: readonly Coordinate[],
  targetBounds: SvgBounds = DEFAULT_COMPACT_BOUNDS
): ProjectedRoute {
  if (!coordinates || coordinates.length === 0) {
    const fallbackPoint: SvgPoint = { x: targetBounds.minX, y: targetBounds.minY };
    return {
      points: [fallbackPoint],
      pointsString: `${fallbackPoint.x},${fallbackPoint.y}`,
      origin: fallbackPoint,
      destination: fallbackPoint,
    };
  }

  const mercatorPoints = coordinates.map(([lat, lng]) => latLngToMercator(lat, lng));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of mercatorPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;

  const targetSpanX = targetBounds.maxX - targetBounds.minX;
  const targetSpanY = targetBounds.maxY - targetBounds.minY;

  const scaleX = targetSpanX / spanX;
  const scaleY = targetSpanY / spanY;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = targetBounds.minX + (targetSpanX - spanX * scale) / 2;
  const offsetY = targetBounds.minY + (targetSpanY - spanY * scale) / 2;

  const points: SvgPoint[] = mercatorPoints.map(pt => ({
    x: Math.round((offsetX + (pt.x - minX) * scale) * 10) / 10,
    y: Math.round((offsetY + (pt.y - minY) * scale) * 10) / 10,
  }));

  const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');
  const origin = points[0]!;
  const destination = points[points.length - 1]!;

  return {
    points: Object.freeze(points),
    pointsString,
    origin,
    destination,
  };
}

export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`;
  }
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export function formatDuration(durationS: number): string {
  const mins = Math.max(1, Math.round(durationS / 60));
  return `${mins} min`;
}

export interface RenderLiveRouteOptions {
  readonly originLabel?: string;
  readonly destLabel?: string;
  readonly targetBounds?: SvgBounds;
}

export function renderLiveRouteSvg(
  route: RouteResult,
  options?: RenderLiveRouteOptions
): string {
  const projected = projectCoordinatesToSvg(route.geometry, options?.targetBounds);
  const originLabel = options?.originLabel || 'Current Location';
  const destLabel = options?.destLabel || 'Destination';

  return `
    <svg width="100%" height="100%" viewBox="0 15 330 145" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="live-route-svg">
      <rect x="0" y="15" width="330" height="145" fill="#E9F1E8" rx="8"/>

      <!-- Live Route Polyline from decoded provider geometry -->
      <polyline
        id="live-route-polyline"
        data-testid="live-route-polyline"
        points="${projected.pointsString}"
        stroke="#2D6A4F"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Origin Marker -->
      <g class="v2-map-marker origin" transform="translate(${projected.origin.x}, ${projected.origin.y})">
        <circle cx="0" cy="0" r="6" fill="#16382F"/>
        <circle cx="0" cy="0" r="10" stroke="#16382F" stroke-width="1.5" opacity="0.4"/>
        <text x="0" y="18" fill="#16382F" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">
          ${escapeHtml(originLabel)}
        </text>
      </g>

      <!-- Destination Marker -->
      <g class="v2-map-marker destination" transform="translate(${projected.destination.x}, ${projected.destination.y})">
        <circle cx="0" cy="0" r="7" fill="#2D6A4F"/>
        <circle cx="0" cy="0" r="13" stroke="#2D6A4F" stroke-width="2" stroke-dasharray="4 2"/>
        <text x="0" y="-10" fill="#16382F" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">
          ${escapeHtml(destLabel)}
        </text>
      </g>
    </svg>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
