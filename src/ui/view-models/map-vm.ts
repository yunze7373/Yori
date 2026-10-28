/**
 * Map View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Rendered only when spatial evidence exists.
 * - Invariant: Labelled "Schematic · simulated" (never represented as road-accurate, no forged streets).
 * - Geometry is a labelled schematic fixture polyline and option markers.
 * - Size hint: prominent (large, for transit/rain) or compact (for lunch/places).
 */

import type { PreparedPlan, PlanOption, SpatialMapEvidence } from '../../core/contracts/index.js';
import type { MapVM, MapMarkerVM, MapPolylineVM } from './types.js';

export function deriveMapVM(
  plan: PreparedPlan | null,
  spatialEvidence: SpatialMapEvidence | null,
  sizeHint: 'prominent' | 'compact' = 'prominent'
): MapVM | undefined {
  if (!spatialEvidence && !plan) {
    return undefined;
  }

  // Journey / transit map (Depart intent)
  if (plan?.intentId === 'depart') {
    const destinationName =
      plan.subjectTitle ||
      (typeof (spatialEvidence?.placeOrRoute as any)?.name === 'string'
        ? (spatialEvidence?.placeOrRoute as any).name
        : 'Piano Studio (Downtown)');

    const hasRain =
      plan.checklist?.includes('umbrella') ||
      plan.why.evidenceSignals.some(s => s.description?.toLowerCase().includes('rain'));

    // Markers
    const markers: MapMarkerVM[] = [
      {
        id: 'marker-origin',
        x: 45,
        y: 115,
        label: 'Home',
        sublabel: 'Depart',
        type: 'origin',
      },
      {
        id: 'marker-dest',
        x: 275,
        y: 45,
        label: destinationName,
        sublabel: 'Destination · 3:00 PM',
        type: 'destination',
        isHighlight: true,
      },
    ];

    // Polylines: Primary route (Drive 25m) + Alternative (Bus 40m)
    const polylines: MapPolylineVM[] = [
      {
        id: 'route-drive',
        points: '45,115 115,115 175,55 275,45',
        mode: 'drive',
        label: 'Drive · 25 min',
        strokeColor: '#2D6A4F',
        strokeWidth: 4,
        travelMinutes: 25,
      },
      {
        id: 'route-bus',
        points: '45,115 85,150 205,150 275,45',
        mode: 'bus',
        label: 'Bus · 40 min',
        strokeColor: '#718096',
        strokeWidth: 3,
        strokeDasharray: '6 4',
        travelMinutes: 40,
      },
    ];

    return {
      id: `map-depart-${plan.id}`,
      label: 'Spatial Context Map',
      simulatedBadge: 'Schematic · simulated',
      sizeHint,
      destinationName,
      destinationArea: 'Downtown',
      markers: Object.freeze(markers),
      polylines: Object.freeze(polylines),
      weatherCallout: hasRain
        ? {
            x: 160,
            y: 40,
            text: 'Rain expected',
            subtext: 'Heavier 2:00–4:00 PM',
          }
        : undefined,
      ariaDescription: `Schematic simulated map showing route from Home to ${destinationName} with primary drive and alternative bus transit lines`,
    };
  }

  // Lunch / candidate places map
  if (plan?.intentId === 'lunch') {
    const markers: MapMarkerVM[] = [
      {
        id: 'marker-user-location',
        x: 50,
        y: 85,
        label: 'You',
        sublabel: 'Downtown',
        type: 'origin',
      },
    ];

    const polylines: MapPolylineVM[] = [];

    // Map candidate places
    const placeCoordinates = [
      { x: 135, y: 45 },
      { x: 215, y: 100 },
      { x: 285, y: 55 },
    ];

    if (plan.optionsOrSteps) {
      plan.optionsOrSteps.slice(0, 3).forEach((rawOpt, idx) => {
        const coords = placeCoordinates[idx] || { x: 180 + idx * 30, y: 60 };
        const name = typeof rawOpt === 'string' ? rawOpt : (rawOpt as PlanOption).name || rawOpt.label;
        const dist = typeof rawOpt !== 'string' ? (rawOpt as PlanOption).distanceMinutes : undefined;
        const distText = typeof dist === 'number' ? `${dist}m away` : '';

        markers.push({
          id: `marker-place-${idx}`,
          x: coords.x,
          y: coords.y,
          label: name,
          sublabel: distText,
          type: 'place',
          isHighlight: idx === 0,
        });

        polylines.push({
          id: `route-to-place-${idx}`,
          points: `50,85 ${coords.x},${coords.y}`,
          mode: 'walk',
          label: `${distText || 'Walk'} to ${name}`,
          strokeColor: idx === 0 ? '#2D6A4F' : '#CAD6D0',
          strokeWidth: idx === 0 ? 2.5 : 1.5,
          strokeDasharray: '4 4',
          travelMinutes: dist,
        });
      });
    }

    return {
      id: `map-lunch-${plan.id}`,
      label: 'Nearby Places Map',
      simulatedBadge: 'Schematic · simulated',
      sizeHint: 'compact',
      destinationName: 'Lunch locations near you',
      destinationArea: 'Downtown',
      markers: Object.freeze(markers),
      polylines: Object.freeze(polylines),
      ariaDescription: 'Schematic simulated map displaying lunch candidate locations relative to your current location in Downtown',
    };
  }

  // Generic fallback if spatial evidence exists
  if (spatialEvidence) {
    const destName = String((spatialEvidence.placeOrRoute as Record<string, string>)?.name || 'Destination');
    return {
      id: 'map-generic',
      label: 'Spatial Context Map',
      simulatedBadge: 'Schematic · simulated',
      sizeHint: 'compact',
      destinationName: destName,
      markers: Object.freeze([
        { id: 'm-orig', x: 50, y: 100, label: 'Current Location', type: 'origin' },
        { id: 'm-dest', x: 250, y: 50, label: destName, type: 'destination', isHighlight: true },
      ]),
      polylines: Object.freeze([
        {
          id: 'poly-generic',
          points: '50,100 150,100 250,50',
          mode: 'drive',
          label: 'Route',
          strokeColor: '#2D6A4F',
          strokeWidth: 3,
          strokeDasharray: '6 3',
        },
      ]),
      ariaDescription: `Schematic simulated map showing destination ${destName}`,
    };
  }

  return undefined;
}
