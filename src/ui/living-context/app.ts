/**
 * Living Context App Component
 * Governed by Architecture Rev3 Section 5 and AC-105-1.
 *
 * Implements the responsive mobile-first + desktop Living Context surface:
 * - Scene Switcher driven by scenario player (Clear = D1, Rain = D2, Away-lunch = D3, Quiet = D4, etc.)
 * - Always-visible 'Demo · simulated context' chip (INV-102)
 * - NOW (<=1 item), AHEAD (<=3 items), FOR YOU (pending memory items)
 * - Map rendered ONLY when spatial evidence exists
 * - Honest quiet state and fail-closed notice states
 * - Mobile bottom tab bar (Today active, others inactive)
 * - Dynamic context-aware greeting derived from snapshot time in snapshot timezone
 * - Clean human copy shielded from engine formulas, slice IDs, and internal memory keys
 * - Full HTML escaping across all dynamic interpolations to prevent XSS
 */

import { STRINGS } from './strings.js';
import { runPipeline, type PipelineResult } from '../../core/pipeline/index.js';
import { staticPluginRegistry } from '../../plugins/registry.js';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
  d2Scenario,
  d2MemoryFacts,
  d3Scenario,
  d3MemoryFacts,
  d4ScenarioBusy,
  d4MemoryFacts,
  d6ScenarioMissingWeather,
  D6_EVALUATION_CLOCK,
} from '../../../tests/fixtures/index.js';
import {
  createScenarioPlayer,
  createFixedClock,
} from '../../app/scenario-player/index.js';
import type { SpatialMapEvidence } from '../../core/contracts/index.js';
import {
  escapeHtml,
  getGreeting,
  formatNowPlan,
} from './presentation.js';
import {
  YoriStorage,
  InMemoryStorageDriver,
} from '../../core/storage/index.js';

export type DemoSceneId =
  | 'clear'
  | 'rain'
  | 'away-lunch'
  | 'busy-lunch'
  | 'missing-weather'
  | 'corrupt-storage';

export interface AppState {
  currentScene: DemoSceneId;
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
  storage: YoriStorage;
  snapshotAsOf: string;
  snapshotTimezone: string;
}

export function computeSceneState(scene: DemoSceneId): {
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
  storage: YoriStorage;
  snapshotAsOf: string;
  snapshotTimezone: string;
} {
  const plugins = staticPluginRegistry.getAll();
  const driver = new InMemoryStorageDriver();
  const storage = new YoriStorage(driver);

  switch (scene) {
    case 'clear': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshots = player.getSnapshots();
      const latestSnapshot = snapshots[snapshots.length - 1]!;
      const result = runPipeline({
        snapshot: latestSnapshot,
        memory: d1MemoryFacts,
        clock: D1_INITIAL_CLOCK,
        plugins,
        storage,
      });

      const calendarSig = latestSnapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Downtown)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage,
        snapshotAsOf: latestSnapshot.asOf,
        snapshotTimezone: latestSnapshot.timezone || 'America/Los_Angeles',
      };
    }

    case 'rain': {
      const clock = createFixedClock('2026-10-28T20:35:00.000Z');
      const player = createScenarioPlayer(d2Scenario, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z');
      const result = runPipeline({
        snapshot,
        memory: d2MemoryFacts,
        clock: '2026-10-28T20:35:00.000Z',
        plugins,
        storage,
      });

      const calendarSig = snapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Rain Route)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
      };
    }

    case 'away-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d3Scenario, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');
      const result = runPipeline({
        snapshot,
        memory: d3MemoryFacts,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage,
      });

      const locSig = snapshot.signals.find(s => s.kind === 'location_status');
      const mapEvidence: SpatialMapEvidence | null = locSig
        ? {
            placeOrRoute: { name: 'Downtown Dining District', area: 'Downtown' },
            spatialEvidence: locSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
      };
    }

    case 'busy-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d4ScenarioBusy, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');
      const result = runPipeline({
        snapshot,
        memory: d4MemoryFacts,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError: false,
        storage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
      };
    }

    case 'missing-weather': {
      const clock = createFixedClock(D6_EVALUATION_CLOCK);
      const player = createScenarioPlayer(d6ScenarioMissingWeather, clock);
      const snapshot = player.getSnapshotAt(D6_EVALUATION_CLOCK);
      const result = runPipeline({
        snapshot,
        memory: [],
        clock: D6_EVALUATION_CLOCK,
        plugins,
        storage,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError: false,
        storage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
      };
    }

    case 'corrupt-storage': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshot = player.getSnapshotAt(D1_INITIAL_CLOCK);

      // Seed driver with invalid/corrupt envelope
      driver.setItem(
        'yori_state_v1',
        JSON.stringify({
          schemaVersion: 999,
          createdAt: D1_INITIAL_CLOCK,
          updatedAt: D1_INITIAL_CLOCK,
          payload: { corrupted: true, notes: 'Invalid future schema' },
        })
      );

      let storageError = false;
      try {
        storage.load();
      } catch {
        storageError = true;
      }

      const result = runPipeline({
        snapshot,
        memory: [],
        clock: D1_INITIAL_CLOCK,
        plugins,
        storage,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError,
        storage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
      };
    }
  }
}

export function renderApp(root: HTMLElement, initialScene: DemoSceneId = 'clear'): void {
  let currentScene = initialScene;
  let activeStorage: YoriStorage | null = null;
  let actionFeedbackMessage: string | null = null;

  function update() {
    const {
      pipelineResult,
      spatialMapEvidence,
      storageError,
      storage,
      snapshotAsOf,
      snapshotTimezone,
    } = computeSceneState(currentScene);

    activeStorage = storage;
    const living = pipelineResult.livingContext;
    const nowPlan = living.now;
    const notices = pipelineResult.notices;

    const greeting = getGreeting(snapshotAsOf, snapshotTimezone);
    const nowPresentation = nowPlan ? formatNowPlan(nowPlan) : null;

    root.innerHTML = `
      <div class="app-layout">
        <header class="header-bar" role="banner">
          <div class="main-container" style="padding-bottom: 0;">
            <div class="top-meta">
              <span class="demo-chip" aria-label="Simulation Status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                ${escapeHtml(STRINGS.header.demoChip)}
              </span>
              <div class="scene-switcher">
                <label for="scene-select" class="scene-select-label">Demo Scene:</label>
                <select id="scene-select" class="scene-select" aria-label="Switch Demo Scenario">
                  <option value="clear" ${currentScene === 'clear' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.clear)}</option>
                  <option value="rain" ${currentScene === 'rain' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.rain)}</option>
                  <option value="away-lunch" ${currentScene === 'away-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.awayLunch)}</option>
                  <option value="busy-lunch" ${currentScene === 'busy-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.busyLunch)}</option>
                  <option value="missing-weather" ${currentScene === 'missing-weather' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.missingWeather)}</option>
                  <option value="corrupt-storage" ${currentScene === 'corrupt-storage' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.corruptStorage)}</option>
                </select>
              </div>
            </div>

            <div class="greeting-section">
              <h1 class="greeting-title">${escapeHtml(greeting.greeting)}</h1>
              <p class="greeting-subheading">${escapeHtml(greeting.subheading)}</p>
            </div>
          </div>
        </header>

        <main class="main-container" role="main">
          ${
            storageError
              ? `
            <div class="error-box" role="alert" aria-live="assertive">
              <h2 class="error-title">${escapeHtml(STRINGS.storageError.title)}</h2>
              <p>${escapeHtml(STRINGS.storageError.message)}</p>
              <div class="error-actions">
                <button type="button" class="btn btn-secondary" id="btn-export-storage">${escapeHtml(STRINGS.storageError.exportBtn)}</button>
                <button type="button" class="btn btn-danger" id="btn-reset-storage">${escapeHtml(STRINGS.storageError.resetBtn)}</button>
              </div>
              <div id="storage-action-feedback" class="storage-feedback" role="status">
                ${actionFeedbackMessage ? escapeHtml(actionFeedbackMessage) : ''}
              </div>
            </div>
          `
              : ''
          }

          ${
            notices.length > 0
              ? notices
                  .map(
                    n => `
            <div class="notice-box" role="status">
              <strong>${escapeHtml(STRINGS.notices.degradedNoticeHeader)}</strong> ${escapeHtml(n.noticeText)}
            </div>
          `
                  )
                  .join('')
              : ''
          }

          <!-- Hero Grid: Map (if evidence exists) + NOW -->
          <div class="hero-grid">
            ${
              spatialMapEvidence
                ? `
              <section class="card map-card" aria-label="${escapeHtml(STRINGS.map.label)}">
                <div class="map-header">
                  <span class="section-label">${escapeHtml(STRINGS.map.label)}</span>
                  <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
                </div>
                <div class="map-svg-illustration" role="img" aria-label="${escapeHtml(STRINGS.map.abstractStreetDescription)}">
                  <svg width="100%" height="100%" viewBox="0 0 320 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <rect width="100%" height="100%" fill="#E9F1E8" rx="12"/>
                    <!-- Abstract street grid -->
                    <line x1="20" y1="40" x2="300" y2="40" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
                    <line x1="20" y1="95" x2="300" y2="95" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
                    <line x1="85" y1="15" x2="85" y2="125" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
                    <line x1="210" y1="15" x2="210" y2="125" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
                    <!-- Route path -->
                    <path d="M 85 95 L 210 95 L 210 40" stroke="#2F6F64" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>
                    <!-- Origin and Destination markers -->
                    <circle cx="85" cy="95" r="5" fill="#16382F"/>
                    <circle cx="210" cy="40" r="8" fill="#2F6F64" />
                    <circle cx="210" cy="40" r="14" stroke="#2F6F64" stroke-width="2" stroke-dasharray="4 2"/>
                  </svg>
                </div>
                <div class="map-place-info">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  ${escapeHtml(String((spatialMapEvidence.placeOrRoute as Record<string, string>).name || 'Destination'))}
                </div>
              </section>
            `
                : ''
            }

            ${
              nowPresentation
                ? `
              <section class="card now-card" aria-label="${escapeHtml(STRINGS.sections.now)}">
                <div>
                  <span class="section-label">${escapeHtml(STRINGS.sections.now)}</span>
                  <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
                  <h2 class="now-subject">${escapeHtml(nowPresentation.title)}</h2>
                  <div class="now-title" id="now-title">${escapeHtml(nowPresentation.headline)}</div>
                </div>

                ${
                  nowPresentation.isRain
                    ? `
                  <div class="rain-banner" role="status">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
                      <line x1="8" y1="19" x2="8" y2="21"></line>
                      <line x1="12" y1="17" x2="12" y2="21"></line>
                      <line x1="16" y1="19" x2="16" y2="21"></line>
                    </svg>
                    <span>${escapeHtml(nowPresentation.rainBanner || '')}</span>
                  </div>
                  <div class="checklist-container" aria-label="Recommended Checklist">
                    <span class="checklist-chip" id="chip-umbrella">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                      </svg>
                      ${escapeHtml(nowPresentation.umbrellaChip || '')}
                    </span>
                  </div>
                `
                    : ''
                }

                ${
                  nowPresentation.options && nowPresentation.options.length > 0
                    ? `
                  <div class="options-grid" aria-label="Available Options">
                    ${nowPresentation.options
                      .map(
                        opt => `
                      <div class="option-tile">
                        <span class="option-label">${escapeHtml(opt.label)}</span>
                        ${opt.meta ? `<span class="option-meta">${escapeHtml(opt.meta)}</span>` : ''}
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                `
                    : ''
                }

                ${
                  nowPresentation.habitNote
                    ? `<div class="habit-note">${escapeHtml(nowPresentation.habitNote)}</div>`
                    : ''
                }

                ${
                  nowPresentation.mockPlacesNotice
                    ? `<div class="mock-places-notice">${escapeHtml(nowPresentation.mockPlacesNotice)}</div>`
                    : ''
                }

                <div class="now-basis">
                  <p>${escapeHtml(nowPresentation.basis)}</p>
                </div>

                <div class="action-row" aria-label="Plan Actions">
                  <button type="button" class="btn btn-primary" disabled aria-disabled="true" title="${escapeHtml(STRINGS.actions.comingSoon)}">
                    ${escapeHtml(STRINGS.actions.accept)}
                  </button>
                  <button type="button" class="btn btn-outline" disabled aria-disabled="true" title="${escapeHtml(STRINGS.actions.comingSoon)}">
                    ${escapeHtml(STRINGS.actions.adjust)}
                  </button>
                  <button type="button" class="btn btn-outline" disabled aria-disabled="true" title="${escapeHtml(STRINGS.actions.comingSoon)}">
                    ${escapeHtml(STRINGS.actions.dismiss)}
                  </button>
                  <span class="btn-hint">${escapeHtml(STRINGS.actions.comingSoon)}</span>
                </div>
              </section>
            `
                : `
              <section class="card quiet-card" aria-label="Quiet State">
                <div class="quiet-icon" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                <h2 class="quiet-title">${escapeHtml(STRINGS.quietState.title)}</h2>
                <p class="quiet-subtitle">${escapeHtml(STRINGS.quietState.subtitle)}</p>
              </section>
            `
            }
          </div>

          <!-- Secondary Grid: AHEAD & FOR YOU -->
          <div class="secondary-grid">
            <section aria-label="${escapeHtml(STRINGS.sections.ahead)}">
              <h2 class="section-label">${escapeHtml(STRINGS.sections.ahead)}</h2>
              <div class="ahead-list">
                ${
                  living.ahead.length > 0
                    ? living.ahead
                        .map(
                          item => `
                  <div class="item-row">
                    <div>
                      <div class="item-title">${escapeHtml(item.headline)}</div>
                      <div class="item-subtitle">Scheduled event on your calendar</div>
                    </div>
                    <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
                  </div>
                `
                        )
                        .join('')
                    : `
                  <div class="item-row" style="color: var(--color-muted);">
                    <span>No upcoming moments scheduled</span>
                  </div>
                `
                }
              </div>
            </section>

            <section aria-label="${escapeHtml(STRINGS.sections.forYou)}">
              <h2 class="section-label">${escapeHtml(STRINGS.sections.forYou)}</h2>
              <div class="for-you-list">
                ${
                  living.forYou.length > 0
                    ? living.forYou
                        .map(
                          fact => `
                  <div class="item-row">
                    <div>
                      <div class="item-title">Preference insight: ${escapeHtml(fact.key)}</div>
                      <div class="item-subtitle">Suggested preference waiting for your confirmation</div>
                    </div>
                    <span class="card-badge" style="background-color: #FEF3C7; color: #92400E;">Pending Confirm</span>
                  </div>
                `
                        )
                        .join('')
                    : `
                  <div class="item-row" style="color: var(--color-muted);">
                    <span>No memory confirmations pending</span>
                  </div>
                `
                }
              </div>
            </section>
          </div>
        </main>

        <!-- Bottom Tab Bar (Mobile) -->
        <nav class="bottom-tab-bar" aria-label="Main Navigation">
          <button type="button" class="tab-item active" aria-current="page">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.today)}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${escapeHtml(STRINGS.tabs.comingSoonBadge)}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.explore)}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${escapeHtml(STRINGS.tabs.comingSoonBadge)}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.ask)}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${escapeHtml(STRINGS.tabs.comingSoonBadge)}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.me)}</span>
          </button>
        </nav>
      </div>
    `;

    // Bind event listeners
    const selectEl = root.querySelector('#scene-select') as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.addEventListener('change', e => {
        currentScene = (e.target as HTMLSelectElement).value as DemoSceneId;
        actionFeedbackMessage = null;
        update();
      });
    }

    const exportBtn = root.querySelector('#btn-export-storage') as HTMLButtonElement | null;
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const raw = activeStorage ? activeStorage.exportRaw() : null;
        const backupData = raw || '{"status": "empty"}';
        const blob = new Blob([backupData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'yori-storage-backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        actionFeedbackMessage = STRINGS.storageError.exportedNotice;
        const feedback = root.querySelector('#storage-action-feedback');
        if (feedback) {
          feedback.textContent = STRINGS.storageError.exportedNotice;
        }
      });
    }

    let confirmingReset = false;
    const resetBtn = root.querySelector('#btn-reset-storage') as HTMLButtonElement | null;
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirmingReset) {
          confirmingReset = true;
          resetBtn.textContent = 'Confirm Reset';
          resetBtn.style.backgroundColor = '#991B1B';
          return;
        }
        if (activeStorage) {
          activeStorage.reset();
        }
        confirmingReset = false;
        actionFeedbackMessage = STRINGS.storageError.resetNotice;
        currentScene = 'clear';
        update();
      });
    }
  }

  update();
}
