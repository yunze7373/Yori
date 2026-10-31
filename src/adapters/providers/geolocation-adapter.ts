/**
 * Consented Geolocation Adapter (V5-GEO / LIVING_CONTEXT_V2.md §10.2, AC-211-1, AC-211-2)
 *
 * Owns browser geolocation access under strict safety and consent constraints:
 * 1. Single adapter module owning navigator.geolocation repo-wide (static-checked).
 * 2. Explicit in-app consent required prior to any acquisition (user tap; never auto-prompt on load).
 * 3. One-shot getCurrentPosition only.
 * 4. Carries accuracy and timestamp on each fix.
 * 5. Explicit degradation: denied, timeout, unavailable, and stale (age > threshold) degrade to
 *    denied/unavailable with clear notices plus manual location option.
 * 6. Debounce, cache, refresh threshold, and session request budget (stops requests when exhausted).
 * 7. In-memory / session-only consent (never persisted to storage or logs; logs carry no coordinates).
 * 8. Feature-flagged: real chain stays OFF unless GEO_LIVE_ENABLED=true and simulated=false.
 * 9. Implements the same LocationPort interface used across Yori.
 */

import type { LocationCoords, LocationPort, LocationStatus, LocationStatusKind } from './location-port.js';
import type { EvidenceRecord } from '../../ui/view-models/grounding.js';

const DEFAULT_FALLBACK_COORDS: LocationCoords = Object.freeze({
  lat: 37.7749,
  lng: -122.4194,
});

export type ConsentStatus = 'prompt' | 'granted' | 'denied';

export interface GeolocationAdapterOptions {
  readonly enabled?: boolean;
  readonly simulated?: boolean;
  readonly maxRequestsPerSession?: number;
  readonly cacheTtlMs?: number;
  readonly staleThresholdMs?: number;
  readonly debounceMs?: number;
  readonly initialStatus?: LocationStatusKind;
  readonly initialCoords?: LocationCoords;
  readonly geolocationProvider?: {
    getCurrentPosition: (
      successCallback: (position: GeolocationPosition) => void,
      errorCallback?: (error: GeolocationPositionError) => void,
      options?: PositionOptions
    ) => void;
  };
}

export class GeolocationAdapter implements LocationPort {
  private enabled: boolean;
  private simulated: boolean;
  private maxRequestsPerSession: number;
  private cacheTtlMs: number;
  private staleThresholdMs: number;
  private debounceMs: number;
  private geolocationProvider?: {
    getCurrentPosition: (
      successCallback: (position: GeolocationPosition) => void,
      errorCallback?: (error: GeolocationPositionError) => void,
      options?: PositionOptions
    ) => void;
  };

  private consentStatus: ConsentStatus;
  private requestCount = 0;
  private lastRequestTime = 0;
  private cachedCoords?: LocationCoords;
  private cachedAccuracy?: number;
  private cachedTimestamp?: number;
  private manualStatus?: LocationStatus;
  private lastNotice?: string;

  constructor(options: GeolocationAdapterOptions = {}) {
    this.enabled =
      options.enabled ??
      ((typeof process !== 'undefined' && process.env?.['GEO_LIVE_ENABLED'] === 'true') ||
        (typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.VITE_GEO_LIVE_ENABLED === 'true')));
    this.simulated = options.simulated ?? true;
    this.maxRequestsPerSession = options.maxRequestsPerSession ?? 5;
    this.cacheTtlMs = options.cacheTtlMs ?? 60000; // 1 min
    this.staleThresholdMs = options.staleThresholdMs ?? 300000; // 5 min
    this.debounceMs = options.debounceMs ?? 2000; // 2s
    this.geolocationProvider = options.geolocationProvider;

    const initialStatus = options.initialStatus ?? 'available';
    if (initialStatus === 'denied') {
      this.consentStatus = 'denied';
    } else {
      this.consentStatus = 'prompt';
    }

    if (initialStatus === 'available') {
      this.manualStatus = {
        status: 'available',
        coords: options.initialCoords ?? DEFAULT_FALLBACK_COORDS,
        source: 'fixture',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  public getLocation(): LocationStatus {
    // 1. Manual override takes precedence
    if (this.manualStatus) {
      return this.manualStatus;
    }

    const now = Date.now();

    // 2. Consent check
    if (this.consentStatus === 'prompt') {
      return {
        status: 'prompt',
        source: 'geolocation',
        updatedAt: new Date(now).toISOString(),
        notice: 'Location permission needed to find nearby gas stations',
      };
    }

    if (this.consentStatus === 'denied') {
      return {
        status: 'denied',
        source: 'geolocation',
        updatedAt: new Date(now).toISOString(),
        notice: 'Location access denied by user',
      };
    }

    // 3. Consent is granted: verify cached fix availability & freshness
    if (this.cachedCoords && this.cachedTimestamp) {
      const age = now - this.cachedTimestamp;
      if (age > this.staleThresholdMs) {
        return {
          status: 'unavailable',
          coords: this.cachedCoords,
          accuracy: this.cachedAccuracy,
          isStale: true,
          source: 'geolocation',
          updatedAt: new Date(this.cachedTimestamp).toISOString(),
          notice: `Location fix is stale (${Math.round(age / 1000)}s old)`,
        };
      }

      return {
        status: 'available',
        coords: this.cachedCoords,
        accuracy: this.cachedAccuracy,
        source: 'geolocation',
        updatedAt: new Date(this.cachedTimestamp).toISOString(),
      };
    }

    return {
      status: 'unavailable',
      source: 'geolocation',
      updatedAt: new Date(now).toISOString(),
      notice: this.lastNotice ?? 'No location fix acquired',
    };
  }

  public setLocation(status: LocationStatusKind, coords?: LocationCoords): void {
    this.lastNotice = undefined;
    if (status === 'available' && !coords) {
      this.manualStatus = {
        status: 'unavailable',
        coords: undefined,
        source: 'manual',
        updatedAt: new Date().toISOString(),
        notice: 'Coordinates required for available status',
      };
      return;
    }

    if (status === 'prompt') {
      this.manualStatus = undefined;
      this.consentStatus = 'prompt';
      this.cachedCoords = undefined;
      this.cachedTimestamp = undefined;
      return;
    }

    this.manualStatus = {
      status,
      coords: status === 'available' ? coords : undefined,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
  }

  public clearManualLocation(): void {
    this.manualStatus = undefined;
  }

  public grantConsent(): void {
    this.consentStatus = 'granted';
    this.manualStatus = undefined;
    this.lastNotice = undefined;
  }

  public async consentAndRequest(options?: PositionOptions): Promise<LocationStatus> {
    this.grantConsent();
    return this.requestCurrentPosition(options);
  }

  public denyConsent(): void {
    this.consentStatus = 'denied';
    this.cachedCoords = undefined;
    this.cachedTimestamp = undefined;
    this.manualStatus = undefined;
    this.lastNotice = undefined;
  }

  public getConsentStatus(): ConsentStatus {
    return this.consentStatus;
  }

  public getRequestCount(): number {
    return this.requestCount;
  }

  public isLiveEnabled(): boolean {
    return this.enabled;
  }

  public isSimulated(): boolean {
    return this.simulated;
  }

  public setSimulated(simulated: boolean): void {
    this.simulated = simulated;
  }

  public setLiveEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public hasSessionFix(): boolean {
    return Boolean(this.cachedCoords && this.cachedTimestamp);
  }

  public clearSessionFix(): void {
    this.cachedCoords = undefined;
    this.cachedAccuracy = undefined;
    this.cachedTimestamp = undefined;
    this.manualStatus = undefined;
    this.lastNotice = undefined;
  }

  public async acquireSessionFix(options?: PositionOptions): Promise<LocationStatus> {
    this.grantConsent();
    const now = Date.now();
    const geo =
      this.geolocationProvider ??
      (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      this.lastNotice = 'Browser geolocation not supported in this environment';
      return {
        status: 'unavailable',
        source: 'geolocation',
        updatedAt: new Date().toISOString(),
        notice: this.lastNotice,
      };
    }

    this.requestCount++;
    this.lastRequestTime = now;

    return new Promise<LocationStatus>((resolve) => {
      geo.getCurrentPosition(
        (pos) => {
          this.cachedCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          this.cachedAccuracy = pos.coords.accuracy;
          this.cachedTimestamp = pos.timestamp || Date.now();
          resolve({
            status: 'available',
            coords: this.cachedCoords,
            accuracy: this.cachedAccuracy,
            source: 'geolocation',
            updatedAt: new Date(this.cachedTimestamp).toISOString(),
          });
        },
        (err) => {
          this.lastNotice = err?.message || 'Failed to acquire location fix';
          resolve({
            status: err.code === 1 ? 'denied' : 'unavailable',
            source: 'geolocation',
            updatedAt: new Date().toISOString(),
            notice: this.lastNotice,
          });
        },
        options
      );
    });
  }

  public async requestCurrentPosition(options?: PositionOptions): Promise<LocationStatus> {
    // 1. Consent guard
    if (this.consentStatus !== 'granted') {
      return {
        status: this.consentStatus === 'denied' ? 'denied' : 'prompt',
        source: 'geolocation',
        updatedAt: new Date().toISOString(),
        notice: 'Location consent required before acquiring position',
      };
    }

    const now = Date.now();

    // 2. Budget guard
    if (this.requestCount >= this.maxRequestsPerSession) {
      this.lastNotice = 'Session location request budget exhausted';
      return {
        status: 'unavailable',
        source: 'geolocation',
        updatedAt: new Date().toISOString(),
        notice: this.lastNotice,
      };
    }

    // 3. Debounce guard
    if (now - this.lastRequestTime < this.debounceMs && this.cachedCoords) {
      return this.getLocation();
    }

    // 4. Cache guard
    if (this.cachedCoords && this.cachedTimestamp && now - this.cachedTimestamp < this.cacheTtlMs) {
      return this.getLocation();
    }

    // 5. Check real chain activation
    if (!this.enabled || this.simulated) {
      // Real chain stays OFF. Zero real navigator.geolocation calls.
      this.requestCount++;
      this.lastRequestTime = now;
      this.lastNotice =
        'Live geolocation is disabled in this demo (owner gate P-LOC required); please choose a city preset or enter coordinates manually';
      return {
        status: 'unavailable',
        source: 'geolocation',
        updatedAt: new Date(now).toISOString(),
        notice: this.lastNotice,
      };
    }

    // 6. Real browser geolocation call
    const geo =
      this.geolocationProvider ??
      (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      this.lastNotice = 'Browser geolocation not supported in this environment';
      return {
        status: 'unavailable',
        source: 'geolocation',
        updatedAt: new Date().toISOString(),
        notice: this.lastNotice,
      };
    }

    this.requestCount++;
    this.lastRequestTime = now;

    return new Promise<LocationStatus>((resolve) => {
      geo.getCurrentPosition(
        (pos) => {
          this.cachedCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          this.cachedAccuracy = pos.coords.accuracy;
          this.cachedTimestamp = pos.timestamp || Date.now();
          this.lastNotice = undefined;
          resolve({
            status: 'available',
            coords: this.cachedCoords,
            accuracy: this.cachedAccuracy,
            source: 'geolocation',
            updatedAt: new Date(this.cachedTimestamp).toISOString(),
          });
        },
        (err) => {
          let status: LocationStatusKind = 'unavailable';
          let notice = 'Geolocation error';
          if (err.code === 1) {
            this.consentStatus = 'denied';
            status = 'denied';
            notice = 'Location permission denied by user';
          } else if (err.code === 2) {
            notice = 'Location position unavailable';
          } else if (err.code === 3) {
            notice = 'Location request timed out';
          }
          this.lastNotice = notice;
          resolve({
            status,
            source: 'geolocation',
            updatedAt: new Date().toISOString(),
            notice,
          });
        },
        options
      );
    });
  }

  public createLocationEvidenceRecord(sceneClockIso?: string): EvidenceRecord | undefined {
    const loc = this.getLocation();
    if (loc.status !== 'available' || !loc.coords) {
      return undefined;
    }
    const fetchedAt = sceneClockIso ?? loc.updatedAt;
    const isReal = loc.source === 'geolocation' && this.enabled && !this.simulated;
    return {
      id: 'loc-fuel-origin',
      provider: 'location-port',
      kind: 'poi',
      fetchedAt,
      provenance: isReal ? 'live' : 'simulated',
      fields: {
        id: 'loc-fuel-origin',
        name: 'Current Location',
        coords: loc.coords,
        lat: loc.coords.lat,
        lng: loc.coords.lng,
        accuracy: loc.accuracy,
      },
    };
  }

  public reset(): void {
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.cachedCoords = undefined;
    this.cachedAccuracy = undefined;
    this.cachedTimestamp = undefined;
    this.manualStatus = undefined;
    this.consentStatus = 'prompt';
    this.lastNotice = undefined;
  }
}

export const defaultGeolocationAdapter = new GeolocationAdapter({
  initialStatus: 'available',
  initialCoords: DEFAULT_FALLBACK_COORDS,
  simulated: true,
});
