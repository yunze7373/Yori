import { describe, it, expect } from 'vitest';
import { renderDesktopRightPanel } from './desktop-panel.js';
import type { DesktopPanelRenderOptions } from './desktop-panel.js';
import type { RouteResult } from '../../adapters/providers/routing-types.js';

describe('Desktop Contextual Detail Panel (S4-DESKTOP-IA)', () => {
  it('renders trip details, destination weather, and nearby lunch recommendations for travel card in demo mode', () => {
    const opts: DesktopPanelRenderOptions = {
      contextMode: 'demo',
      panelKind: 'route',
      cardKind: 'travel',
      destinationName: 'Piano Studio',
      planHeadline: 'Rain forecast · Umbrella needed',
      departureTime: '3:00 PM',
      arrivalTime: '3:25 PM',
      statusPill: '🟢 On time',
      candidateCards: [
        {
          id: 'place-1',
          name: 'Demo Place A · Ramen',
          cuisine: 'Ramen',
          distanceText: '8 min walk',
          basis: 'Matches taste',
          photo: {
            id: 'photo-1',
            label: 'Ramen',
            category: 'ramen',
            simulatedBadge: 'SIMULATED',
            svgMarkup: '<svg></svg>',
            altText: 'Ramen bowl',
          },
          isSelected: true,
        },
      ],
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('desktop-right-panel');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Piano Studio');
    expect(html).toContain('Destination Weather');
    expect(html).toContain('Rain forecast');
    expect(html).toContain('Nearby Lunch Recommendations');
    expect(html).toContain('Demo Place A · Ramen');
    expect(html).toContain('LEAVE BY');
    expect(html).toContain('ARRIVE BY');
  });

  it('omits lunch recommendations when candidateCards is empty for travel card in demo mode', () => {
    const opts: DesktopPanelRenderOptions = {
      contextMode: 'demo',
      panelKind: 'route',
      cardKind: 'travel',
      destinationName: 'Piano Studio',
      planHeadline: 'Typical traffic · 5m margin',
      departureTime: '2:25 PM',
      arrivalTime: '2:50 PM',
      statusPill: '🟢 On time',
      candidateCards: [],
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('desktop-right-panel');
    expect(html).toContain('Trip Details');
    expect(html).toContain('LEAVE BY');
    expect(html).toContain('ARRIVE BY');
    expect(html).toContain('Destination Weather');
    expect(html).not.toContain('Nearby Lunch Recommendations');
    expect(html).not.toContain('desktop-candidate-tile');
  });

  it('renders nearby dining places for lunch card in demo mode without route map', () => {
    const opts: DesktopPanelRenderOptions = {
      contextMode: 'demo',
      panelKind: 'places',
      cardKind: 'lunch',
      candidateCards: [
        {
          id: 'place-1',
          name: 'Demo Place A · Ramen',
          cuisine: 'Ramen',
          distanceText: '8 min walk',
          basis: 'Matches taste',
          photo: {
            id: 'photo-1',
            label: 'Ramen',
            category: 'ramen',
            simulatedBadge: 'SIMULATED',
            svgMarkup: '<svg></svg>',
            altText: 'Ramen bowl',
          },
          isSelected: true,
        },
      ],
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('Nearby Options & Walking Times');
    expect(html).toContain('Demo Place A · Ramen');
    expect(html).toContain('8 min walk');

    // Strict coherence: lunch panel must NEVER contain route map
    expect(html).not.toContain('Route Map');
    expect(html).not.toContain('live-route-polyline');
    expect(html).not.toContain('Destination Weather');
  });

  it('renders live route card in live mode with attribution and external maps handoff', () => {
    const mockRoute: RouteResult = {
      geometry: [
        [37.7749, -122.4194],
        [37.7599, -122.4148],
      ],
      distanceM: 2146,
      durationS: 349,
      provider: 'osrm',
      fetchedAt: '2026-11-01T00:00:00.000Z',
      attribution: 'Route © OSRM · data © OpenStreetMap contributors',
      mode: 'driving',
    };

    const opts: DesktopPanelRenderOptions = {
      contextMode: 'live',
      panelKind: 'route',
      cardKind: 'travel',
      liveRoute: mockRoute,
      liveDestination: {
        coordinate: [37.7599, -122.4148],
        name: 'Mission Dolores',
      },
      liveLocationStatus: {
        status: 'available',
        source: 'geolocation',
        coords: { lat: 37.7749, lng: -122.4194 },
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('desktop-live-route-card');
    expect(html).toContain('data-provenance="live"');
    expect(html).toContain('data-source="osrm"');
    expect(html).toContain('Route to Mission Dolores');
    expect(html).toContain('6 min');
    expect(html).toContain('2.1 km');
    expect(html).toContain('Route © OSRM · data © OpenStreetMap contributors');
    expect(html).toContain('Open in Maps');
    expect(html).toContain('Opens your maps app · not an in-app route');
  });

  it('renders honest unavailable notice for live travel when no route is available', () => {
    const opts: DesktopPanelRenderOptions = {
      contextMode: 'live',
      panelKind: 'route',
      cardKind: 'travel',
      noRouteReason: 'no_destination',
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('notice-route-unavailable');
    expect(html).toContain('data-provenance="none"');
    expect(html).toContain('data-no-route-reason="no_destination"');
    expect(html).toContain('No route available · no destination set');
  });

  it('renders honest L3 seam notice for live lunch with zero fixture provenance', () => {
    const opts: DesktopPanelRenderOptions = {
      contextMode: 'live',
      panelKind: 'places',
      cardKind: 'lunch',
    };

    const html = renderDesktopRightPanel(opts);
    expect(html).toContain('notice-places-disabled');
    expect(html).toContain('data-provenance="none"');
    expect(html).toContain('Nearby places · not enabled (owner setting)');
    expect(html).not.toContain('data-provenance="fixture"');
    expect(html).not.toContain('SIMULATED');
  });
});
