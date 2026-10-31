/**
 * Encoded Polyline Utilities
 * Supports Google polyline (precision 5) and OSRM/ORS polyline6 (precision 6).
 */

import type { Coordinate } from './routing-types.js';

export function decodePolyline(encoded: string, precision: 5 | 6 = 5): Coordinate[] {
  const points: Coordinate[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    // Round to precision decimals to avoid floating point artifacts
    const pLat = Math.round((lat / factor) * factor) / factor;
    const pLng = Math.round((lng / factor) * factor) / factor;
    points.push([pLat, pLng]);
  }

  return points;
}

export function encodePolyline(coordinates: readonly Coordinate[], precision: 5 | 6 = 5): string {
  const factor = Math.pow(10, precision);
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of coordinates) {
    const late = Math.round(lat * factor);
    const lnge = Math.round(lng * factor);
    output += encodeSigned(late - prevLat);
    output += encodeSigned(lnge - prevLng);
    prevLat = late;
    prevLng = lnge;
  }

  return output;
}

function encodeSigned(val: number): string {
  let s = val < 0 ? ~(val << 1) : val << 1;
  let chunk = '';
  while (s >= 0x20) {
    chunk += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  chunk += String.fromCharCode(s + 63);
  return chunk;
}
