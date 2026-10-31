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
import { humanizeSignalKind } from '../review/why-sheet.js';
import type { ContextSnapshot, ContextSignal } from '../../core/contracts/index.js';
import type { LocationStatus } from '../../adapters/providers/location-port.js';

function formatDemoSignal(sig: ContextSignal): { id: string; title: string; badge: string; desc: string } {
  const kind = sig.kind || 'signal';
  const id = `source-item-${kind.replace(/_/g, '-')}`;
  const title = humanizeSignalKind(kind);
  const badge = sig.label ? sig.label.toUpperCase() : 'SIMULATED';

  let desc = '';
  const val = sig.value as any;
  if (kind === 'calendar') {
    desc = val?.title ? `${val.title} · Scheduled event` : (sig.source ? `Calendar event (${sig.source})` : 'Calendar event');
  } else if (kind === 'weather' || kind === 'weather_forecast') {
    const cond = val?.condition ? (val.condition.charAt(0).toUpperCase() + val.condition.slice(1)) : 'Rain';
    desc = `${cond} forecast in travel window · Ambient signal`;
  } else if (kind === 'travel' || kind === 'travel_estimate' || kind === 'traffic') {
    desc = val?.durationMinutes ? `Travel estimate: ${val.durationMinutes} min via ${val?.mode || 'primary route'}` : 'Transit & route travel estimate';
  } else if (kind === 'location' || kind === 'location_status') {
    const area = val?.currentArea || 'Downtown';
    const homeStr = val?.isHome ? 'at home' : 'away from home';
    desc = `Location: ${area} (${homeStr})`;
  } else if (kind === 'schedule_window') {
    const nextEv = val?.nextEvent || 'scheduled event';
    const freeUntil = val?.freeUntil ? (val.freeUntil.includes('T') ? val.freeUntil.split('T')[1].slice(0, 5) : val.freeUntil) : 'window';
    desc = `Schedule window: free until ${freeUntil} (${nextEv})`;
  } else if (kind === 'eating_status') {
    desc = val?.eatenToday === false ? `Meal status: lunch not eaten today${val?.lastMeal ? ` · Last meal: ${val.lastMeal}` : ''}` : 'Meal timing status';
  } else if (kind === 'mock_places' || kind === 'places') {
    const count = Array.isArray(val) ? val.length : 3;
    desc = `Nearby places: ${count} venue options evaluated`;
  } else {
    desc = typeof val === 'string' ? val : (sig.source ? `Signal: ${kind} (${sig.source})` : `Signal: ${kind}`);
  }

  return { id, title, badge, desc };
}

export function renderSourcesSheet(
  mode: 'demo' | 'live',
  snapshot: ContextSnapshot,
  liveWeatherEnabled: boolean,
  liveLocation?: LocationStatus | null,
  connectorStatuses?: Record<string, { state: string; detail: string }>
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

  const isLocationGranted = connectorStatuses?.location
    ? connectorStatuses.location.state === 'connected'
    : liveLocation?.status === 'available';

  const weatherDetail = connectorStatuses?.weather?.detail
    ? connectorStatuses.weather.detail
    : (liveWeatherEnabled ? 'Live Open-Meteo API (Fixed demo city: San Francisco, CA · owner-gated).' : 'Live weather is off (WEATHER_LIVE_ENABLED flag disabled).');
  const isWeatherLive = connectorStatuses?.weather
    ? connectorStatuses.weather.state === 'connected'
    : liveWeatherEnabled;

  const locationDetail = connectorStatuses?.location?.detail
    ? (connectorStatuses.location.state === 'connected' ? 'Browser geolocation · Shared this session (never continuously tracked or persisted).' : connectorStatuses.location.detail)
    : 'Browser geolocation · One-shot consented acquisition (never continuously tracked or persisted).';

  const xmemoDetail = connectorStatuses?.xmemo?.detail
    ? connectorStatuses.xmemo.detail
    : 'Local only · Sovereign in-browser storage (XMemo not connected · no unauthorized remote sync).';
  const isXmemoConnected = connectorStatuses?.xmemo
    ? connectorStatuses.xmemo.state === 'connected'
    : false;

  const calendarDetail = connectorStatuses?.calendar?.detail
    ? connectorStatuses.calendar.detail
    : 'Not connected · no calendar provider configured; zero calendar data is accessed.';

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
          ${isWeatherLive ? `<span class="signal-badge live-badge">Live</span>` : `<span class="signal-badge off-badge">Off</span>`}
        </div>
        <div class="sources-item-desc">${escapeHtml(weatherDetail)}</div>
      </li>
      <li class="sources-item" id="source-item-location">
        <div class="sources-item-header">
          <span class="sources-item-title">Location</span>
          ${isLocationGranted ? `<span class="signal-badge live-badge">Shared this session</span>` : `<span class="signal-badge off-badge">Not shared</span>`}
        </div>
        <div class="sources-item-desc">${escapeHtml(locationDetail)}</div>
      </li>
      <li class="sources-item" id="source-item-calendar">
        <div class="sources-item-header">
          <span class="sources-item-title">Calendar</span>
          <span class="signal-badge off-badge">Not connected</span>
        </div>
        <div class="sources-item-desc">${escapeHtml(calendarDetail)}</div>
      </li>
      <li class="sources-item" id="source-item-memory">
        <div class="sources-item-header">
          <span class="sources-item-title">Memory &amp; Preferences</span>
          ${isXmemoConnected ? `<span class="signal-badge live-badge">Connected</span>` : `<span class="signal-badge local-badge">Local only</span>`}
        </div>
        <div class="sources-item-desc">${escapeHtml(xmemoDetail)}</div>
      </li>
    `
    : (!snapshot.signals || snapshot.signals.length === 0)
    ? `<li class="sources-empty" id="sources-empty-state">No signals in this scene</li>`
    : snapshot.signals
        .map((sig: any, idx: number) => {
          const item = formatDemoSignal(sig);
          const itemId = idx > 0 && snapshot.signals.findIndex((s: any) => s.kind === sig.kind) !== idx
            ? `${item.id}-${idx}`
            : item.id;
          return `
      <li class="sources-item" id="${escapeHtml(itemId)}">
        <div class="sources-item-header">
          <span class="sources-item-title">${escapeHtml(item.title)}</span>
          <span class="signal-badge simulated-badge">${escapeHtml(item.badge)}</span>
        </div>
        <div class="sources-item-desc">${escapeHtml(item.desc)}</div>
      </li>
          `;
        })
        .join('');

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
