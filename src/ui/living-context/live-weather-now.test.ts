import { describe, it, expect } from 'vitest';
import { renderV2Home } from './v2-home-view.js';
import type { HomeCompositionVM } from '../view-models/types.js';

// D1-LOCATION-WEATHER: the quiet Live home shows weather only when it was measured at the
// consented device fix (weatherProvenanceLine set by the view model); never a demo city.
const quietLiveVM: HomeCompositionVM = {
  layoutKind: 'quiet',
  title: 'Nothing needs your attention right now.',
  headline: "You're all caught up.",
  basis: '',
  isRain: false,
  options: [],
  isAccepted: false,
  actions: [],
  aheadItems: [],
  proposals: [],
  isLive: true,
  weatherEnabled: true,
  weatherSignalValue: { condition: 'cloudy', temperatureC: 14.2 },
  weatherProvenanceLine: 'Open-Meteo · near you · as of 10:00 AM',
};

describe('D1 quiet Live home: weather near you', () => {
  it('renders value plus source/time when measured at the device fix', () => {
    const html = renderV2Home(quietLiveVM);
    expect(html).toContain('id="live-weather-now"');
    expect(html).toContain('data-provenance="live"');
    expect(html).toContain('Cloudy · 14.2°C');
    expect(html).toContain('Open-Meteo · near you · as of 10:00 AM');
  });

  it('renders nothing without device-fix provenance (e.g. a demo-city response in Live)', () => {
    const html = renderV2Home({ ...quietLiveVM, weatherProvenanceLine: undefined });
    expect(html).not.toContain('live-weather-now');
    expect(html).not.toContain('14.2°C');
  });

  it('renders nothing in Demo, when unavailable, on error, or with no value', () => {
    const cases: Partial<HomeCompositionVM>[] = [
      { isLive: false },
      { livingHeader: { weatherDisplay: 'Weather unavailable' } as HomeCompositionVM['livingHeader'] },
      { weatherError: 'Weather service unavailable' },
      { weatherSignalValue: {} },
      { weatherSignalValue: undefined },
    ];
    for (const patch of cases) {
      const html = renderV2Home({ ...quietLiveVM, ...patch });
      expect(html, JSON.stringify(patch)).not.toContain('live-weather-now');
    }
  });

  it('escapes provider-supplied text', () => {
    const html = renderV2Home({
      ...quietLiveVM,
      weatherSignalValue: { condition: '<img src=x onerror=alert(1)>', temperatureC: 1 },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
