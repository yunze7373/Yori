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

export interface TimelineStepVM {
  readonly id: string;
  readonly time: string;
  readonly label: string;
  readonly detail?: string;
  readonly isPrimary?: boolean;
  readonly isEvent?: boolean;
  readonly iconType: 'prep' | 'leave' | 'arrive' | 'event';
}

export interface TimelineVM {
  readonly title: string;
  readonly eventTitle: string;
  readonly eventTime: string;
  readonly steps: readonly TimelineStepVM[];
  readonly departureNotice?: string;
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
  readonly badge?: string; // e.g. "Recommended" or "Alternative"
  readonly detail?: string;
  readonly rankingBasis?: string;
  readonly isSelected: boolean;
  readonly isRecommended: boolean;
}

export interface MapMarkerVM {
  readonly id: string;
  readonly x: number; // ViewBox coordinate 0..360
  readonly y: number; // ViewBox coordinate 0..200
  readonly label: string;
  readonly sublabel?: string;
  readonly type: 'origin' | 'destination' | 'place' | 'transit_stop';
  readonly isHighlight?: boolean;
}

export interface MapPolylineVM {
  readonly id: string;
  readonly points: string; // SVG polyline points string "x1,y1 x2,y2 ..."
  readonly mode: 'drive' | 'bus' | 'walk';
  readonly label: string;
  readonly strokeColor: string;
  readonly strokeDasharray?: string;
  readonly strokeWidth: number;
  readonly travelMinutes?: number;
}

export interface MapWeatherCalloutVM {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly subtext?: string;
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
  readonly distanceMinutes: number;
  readonly distanceText: string;
  readonly basis: string;
  readonly photo: PhotoVM;
  readonly isSelected: boolean;
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

  // Rich Carriers
  readonly map?: MapVM;
  readonly timeline?: TimelineVM;
  readonly options: readonly OptionCardVM[];
  readonly candidateCards?: readonly CandidateCardVM[];

  // Action controls
  readonly isAccepted: boolean;
  readonly actions: readonly PlanAction[];

  // Collapse empty blocks (only populated if non-empty)
  readonly aheadItems: readonly AheadItemVM[];
  readonly proposals: readonly ProposalItemVM[];
}
