/**
 * UI-QUIET-PRECISION (owner directive 2026-11-03 17:05 / 17:08 JST, TID INBOX-20261103-A22CFB):
 * the Home header band. The status line, LIVE badge, engine pill, "Live context" bubble and the
 * connector chip row are replaced by an editorial header (greeting plus one quiet line) and ONE
 * ambient context line with icons (time, weather, place). Connector state lives in Settings >
 * Connectors; the engine status and every source live in the Sources sheet, one tap away.
 * - The ambient line keeps the honest living-header text exactly (its textContent is the derived
 *   'time · weather · place' line); icons are decorative and carry no text.
 * - The time-of-day tint follows the device clock (Live) or the simulated clock (Demo).
 */

import { escapeHtml } from './presentation.js';

export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export function dayPartForHour(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const ICON_ATTRS = 'width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

const CLOCK_ICON = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`;
const PIN_ICON = `<svg ${ICON_ATTRS}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`;
const SUN_ICON = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`;
const CLOUD_ICON = `<svg ${ICON_ATTRS}><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z"/></svg>`;
const RAIN_ICON = `<svg ${ICON_ATTRS}><path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6.6 4.2 4.2 0 0 0 7 15z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/></svg>`;
const WEATHER_OFF_ICON = `<svg ${ICON_ATTRS}><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z" stroke-dasharray="2.5 2.5"/></svg>`;

export function weatherIconFor(weatherText: string): string {
  const t = weatherText.toLowerCase();
  if (/unavailable|needs location|off/.test(t)) return WEATHER_OFF_ICON;
  if (/rain|drizzle|shower|storm|thunder/.test(t)) return RAIN_ICON;
  if (/cloud|overcast|fog|mist|haze/.test(t)) return CLOUD_ICON;
  if (/clear|sun|fair/.test(t)) return SUN_ICON;
  return CLOUD_ICON;
}

/**
 * The ambient line: 'time · weather · place' with one decorative icon per segment. The text
 * (including the ' · ' separators) is unchanged, so its textContent stays the honest header line.
 */
export function renderAmbientLine(formattedLine: string): string {
  const parts = formattedLine.split(' · ');
  if (parts.length !== 3) {
    return `<span class="living-header-line" id="living-header-line">${escapeHtml(formattedLine)}</span>`;
  }
  const [time, weather, place] = parts as [string, string, string];
  const seg = (cls: string, icon: string, text: string) =>
    `<span class="qp-ambient-seg ${cls}"><span class="qp-ambient-icon">${icon}</span>${escapeHtml(text)}</span>`;
  const sep = '<span class="qp-ambient-sep"> · </span>';
  return (
    `<span class="living-header-line" id="living-header-line">` +
    seg('qp-seg-time', CLOCK_ICON, time) +
    sep +
    seg('qp-seg-weather', weatherIconFor(weather), weather) +
    sep +
    seg('qp-seg-place', PIN_ICON, place) +
    `</span>`
  );
}

/** The one quiet header control: opens the Sources sheet (every source and the engine status). */
export const SOURCES_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3c4.5 2.4 7 6 7 10a7 7 0 0 1-14 0c0-4 2.5-7.6 7-10z"/><path d="M12 8v12"/><path d="M12 13l-3-2.5M12 16.5l3.2-2.7"/></svg>`;

/** A quiet botanical sprig, drawn in the header corner (decorative only). */
export const BOTANICAL_SPRIG = `<svg class="qp-sprig" viewBox="0 0 220 180" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <path d="M206 6 C 170 40, 140 70, 96 112 S 34 168, 8 176"/>
    <path d="M170 38 C 176 22, 192 14, 204 16 C 200 30, 188 40, 170 38 Z" fill="currentColor" fill-opacity="0.16"/>
    <path d="M150 58 C 140 40, 144 22, 156 14 C 166 28, 164 46, 150 58 Z" fill="currentColor" fill-opacity="0.12"/>
    <path d="M128 80 C 134 62, 152 54, 166 58 C 160 74, 146 84, 128 80 Z" fill="currentColor" fill-opacity="0.16"/>
    <path d="M110 98 C 98 82, 100 62, 112 54 C 124 68, 122 88, 110 98 Z" fill="currentColor" fill-opacity="0.12"/>
    <path d="M88 120 C 96 102, 116 96, 130 102 C 122 118, 106 126, 88 120 Z" fill="currentColor" fill-opacity="0.14"/>
    <path d="M66 138 C 54 124, 56 104, 68 96 C 80 110, 78 130, 66 138 Z" fill="currentColor" fill-opacity="0.1"/>
    <path d="M44 154 C 52 138, 70 132, 84 138 C 76 152, 60 160, 44 154 Z" fill="currentColor" fill-opacity="0.12"/>
  </g>
</svg>`;

/** The Live context pill's chevron (same stroke family as every other icon). */
export const CHEVRON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6"/></svg>`;

/**
 * Owner reference 04: a soft botanical illustration bleeding off the top-right corner (pale
 * overlapping leaves and one deeper green leaf). Pure vector, crisp at 2x; decorative only.
 */
export const BOTANICAL_LEAF = `<svg class="qp-leaf" viewBox="0 0 280 320" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="qpLeafPale" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4F2E8"/>
      <stop offset="1" stop-color="#E3E8D9"/>
    </linearGradient>
    <linearGradient id="qpLeafSage" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#DCE5D3"/>
      <stop offset="1" stop-color="#C3D3BD"/>
    </linearGradient>
    <linearGradient id="qpLeafDeep" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#7FA27F"/>
      <stop offset="0.55" stop-color="#4E7A58"/>
      <stop offset="1" stop-color="#2F5A3E"/>
    </linearGradient>
  </defs>
  <path d="M300 -20 C 210 0, 140 60, 128 150 C 190 150, 262 112, 300 40 Z" fill="url(#qpLeafPale)"/>
  <path d="M296 -6 C 230 26, 168 82, 138 146" fill="none" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="1.4"/>
  <path d="M286 70 C 200 76, 128 128, 102 214 C 176 222, 250 182, 290 120 Z" fill="url(#qpLeafPale)" opacity="0.92"/>
  <path d="M284 82 C 214 104, 150 150, 110 208" fill="none" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="1.3"/>
  <path d="M168 24 C 120 64, 104 128, 126 190 C 168 150, 188 88, 168 24 Z" fill="url(#qpLeafSage)" opacity="0.9"/>
  <path d="M166 34 C 140 90, 132 140, 128 184" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="1.2"/>
  <path d="M268 148 C 214 168, 186 222, 196 292 C 246 262, 276 214, 268 148 Z" fill="url(#qpLeafDeep)"/>
  <path d="M264 160 C 232 196, 212 240, 200 284" fill="none" stroke="#E9F1E4" stroke-opacity="0.75" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M240 196 l -18 -6 M232 216 l -20 -4 M224 238 l -18 -2 M246 206 l 12 -14 M236 230 l 14 -12" fill="none" stroke="#E9F1E4" stroke-opacity="0.45" stroke-width="1" stroke-linecap="round"/>
  <path d="M196 292 C 200 304, 206 312, 214 320" fill="none" stroke="#3F6B4D" stroke-width="2" stroke-linecap="round"/>
</svg>`;
