/**
 * Google Routes adapter (DEMO_RESCUE D6): server-side computeRoutes for DRIVE / TRANSIT / WALK.
 * - The API key travels ONLY in the X-Goog-Api-Key request header; never in a URL, a response,
 *   a log line or the browser bundle (GOOGLE_MAPS_API_KEY is read by the proxy from env).
 * - Field mask: duration, distance, step travel modes and a transit summary (line, vehicle, stop
 *   names, stop count, headsign). No polyline and no stop coordinates are requested.
 * - Every call is reserved in the Routes ledger first (60/day hard stop, refused before the call).
 * - Errors are classified without echoing Google's body: key_not_enabled (403 PERMISSION_DENIED /
 *   SERVICE_DISABLED / API_KEY_INVALID), quota_exceeded (429), timeout, ledger_stop, no_routes.
 */

import type { GoogleRoutesLedger } from './google-routes-ledger.js';

export const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const GOOGLE_ROUTES_TIMEOUT_MS = 8000;
export const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.transitDetails.stopDetails.departureStop.name',
  'routes.legs.steps.transitDetails.stopDetails.arrivalStop.name',
  'routes.legs.steps.transitDetails.transitLine.name',
  'routes.legs.steps.transitDetails.transitLine.nameShort',
  'routes.legs.steps.transitDetails.transitLine.vehicle.type',
  'routes.legs.steps.transitDetails.stopCount',
  'routes.legs.steps.transitDetails.headsign',
].join(',');

export type GoogleTravelMode = 'DRIVE' | 'TRANSIT' | 'WALK';

export interface TransitLegSummary {
  readonly line?: string;
  readonly vehicle?: string;
  readonly from?: string;
  readonly to?: string;
  readonly stops?: number;
  readonly headsign?: string;
}

export type GoogleRouteResult =
  | {
      readonly ok: true;
      readonly mode: GoogleTravelMode;
      readonly durationSeconds: number;
      readonly distanceMeters: number;
      readonly transit: readonly TransitLegSummary[];
      readonly fetchedAt: string;
      /** The parsed response body, for recorded fixtures only (contains no key). */
      readonly raw: unknown;
    }
  | {
      readonly ok: false;
      readonly mode: GoogleTravelMode;
      readonly reason: 'key_not_enabled' | 'quota_exceeded' | 'timeout' | 'ledger_stop' | 'no_routes' | 'provider_error';
      readonly httpStatus?: number;
      /** Google's machine-readable status / reason codes only (e.g. PERMISSION_DENIED), never the message. */
      readonly codes?: readonly string[];
      /** no_routes only: the (masked, keyless) response body, so an empty answer can be recorded. */
      readonly raw?: unknown;
    };

interface GoogleRoutesRaw {
  routes?: {
    duration?: string;
    distanceMeters?: number;
    legs?: { steps?: { travelMode?: string; transitDetails?: any }[] }[];
  }[];
}

export function parseGoogleDurationSeconds(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw);
  return m ? Math.round(Number(m[1])) : null;
}

export function summarizeTransit(route: NonNullable<GoogleRoutesRaw['routes']>[number]): TransitLegSummary[] {
  const out: TransitLegSummary[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const t = step.transitDetails;
      if (!t) continue;
      out.push({
        line: t.transitLine?.nameShort || t.transitLine?.name,
        vehicle: t.transitLine?.vehicle?.type,
        from: t.stopDetails?.departureStop?.name,
        to: t.stopDetails?.arrivalStop?.name,
        stops: typeof t.stopCount === 'number' ? t.stopCount : undefined,
        headsign: t.headsign,
      });
    }
  }
  return out;
}

function errorCodes(body: any): string[] {
  const codes = new Set<string>();
  const e = body?.error;
  if (typeof e?.status === 'string') codes.add(e.status);
  for (const d of Array.isArray(e?.details) ? e.details : []) {
    if (typeof d?.reason === 'string') codes.add(d.reason);
  }
  return [...codes].filter(c => /^[A-Z_]{3,40}$/.test(c));
}

export class GoogleRoutesAdapter {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly options: { apiKey: string; ledger: GoogleRoutesLedger; fetchFn?: typeof fetch; timeoutMs?: number }
  ) {
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? GOOGLE_ROUTES_TIMEOUT_MS;
  }

  /** origin/destination must already be rounded by the caller (the proxy does, per D1). */
  public async computeRoute(params: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    mode: GoogleTravelMode;
    departureTime?: string;
  }): Promise<GoogleRouteResult> {
    const { mode } = params;
    if (!this.options.ledger.tryReserve(mode)) return { ok: false, mode, reason: 'ledger_stop' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        origin: { location: { latLng: { latitude: params.origin.lat, longitude: params.origin.lng } } },
        destination: { location: { latLng: { latitude: params.destination.lat, longitude: params.destination.lng } } },
        travelMode: mode,
        computeAlternativeRoutes: false,
      };
      if (mode === 'TRANSIT' && params.departureTime) body['departureTime'] = params.departureTime;
      if (mode === 'DRIVE') body['routingPreference'] = 'TRAFFIC_UNAWARE';
      const res = await this.fetchFn(GOOGLE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey,
          'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const codes = errorCodes(json);
        const keyProblem =
          res.status === 403 ||
          codes.some(c => c === 'PERMISSION_DENIED' || c === 'SERVICE_DISABLED' || c === 'API_KEY_INVALID' || c === 'API_KEY_SERVICE_BLOCKED');
        return {
          ok: false,
          mode,
          reason: res.status === 429 || codes.includes('RESOURCE_EXHAUSTED') ? 'quota_exceeded' : keyProblem ? 'key_not_enabled' : 'provider_error',
          httpStatus: res.status,
          codes,
        };
      }
      const route = (json as GoogleRoutesRaw | null)?.routes?.[0];
      const durationSeconds = parseGoogleDurationSeconds(route?.duration);
      if (!route || durationSeconds === null) return { ok: false, mode, reason: 'no_routes', httpStatus: res.status, raw: json };
      return {
        ok: true,
        mode,
        durationSeconds,
        distanceMeters: typeof route.distanceMeters === 'number' ? route.distanceMeters : 0,
        transit: mode === 'TRANSIT' ? summarizeTransit(route) : [],
        fetchedAt: new Date().toISOString(),
        raw: json,
      };
    } catch {
      return { ok: false, mode, reason: controller.signal.aborted ? 'timeout' : 'provider_error' };
    } finally {
      clearTimeout(timer);
    }
  }
}
