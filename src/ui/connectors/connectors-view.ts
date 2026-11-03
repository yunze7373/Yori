/**
 * Connectors Screen View Component
 * Governed by ARCH-REV3-UI-CONNECTORS and Acceptance Criteria AC-211-1, AC-203-2, AC-204-2, AC-205-1.
 *
 * Implements the Settings > Connectors screen matching the reference mockup (right phone).
 * Every connector row reflects truthful runtime state read live this session.
 */

import { escapeHtml } from '../living-context/presentation.js';
import type { ConnectorId, ConnectorStatus, GoogleCalendarConnectorInfo } from './types.js';

export function renderConnectorsView(
  statuses: Record<ConnectorId, ConnectorStatus>
): string {
  const loc = statuses.location;
  const cal = statuses.calendar;
  const weather = statuses.weather;
  const xmemo = statuses.xmemo;
  const notif = statuses.notifications;

  return `
    <main class="connectors-page-layout" id="connectors-page" role="main">
      <div class="connectors-container">
        <!-- Top Nav Bar -->
        <header class="connectors-header">
          <button
            type="button"
            class="btn-connectors-back"
            id="btn-connectors-back"
            aria-label="Back to Settings"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="connectors-top-title">Settings</span>
        </header>

        <!-- Main Title & Subtitle -->
        <div class="connectors-hero">
          <h1 class="connectors-title">Connectors</h1>
          <p class="connectors-subtitle">Give Yori the right context to be proactively helpful.</p>
        </div>

        <!-- Privacy & Control Banner -->
        <section class="connectors-privacy-banner" aria-label="Privacy guarantee">
          <div class="privacy-banner-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="privacy-banner-text">
            <strong class="privacy-banner-title">You control what Yori can access.</strong>
            <p class="privacy-banner-desc">Your data stays private and is only used to help you.</p>
          </div>
        </section>

        <!-- Connectors List -->
        <ul class="connectors-list" aria-label="Available connectors">
          <!-- 1. Location (GPS) -->
          <li class="connector-card" id="connector-row-location">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-location" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <div class="connector-info">
                <div class="connector-title-row">
                  <h2 class="connector-title">Location (GPS)</h2>
                  <span class="status-pill status-${loc.state}" id="status-pill-location">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="status-label">${escapeHtml(formatPillLabel(loc.state, loc.detail))}</span>
                  </span>
                </div>
                <p class="connector-desc">Helps Yori understand where you are, plan ahead, and suggest timely actions.</p>
                <div class="connector-detail" id="connector-detail-location">${escapeHtml(loc.detail)}</div>
                ${
                  loc.state === 'permission_needed'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-primary btn-connector-action" id="btn-connect-location">Connect</button></div>`
                    : loc.state === 'not_connected'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-primary btn-connector-action" id="btn-connect-location">Acquire fix</button></div>`
                    : loc.state === 'connected'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-outline btn-connector-action" id="btn-revoke-location">Revoke session fix</button></div>`
                    : loc.state === 'denied'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-outline btn-connector-action" id="btn-check-location">Check again</button></div>`
                    : ''
                }
              </div>
            </div>
          </li>

          <!-- 2. Calendar -->
          <li class="connector-card" id="connector-row-calendar">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-calendar" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div class="connector-info">
                <div class="connector-title-row">
                  <h2 class="connector-title">Calendar</h2>
                  <span class="status-pill status-${cal.state}" id="status-pill-calendar">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="status-label">${escapeHtml(formatPillLabel(cal.state, cal.detail))}</span>
                  </span>
                </div>
                <p class="connector-desc">Reads your events to prepare for what's next.</p>
                <div class="connector-detail" id="connector-detail-calendar">${escapeHtml(cal.detail)}</div>
                ${renderGoogleCalendarRow(cal.google)}
              </div>
            </div>
          </li>

          <!-- 3. Weather -->
          <li class="connector-card" id="connector-row-weather">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-weather" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </div>
              <div class="connector-info">
                <div class="connector-title-row">
                  <h2 class="connector-title">Weather</h2>
                  <span class="status-pill status-${weather.state}" id="status-pill-weather">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="status-label">${escapeHtml(formatPillLabel(weather.state, weather.detail))}</span>
                  </span>
                </div>
                <p class="connector-desc">Lets Yori factor in real-time weather for smarter suggestions.</p>
                <div class="connector-detail" id="connector-detail-weather">${escapeHtml(weather.detail)}</div>
              </div>
            </div>
          </li>

          <!-- 4. XMemo -->
          <li class="connector-card" id="connector-row-xmemo">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-xmemo" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div class="connector-info">
                <div class="connector-title-row">
                  <h2 class="connector-title">XMemo</h2>
                  <span class="status-pill status-${xmemo.state}" id="status-pill-xmemo">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="status-label">${escapeHtml(formatPillLabel(xmemo.state, xmemo.detail))}</span>
                  </span>
                </div>
                <p class="connector-desc">Accesses your notes and memories to personalize suggestions.</p>
                <div class="connector-detail" id="connector-detail-xmemo">${escapeHtml(xmemo.detail)}</div>
                ${
                  xmemo.state === 'not_connected'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-primary btn-connector-action" id="btn-connect-xmemo">Connect</button></div>`
                    : xmemo.state === 'connected'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-outline btn-connector-action" id="btn-disconnect-xmemo">Disconnect</button></div>`
                    : ''
                }
              </div>
            </div>
          </li>

          <!-- 5. Notifications -->
          <li class="connector-card" id="connector-row-notifications">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-notifications" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <div class="connector-info">
                <div class="connector-title-row">
                  <h2 class="connector-title">Notifications</h2>
                  <span class="status-pill status-${notif.state}" id="status-pill-notifications">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="status-label">${escapeHtml(formatPillLabel(notif.state, notif.detail))}</span>
                  </span>
                </div>
                <p class="connector-desc">Lets Yori send you important proactive updates · web browsers have no background execution.</p>
                <div class="connector-detail" id="connector-detail-notifications">${escapeHtml(notif.detail)}</div>
                ${
                  notif.state === 'permission_needed'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-primary btn-connector-action" id="btn-connect-notifications">Connect</button></div>`
                    : notif.state === 'denied'
                    ? `<div class="connector-actions"><button type="button" class="btn btn-outline btn-connector-action" id="btn-check-notifications">Check again</button></div>`
                    : ''
                }
              </div>
            </div>
          </li>

          <!-- 6. More coming soon -->
          <li class="connector-card coming-soon-card" id="connector-card-coming-soon">
            <div class="connector-card-main">
              <div class="connector-icon-tile icon-coming-soon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                </svg>
              </div>
              <div class="connector-info">
                <h2 class="connector-title">More coming soon</h2>
                <p class="connector-desc">We're adding more connectors to make Yori even more helpful for you.</p>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </main>
  `;
}

function formatPillLabel(state: string, detail: string): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'permission_needed':
      return 'Permission needed';
    case 'not_connected':
      return detail.includes('Allowed') ? 'Allowed · not used' : 'Not connected';
    case 'denied':
      return 'Denied';
    case 'owner_gated':
      return 'Owner setting';
    case 'unavailable':
      return detail.includes('Not available yet') ? 'Not available yet' : 'Unavailable';
    default:
      return 'Not connected';
  }
}

/**
 * D11: the Google Calendar sub-row inside the Calendar card. States are read from the server and
 * never assumed: not set up (no OAuth client), connected (read-only), expired or revoked (with the
 * iCal fallback named when it is live), or not connected. No email or token is ever shown.
 */
function renderGoogleCalendarRow(google: GoogleCalendarConnectorInfo | undefined): string {
  if (!google) return '';
  const notSetUp: Record<string, string> = {
    no_client_id: 'Not set up yet: the owner adds a Google OAuth client to enable this',
    owner_off: 'Off (owner setting)',
    endpoint_override_rejected: 'Not available (server configuration was rejected)',
  };
  const detail = !google.configured
    ? notSetUp[google.disabledReason ?? 'no_client_id'] ?? notSetUp['no_client_id']!
    : google.state === 'connected'
      ? 'Connected · read-only'
      : google.state === 'expired'
        ? google.icsFallback
          ? 'Access expired · using your iCalendar feed instead'
          : 'Access expired · no calendar connected'
        : 'Not connected';
  const action = !google.configured
    ? ''
    : google.state === 'connected'
      ? `<button type="button" class="btn btn-outline btn-connector-action" id="btn-disconnect-google-calendar">Disconnect Google Calendar</button>`
      : `<button type="button" class="btn btn-primary btn-connector-action" id="btn-connect-google-calendar">${google.state === 'expired' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</button>`;
  return `
                <div class="connector-subrow" id="connector-google-calendar" data-google-state="${escapeHtml(google.configured ? google.state : 'not_set_up')}">
                  <div class="connector-subrow-head">
                    <span class="connector-subrow-title">Google Calendar</span>
                    <span class="connector-subrow-detail" id="google-calendar-detail">${escapeHtml(detail)}</span>
                  </div>
                  ${google.configured ? `<p class="connector-disclosure" id="google-calendar-disclosure">Calendar events are read from Google, read-only. Yori never changes your calendar.</p>` : ''}
                  ${action ? `<div class="connector-actions">${action}</div>` : ''}
                </div>`;
}

