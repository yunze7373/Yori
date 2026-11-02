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

export interface ProposalItemVM {
  readonly key: string;
  readonly title: string;
  readonly basis?: string;
  readonly provenance?: 'user' | 'fixture' | 'none';
  readonly value?: unknown;
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

  // Geolocation & Manual Location State (V5-GEO)
  readonly locationState?: 'prompt' | 'denied' | 'unavailable';
  readonly locationNotice?: string;
  readonly locationLabel?: string;

  // Collapse empty blocks (only populated if non-empty)
  readonly aheadItems: readonly AheadItemVM[];
  readonly proposals: readonly ProposalItemVM[];

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
}
