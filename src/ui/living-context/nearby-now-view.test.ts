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

  it('notes are a designed state (icon + title + guidance), announced politely', () => {
    const html = renderV2Home({
      ...quiet,
      nearbyNow: { state: 'ready', note: { kind: 'error', title: 'Nearby search failed', desc: 'OpenStreetMap Overpass did not answer. Try again in a moment.' } },
    });
    expect(html).toContain('class="nearby-state nearby-state-error" id="nearby-now-note" role="status"');
    expect(html).toContain('<span class="nearby-state-title">Nearby search failed</span>');
    expect(html).toContain('Try again in a moment.');
  });

  it('off is a designed state too', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'off' } });
    expect(html).toContain('class="nearby-state nearby-state-off" id="nearby-now-off"');
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

describe('UI-QUIET-PRECISION increment 2: Live consent and failure read plainly', () => {
  const visible = (html: string) =>
    html
      .replace(/<span class="[^"]*qp-visually-hidden[^"]*">[^<]*<\/span>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

  it('consent: one sentence-case title, one plain line, the disclosure, then Use my location / Not now', () => {
    const vm = {
      ...quiet,
      title: 'Use your location',
      headline: 'Yori uses it to find lunch places near you.',
      basis: '',
      locationState: 'prompt',
      consentHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }],
    } as HomeCompositionVM;
    const html = renderV2Home(vm);
    const text = visible(html);
    expect(text).toContain('Use your location');
    expect(text).toContain('Yori uses it to find lunch places near you.');
    expect(text).toContain('sent only to: places.googleapis.com (nearby places and photos)');
    expect(html).toMatch(/id="btn-request-location"[^>]*>\s*Use my location\s*</);
    expect(html).toMatch(/id="btn-deny-location"[^>]*>\s*Not now\s*</);
    for (const banned of ['coordinates manually', 'Location Permission Needed', 'Grant permission', 'Use My Location', '>Deny<', 'Location Needed']) {
      expect(text).not.toContain(banned);
    }
    // Primary before secondary, disclosure before both.
    expect(html.indexOf('location-consent-hosts')).toBeLessThan(html.indexOf('btn-request-location'));
    expect(html.indexOf('btn-request-location')).toBeLessThan(html.indexOf('btn-deny-location'));
  });

  it('failure: no "all caught up" beside it, one failure line, Retry, no trailing reminder line', () => {
    const html = renderV2Home({
      ...quiet,
      title: 'Nothing needs your attention right now.',
      headline: "You're all caught up. We'll let you know when something comes up.",
      basis: 'No proactive reminders needed for your schedule right now.',
      nearbyNow: { state: 'ready', note: { kind: 'error', title: "Nearby places didn't load.", desc: '' } },
    });
    const text = visible(html);
    expect(text).not.toMatch(/all caught up/i);
    expect(text).not.toContain('No proactive reminders');
    expect(html).toMatch(/id="btn-nearby-now"[^>]*>Retry</);
    expect(text).toContain("Nearby places didn't load.");
    expect(html).not.toContain('class="nearby-state-desc"');
    // Increment 3: "nothing needs you" is said once per screen (the header); the failure leads.
    expect(text).not.toMatch(/Nothing needs your attention/);
    expect(html).not.toContain('id="quiet-title"');
    // The failure is said first, then the action.
    expect(html.indexOf('id="nearby-now-note"')).toBeLessThan(html.indexOf('id="btn-nearby-now"'));
  });

  it('empty and ready states keep the calm subtitle and the Nearby now button', () => {
    const html = renderV2Home({ ...quiet, nearbyNow: { state: 'ready', note: { kind: 'empty', title: 'No places open nearby', desc: 'Try again later.' } } });
    expect(visible(html)).toContain("You're all caught up.");
    expect(html).toMatch(/id="btn-nearby-now"[^>]*>Nearby now</);
  });
});
