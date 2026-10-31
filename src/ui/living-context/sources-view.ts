/**
 * Sources & Provenance View (Rev3 UI-HOME-QUIET)
 *
 * Dedicated modal view opened when tapping the context pill (#pill-context-status).
 * Strictly bound to the active context mode (Live vs Demo):
 * - In Live mode: truthful live feeds only (Device clock, Weather, Location, Calendar, Memory)
 *   with ZERO fabricated demo scene signals (no piano lesson, no simulated events).
 * - In Demo mode: explicit simulated scenario fixtures with SIMULATED labels.
 */

import { escapeHtml } from './presentation.js';
import { STRINGS } from './strings.js';
import type { ContextSnapshot } from '../../core/contracts/index.js';
import type { LocationStatus } from '../../adapters/providers/location-port.js';

export function renderSourcesSheet(
  mode: 'demo' | 'live',
  snapshot: ContextSnapshot,
  liveWeatherEnabled: boolean,
  liveLocation?: LocationStatus | null
): string {
  const isLive = mode === 'live';
  const title = isLive ? 'Active Sources · Live context' : 'Sources & Provenance · Demo';
  const derivation = isLive
    ? 'What feeds Home right now in Live mode. Every connected signal is listed with its truthful runtime status.'
    : 'Demo fixtures · simulated context for presentation. All signals below are simulated fixtures from the active scenario.';

  // Format device clock time
  let clockTime = 'Current device clock';
  try {
    const d = new Date(snapshot.asOf || Date.now());
    clockTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    // fallback
  }

  const isLocationGranted = liveLocation?.status === 'available';

  const sourcesList = isLive
    ? `
      <li class="sources-item" id="source-item-clock">
        <div class="sources-item-header">
          <span class="sources-item-title">Device clock</span>
          <span class="signal-badge live-badge">Live</span>
        </div>
        <div class="sources-item-desc">Local device system clock (${escapeHtml(clockTime)}). Drives the greeting and temporal grounding.</div>
      </li>
      <li class="sources-item" id="source-item-weather">
        <div class="sources-item-header">
          <span class="sources-item-title">Weather</span>
          ${liveWeatherEnabled ? `<span class="signal-badge live-badge">Live</span>` : `<span class="signal-badge off-badge">Off</span>`}
        </div>
        <div class="sources-item-desc">${liveWeatherEnabled ? 'Live Open-Meteo API (Fixed demo city: San Francisco, CA · owner-gated).' : 'Live weather is off (WEATHER_LIVE_ENABLED flag disabled).'}</div>
      </li>
      <li class="sources-item" id="source-item-location">
        <div class="sources-item-header">
          <span class="sources-item-title">Location</span>
          ${isLocationGranted ? `<span class="signal-badge live-badge">Shared this session</span>` : `<span class="signal-badge off-badge">Not shared</span>`}
        </div>
        <div class="sources-item-desc">Browser geolocation · One-shot consented acquisition (never continuously tracked or persisted).</div>
      </li>
      <li class="sources-item" id="source-item-calendar">
        <div class="sources-item-header">
          <span class="sources-item-title">Calendar</span>
          <span class="signal-badge off-badge">Not connected</span>
        </div>
        <div class="sources-item-desc">Not connected · no calendar provider configured; zero calendar data is accessed.</div>
      </li>
      <li class="sources-item" id="source-item-memory">
        <div class="sources-item-header">
          <span class="sources-item-title">Memory &amp; Preferences</span>
          <span class="signal-badge local-badge">Local only</span>
        </div>
        <div class="sources-item-desc">Local only · Sovereign in-browser storage (XMemo not connected · no unauthorized remote sync).</div>
      </li>
    `
    : `
      <li class="sources-item" id="source-item-calendar">
        <div class="sources-item-header">
          <span class="sources-item-title">Calendar event · Scheduled event</span>
          <span class="signal-badge simulated-badge">SIMULATED</span>
        </div>
        <div class="sources-item-desc">${escapeHtml((snapshot.signals.find((s: any) => s.kind === 'calendar')?.source as string) || 'Piano lesson at 3:00 PM (demo fixture)')}</div>
      </li>
      <li class="sources-item" id="source-item-weather">
        <div class="sources-item-header">
          <span class="sources-item-title">Weather forecast · Ambient signal</span>
          <span class="signal-badge simulated-badge">SIMULATED</span>
        </div>
        <div class="sources-item-desc">${escapeHtml((snapshot.signals.find((s: any) => s.kind === 'weather')?.source as string) || 'Rain forecast in travel window (demo fixture)')}</div>
      </li>
      <li class="sources-item" id="source-item-memory">
        <div class="sources-item-header">
          <span class="sources-item-title">Preference profile · Habit history</span>
          <span class="signal-badge simulated-badge">SIMULATED</span>
        </div>
        <div class="sources-item-desc">Sample demo profile · Rain travel & dining habits (demo fixture).</div>
      </li>
    `;

  return `
    <div class="modal-backdrop" id="why-sheet-backdrop" role="presentation">
      <div class="modal-card sources-modal-card" role="dialog" aria-modal="true" aria-labelledby="why-sheet-title">
        <div class="modal-header">
          <h2 id="why-sheet-title" class="modal-title" tabindex="-1" data-slot="chrome" data-slot-reason="Sources sheet title">${escapeHtml(title)}</h2>
          <button type="button" class="btn-close" id="btn-close-why" aria-label="${escapeHtml(STRINGS.whySheet.close)}" data-slot="chrome" data-slot-reason="Modal close button">&times;</button>
        </div>

        <div class="modal-body" tabindex="0" role="region" aria-label="${escapeHtml(title)}">
          <section class="why-section" id="sources-overview-section">
            <p class="why-derivation-text" id="sources-derivation-text" data-slot="chrome" data-slot-reason="Sources explanation">${escapeHtml(derivation)}</p>
          </section>

          <section class="why-section" id="sources-list-section" aria-labelledby="sources-list-heading">
            <h3 id="sources-list-heading" class="why-section-title" data-slot="chrome" data-slot-reason="Sources list heading">Active Provenance Feeds</h3>
            <ul class="why-signals-list sources-signals-list" id="sources-list">
              ${sourcesList}
            </ul>
          </section>
        </div>
      </div>
    </div>
  `;
}
