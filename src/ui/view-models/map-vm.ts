/**
 * Map View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Rendered only when spatial evidence exists.
 * - Invariant: Labelled "Schematic · simulated" (never represented as road-accurate, no forged streets).
 * - Geometry is a labelled schematic fixture polyline and option markers.
 * - Routes drawn ONLY for options actually present in the plan.
 * - Weather callouts derived strictly from weather signals (no invented times or intensities).
 * - Size hint: prominent (large, for transit/rain) or compact (for lunch/places).
 */

import type { PreparedPlan, PlanOption, SpatialMapEvidence } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import type { MapVM, MapMarkerVM, MapPolylineVM, MapWeatherCalloutVM } from './types.js';

export interface DeriveMapVMOptions {
  snapshot?: { signals: readonly { kind: string; value?: unknown }[] } | null;
  mode?: string;
}

export function deriveMapVM(
  plan: PreparedPlan | null,
  spatialEvidence: SpatialMapEvidence | null,
  sizeHint: 'prominent' | 'compact' = 'prominent',
  options?: DeriveMapVMOptions
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
        : 'Destination');

    const destinationArea =
      typeof (spatialEvidence?.placeOrRoute as any)?.area === 'string'
        ? (spatialEvidence?.placeOrRoute as any).area
        : undefined;

    const hasRain =
      plan.checklist?.includes('umbrella') ||
      plan.why.evidenceSignals.some(s => s.description?.toLowerCase().includes('rain'));

    const apptTime = plan.apptAt ? formatTime(plan.apptAt, plan.timezone) : '';
    const destSublabel = apptTime ? `Destination · ${apptTime}` : 'Destination';

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
        sublabel: destSublabel,
        type: 'destination',
        isHighlight: true,
      },
    ];

    // Polylines: draw routes ONLY for options present in the plan
    const polylines: MapPolylineVM[] = [];

    const driveOpt = plan.optionsOrSteps?.find(
      opt => typeof opt !== 'string' && (opt as PlanOption).mode === 'drive'
    ) as PlanOption | undefined;

    const busOpt = plan.optionsOrSteps?.find(
      opt => typeof opt !== 'string' && (opt as PlanOption).mode === 'bus'
    ) as PlanOption | undefined;

    if (driveOpt || busOpt) {
      // Multi-modal plan (e.g. D2 with drive and bus options)
      if (driveOpt) {
        const driveLabel =
          typeof driveOpt.travelMinutes === 'number'
            ? `Drive · ${driveOpt.travelMinutes} min`
            : 'Drive route';

        polylines.push({
          id: 'route-drive',
          points: '45,115 115,115 175,55 275,45',
          mode: 'drive',
          label: driveLabel,
          strokeColor: '#2D6A4F',
          strokeWidth: 4,
          travelMinutes: driveOpt.travelMinutes,
        });
      }

      if (busOpt) {
        const busLabel =
          typeof busOpt.travelMinutes === 'number'
            ? `Bus · ${busOpt.travelMinutes} min`
            : 'Bus route';

        polylines.push({
          id: 'route-bus',
          points: '45,115 85,150 205,150 275,45',
          mode: 'bus',
          label: busLabel,
          strokeColor: '#718096',
          strokeWidth: 3,
          strokeDasharray: '6 4',
          travelMinutes: busOpt.travelMinutes,
        });
      }
    } else {
      // Single-mode plan (e.g. D1): derive travel duration mathematically from timing
      let travelMinutes: number | undefined;
      const bufferFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_buffer_minutes');
      const bufferMinutes = typeof bufferFact?.value === 'number' ? bufferFact.value : 0;
      if (plan.apptAt && plan.leaveAt) {
        const apptMs = Date.parse(plan.apptAt);
        const leaveMs = Date.parse(plan.leaveAt);
        if (Number.isFinite(apptMs) && Number.isFinite(leaveMs) && apptMs > leaveMs) {
          const diff = Math.round((apptMs - leaveMs) / 60000);
          if (diff > bufferMinutes) {
            travelMinutes = diff - bufferMinutes;
          }
        }
      }

      // Determine single mode from option override, signal, or fallback
      let singleMode: 'drive' | 'bus' | 'walk' | string = 'drive';
      if (options?.mode && options.mode.trim()) {
        singleMode = options.mode.toLowerCase();
      } else if (options?.snapshot?.signals) {
        const travelSig = options.snapshot.signals.find(s => s.kind === 'travel_estimate');
        const valMode = (travelSig?.value as Record<string, unknown>)?.mode;
        if (typeof valMode === 'string' && valMode.trim()) {
          singleMode = valMode.toLowerCase();
        }
      }
      const singleModeCap = singleMode.charAt(0).toUpperCase() + singleMode.slice(1);

      const singleRouteLabel =
        travelMinutes !== undefined ? `${singleModeCap} · ${travelMinutes} min` : `${singleModeCap} route`;

      polylines.push({
        id: `route-${singleMode}`,
        points: '45,115 115,115 175,55 275,45',
        mode: singleMode,
        label: singleRouteLabel,
        strokeColor: singleMode === 'bus' ? '#718096' : '#2D6A4F',
        strokeWidth: 4,
        travelMinutes,
      });
      // Strictly NO bus route added for single-mode departure!
    }

    // Weather Callout: derived strictly from weather signal (no hardcoded hours or intensity)
    let weatherCallout: MapWeatherCalloutVM | undefined;
    if (hasRain) {
      const weatherSignal = plan.why?.evidenceSignals?.find(s => s.kind === 'weather');
      const issuedTime = weatherSignal?.issuedAt ? formatTime(weatherSignal.issuedAt, plan.timezone) : undefined;
      weatherCallout = {
        x: 160,
        y: 40,
        text: 'Rain forecast · simulated',
        subtext: issuedTime ? `Issued ${issuedTime}` : 'Travel window',
      };
    }

    const polyModes = polylines.map(p => p.mode).join(' and ');
    const ariaDescription = `Schematic simulated map showing route from Home to ${destinationName} with ${polyModes || 'transit'} line`;

    return {
      id: `map-depart-${plan.id}`,
      label: 'Spatial Context Map',
      simulatedBadge: 'Schematic · simulated',
      sizeHint,
      destinationName,
      destinationArea,
      markers: Object.freeze(markers),
      polylines: Object.freeze(polylines),
      weatherCallout,
      ariaDescription,
    };
  }

  // Lunch / candidate places map
  if (plan?.intentId === 'lunch') {
    const area =
      typeof (spatialEvidence?.placeOrRoute as any)?.area === 'string'
        ? (spatialEvidence?.placeOrRoute as any).area
        : undefined;

    const markers: MapMarkerVM[] = [
      {
        id: 'marker-user-location',
        x: 50,
        y: 85,
        label: 'You',
        sublabel: area,
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
          sublabel: distText || undefined,
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
      destinationArea: area,
      markers: Object.freeze(markers),
      polylines: Object.freeze(polylines),
      ariaDescription: 'Schematic simulated map displaying lunch candidate locations relative to your current location',
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
