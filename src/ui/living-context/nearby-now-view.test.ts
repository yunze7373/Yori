import { describe, it, expect } from 'vitest';
import { renderV2Home, renderLocationControls } from './v2-home-view.js';
import type { HomeCompositionVM } from '../view-models/types.js';

// D2-LUNCH-DEFAULT-ON: "Nearby now" affordance states and the consent copy naming exact hosts.
const quiet: HomeCompositionVM = {
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
};

describe('D2 Nearby now on the quiet Live home', () => {
  it('ready: a 44px-target primary button names the source', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'ready' } });
    expect(html).toContain('id="btn-nearby-now"');
    expect(html).toContain('>Nearby now<');
    expect(html).toContain('OpenStreetMap via Overpass');
    expect(html).not.toContain('disabled');
  });

  it('loading: disabled + aria-busy, never a second clickable trigger', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'loading' } });
    expect(html).toMatch(/id="btn-nearby-now"[^>]*disabled aria-busy="true"/);
    expect(html).toContain('Searching nearby…');
  });

  it('off: honest owner-setting line, no button', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'off' } });
    expect(html).not.toContain('btn-nearby-now');
    expect(html).toContain('Nearby restaurants are off (owner setting)');
  });

  it('absent without a shared fix, in Demo, and on the suppressed quiet card', () => {
    expect(renderV2Home(quiet)).not.toContain('nearby-now');
    expect(renderV2Home({ ...quiet, isLive: false, nearbyNow: { state: 'ready' } })).not.toContain('btn-nearby-now');
    expect(
      renderV2Home({
        ...quiet,
        nearbyNow: { state: 'ready' },
        suppressedQuiet: { message: "Okay — I'll stay quiet about lunch today", budgetMeter: '1/3' } as any,
      })
    ).not.toContain('btn-nearby-now');
  });

  it('a cooldown note is announced politely', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'ready', note: 'Up to date · searched moments ago' } });
    expect(html).toContain('id="nearby-now-note" role="status"');
  });
});

describe('D2 consent copy names the exact enabled hosts', () => {
  const prompt = { ...quiet, locationState: 'prompt' } as HomeCompositionVM;

  it('lists host (purpose) for each enabled provider', () => {
    const html = renderLocationControls({
      ...prompt,
      consentHosts: [
        { purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' },
        { purpose: 'driving routes', host: 'router.project-osrm.org' },
        { purpose: 'walking routes', host: 'routing.openstreetmap.de/routed-foot' },
        { purpose: 'weather', host: 'api.open-meteo.com' },
      ],
    });
    expect(html).toContain('id="location-consent-hosts"');
    expect(html).toContain(
      'sent only to: overpass-api.de/api/interpreter (nearby places), router.project-osrm.org (driving routes), routing.openstreetmap.de/routed-foot (walking routes), api.open-meteo.com (weather)'
    );
    expect(html).toContain('rounded to about 100 m');
  });

  it('with every provider off (shipped default) says nothing is sent', () => {
    const html = renderLocationControls({ ...prompt, consentHosts: [] });
    expect(html).toContain('your location is not sent to any provider');
  });
});
