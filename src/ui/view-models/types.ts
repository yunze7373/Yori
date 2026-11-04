/**
 * View Model Type Definitions for Yori Living Context V2 (LIVING_CONTEXT_V2.md §4)
 * Governed by Scene-Driven Home Composition (ARCH-V2-001, Task V1).
 *
 * Rules:
 * - Derived purely from PreparedPlan and ContextSnapshot data (zero scene-id branching).
 * - All times, durations, buffers, and names from fixture facts.
 * - Zero star ratings, review counts, or invented claims.
 * - Restaurant photos are strictly local labelled SVG illustrations (no external URLs).
 * - Maps are labelled schematic fixtures (never real-world road forgeries).
 */

import type { PlanAction } from '../../core/contracts/index.js';
import type { SourceRef, EvidenceBundle } from './grounding.js';

export interface TimelineStepVM {
  readonly id: string;
  readonly time: string;
  readonly label: string;
  readonly detail?: string;
  readonly isPrimary?: boolean;
  readonly isEvent?: boolean;
  readonly iconType: 'prep' | 'leave' | 'arrive' | 'event';
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface TimelineVM {
  readonly title: string;
  readonly eventTitle: string;
  readonly eventTime: string;
  readonly steps: readonly TimelineStepVM[];
  readonly departureNotice?: string;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface OptionCardVM {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly mode?: string;
  readonly travelMinutes?: number;
  readonly leaveTime?: string;
  readonly arrivalTime?: string;
  readonly bufferMinutes?: number;
  readonly lateMinutes?: number;
  readonly badge?: string; // e.g. "Recommended" or "Alternative"
  readonly detail?: string;
  readonly rankingBasis?: string;
  readonly isSelected: boolean;
  readonly isRecommended: boolean;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface MapMarkerVM {
  readonly id: string;
  readonly x: number; // ViewBox coordinate 0..360
  readonly y: number; // ViewBox coordinate 0..200
  readonly label: string;
  readonly sublabel?: string;
  readonly type: 'origin' | 'destination' | 'place' | 'transit_stop';
  readonly isHighlight?: boolean;
  readonly sourceRef?: SourceRef;
}

export interface MapPolylineVM {
  readonly id: string;
  readonly points: string; // SVG polyline points string "x1,y1 x2,y2 ..."
  readonly mode: 'drive' | 'bus' | 'walk' | string;
  readonly label: string;
  readonly strokeColor: string;
  readonly strokeDasharray?: string;
  readonly strokeWidth: number;
  readonly travelMinutes?: number;
  readonly sourceRef?: SourceRef;
}

export interface MapWeatherCalloutVM {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly subtext?: string;
  readonly sourceRef?: SourceRef;
}

export interface MapVM {
  readonly id: string;
  readonly label: string;
  readonly simulatedBadge: string;
  readonly sizeHint: 'prominent' | 'compact';
  readonly destinationName: string;
  readonly destinationArea?: string;
  readonly markers: readonly MapMarkerVM[];
  readonly polylines: readonly MapPolylineVM[];
  readonly weatherCallout?: MapWeatherCalloutVM;
  readonly ariaDescription: string;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface PhotoVM {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly simulatedBadge: string;
  readonly svgMarkup: string;
  readonly altText: string;
}

export interface CandidateCardVM {
  readonly id: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes?: number;
  readonly distanceText: string;
  readonly basis: string;
  readonly photo: PhotoVM;
  readonly isSelected: boolean;
  readonly noiseLevel?: string;
  readonly vegetarian?: boolean;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
  readonly openingStatus?: 'open' | 'closed' | undefined;
  /** D7: discovery source and Google-only fields; placePhoto is a keyless, server-resolved URI. */
  readonly provenance?: 'google' | 'osm';
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: number;
  readonly placePhoto?: {
    readonly uri: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly authorAttributions: readonly { readonly displayName: string; readonly uri?: string }[];
  };
  readonly openNow?: boolean;
  readonly osmId?: number;
  readonly coords?: { readonly lat: number; readonly lng: number };
  readonly fetchedAt?: string;
  readonly attribution?: string;
}

export type HomeLayoutKind = 'journey' | 'candidates' | 'quiet' | 'generic';

export interface AheadItemVM {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface ProposalActionVM {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly variant?: 'primary' | 'secondary' | 'quiet' | 'outline';
}

export interface ProposalItemVM {
  readonly key: string;
  readonly title: string;
  readonly basis?: string;
  readonly provenance?: 'user' | 'fixture' | 'none' | 'live';
  readonly value?: unknown;
  readonly actions?: readonly ProposalActionVM[];
}

export interface ShoppingReminderVM {
  readonly text: string;
  readonly storeName: string;
  readonly distanceLabel?: string;
  readonly openStatus?: string;
  readonly directionsUrl?: string;
  readonly items: readonly string[];
  readonly isSimulated?: boolean;
}

export interface DismissedNoteVM {
  readonly note: string;
  readonly intentId: string;
  readonly planId?: string;
}

export interface HomeCompositionVM {
  readonly layoutKind: HomeLayoutKind;
  readonly planId?: string;
  readonly title: string;
  readonly headline: string;
  readonly basis: string;
  readonly isRain: boolean;
  readonly rainBanner?: string;
  readonly rainInsightDesc?: string;
  readonly umbrellaChip?: string;
  /** D5 (Live depart): forward-looking rain label, e.g. 'Rain expected 2:00 PM–3:00 PM'. */
  readonly rainLabel?: string;
  /** D5 (Live depart): the ONE weather-basis status line (forecast / buffer / fallback + source). */
  readonly forecastStatus?: string;
  readonly habitNote?: string;

  // Structured field substrings for slot-aware grounding
  readonly subjectTitle?: string;
  readonly apptTimeStr?: string;
  readonly prepareTimeStr?: string;
  readonly leaveTimeStr?: string;
  readonly arriveTimeStr?: string;
  readonly countdownStr?: string;
  readonly weatherIssuedTime?: string;
  readonly topCandidateName?: string;
  readonly topCandidateDistance?: string;

  // Rich Carriers
  readonly map?: MapVM;
  readonly timeline?: TimelineVM;
  readonly options: readonly OptionCardVM[];
  readonly candidateCards?: readonly CandidateCardVM[];

  // Action controls
  readonly isAccepted: boolean;
  readonly canUndo?: boolean;
  readonly actions: readonly PlanAction[];
  readonly dismissedNote?: DismissedNoteVM;

  // Geolocation & Manual Location State (V5-GEO)
  readonly locationState?: 'prompt' | 'denied' | 'unavailable';
  readonly locationNotice?: string;
  readonly locationLabel?: string;

  // Collapse empty blocks (only populated if non-empty)
  readonly aheadItems: readonly AheadItemVM[];
  readonly proposals: readonly ProposalItemVM[];
  readonly nearbyItems?: readonly ProposalItemVM[];
  readonly shoppingReminder?: ShoppingReminderVM;

  // Microinteraction state (S3-MICRO)
  readonly planDiff?: {
    fieldName: string;
    priorValue: string;
    newValue: string;
    diffSummary: string;
    ariaLiveText: string;
  } | null;
  readonly weatherError?: string;
  readonly isLoading?: boolean;

  // Grounding
  readonly evidenceBundle?: EvidenceBundle;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;

  // CONTEXT-TIMELINE (INBOX-20261101-070938)
  readonly livingHeader?: {
    readonly formattedLine: string;
    readonly timeDisplay: string;
    readonly weatherDisplay: string;
    readonly placeDisplay: string;
    readonly isSimulated: boolean;
  };
  readonly changeMoment?: {
    readonly cause: string;
    readonly causeMarker: string;
    readonly heroCauseEffect: string;
    readonly priorLeaveTime?: string;
    readonly newLeaveTime?: string;
    readonly statusTransition?: string;
  };
  readonly suppressedQuiet?: {
    readonly message: string;
    readonly budgetMeter: string;
  };
  readonly timelineControls?: {
    readonly isPlaying: boolean;
    readonly simulatedTimeStr: string;
    readonly timelineLabel: string;
  };
  readonly isLive?: boolean;
  readonly weatherEnabled?: boolean;
  readonly weatherSignalValue?: {
    condition?: string;
    temperatureC?: number;
    precipProbability?: number;
  };
  /** D1: "<source> · near you · as of <time>" when Live weather was measured at the consented fix. */
  readonly weatherProvenanceLine?: string;
  /** D2: "Nearby now" on-demand search ('off' = places provider disabled by owner setting). */
  readonly nearbyNow?: {
    readonly state: 'ready' | 'loading' | 'off';
    /** D7: progress copy while loading ('Searching OpenStreetMap…' on the slower OSM path). */
    readonly loadingLabel?: string;
    /** D7: where "Nearby now" searches (Google when configured, else OpenStreetMap). */
    readonly sourceLabel?: string;
    /** D3: designed state shown with the button (cooldown info, empty answer, provider failure). */
    readonly note?: { readonly kind: 'info' | 'empty' | 'error'; readonly title: string; readonly desc: string };
  };
  /** D4: one reason for the top pick plus ONE honest engine status ("Meta Muse Spark · live" / "Reasoned locally"). */
  readonly candidateReasonLine?: { readonly text: string; readonly statusLabel: string; readonly engine?: 'meta_model_live' | 'baseten_fallback' | 'offline_deterministic' };
  /** D7: honest discovery line for the lunch card (Google, OSM, or OSM after a Google failover). */
  readonly placesAttributionLine?: string;
  /** D2: exact hosts (and purpose) of the enabled keyless providers, from their /status. */
  readonly consentHosts?: readonly { readonly purpose: string; readonly host: string }[];
  readonly calendarConnected?: boolean;
  readonly calendarSignalValue?: {
    title?: string;
    startTime?: string;
    location?: string;
    timezone?: string;
  };
  readonly confirmedMemoryFact?: string;
  readonly confirmedMemoryNote?: string;
}

// -------------------------------------------------------------
// V1b DETAIL VIEW MODELS (LIVING_CONTEXT_V2.md §8 D1)
// -------------------------------------------------------------

export interface TripModeTabVM {
  readonly id: string;
  readonly mode: 'drive' | 'bus' | 'walk' | string;
  readonly label: string;
  readonly leaveTime: string;
  readonly arriveTime: string;
  readonly durationMinutes?: number;
  readonly isSelected: boolean;
  readonly detail?: string;
  readonly meta?: string;
  readonly badge?: string;
  readonly rankingBasis?: string;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface TripWhyProvenanceVM {
  readonly label: string;
  readonly value: string;
  readonly provenanceText: string;
  readonly isConfirmed: boolean;
  readonly sourceRef?: SourceRef;
}

export interface TripDetailVM {
  readonly planId: string;
  readonly title: string;
  readonly headline: string;
  readonly destinationName: string;
  readonly apptTime: string;
  readonly leaveTime: string;
  readonly arriveTime: string;
  readonly bufferText: string;
  readonly prepText: string;
  readonly modeTabs: readonly TripModeTabVM[];
  readonly selectedMode: string;
  readonly map: MapVM;
  readonly steps: readonly TimelineStepVM[];
  readonly whyHabits: readonly TripWhyProvenanceVM[];
  readonly whyDerivation: string;
  readonly isAccepted: boolean;
  readonly actions: readonly PlanAction[];
  readonly isLive?: boolean;
  readonly evidenceBundle?: EvidenceBundle;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
}

export interface RestaurantDirectionStepVM {
  readonly id: string;
  readonly instruction: string;
  readonly durationText?: string;
  readonly isFinal?: boolean;
}

export interface RestaurantDetailVM {
  readonly id: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes?: number;
  readonly distanceText?: string;
  readonly photo: PhotoVM;
  readonly attributeChips: readonly string[];
  readonly basis: string;
  readonly map: MapVM;
  readonly isSaved: boolean;
  readonly isLive?: boolean;
  readonly directions: readonly RestaurantDirectionStepVM[];
  readonly simulatedNotice: string;
  readonly navigateUrl?: string;
  readonly evidenceBundle?: EvidenceBundle;
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
  readonly attribution?: string;
  readonly osmId?: number;
  readonly coords?: { readonly lat: number; readonly lng: number };
  readonly fetchedAt?: string;
  readonly openingStatus?: 'open' | 'closed' | undefined;
  /** UI-QUIET-PRECISION increment 3: the place's own Google photo (keyless, server-resolved), credited. */
  readonly placePhoto?: {
    readonly uri: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly authorAttributions: readonly { readonly displayName: string; readonly uri?: string }[];
  };
}
