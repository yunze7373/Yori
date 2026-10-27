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

export type DemoSceneId = 'clear' | 'rain' | 'away-lunch' | 'busy-lunch' | 'missing-weather' | 'corrupt-storage';

export interface AppState {
  currentScene: DemoSceneId;
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
}

export function computeSceneState(scene: DemoSceneId): {
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
} {
  const plugins = staticPluginRegistry.getAll();

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
      });

      const calendarSig = latestSnapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Downtown)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return { pipelineResult: result, spatialMapEvidence: mapEvidence, storageError: false };
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
      });

      const calendarSig = snapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Rain Route)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return { pipelineResult: result, spatialMapEvidence: mapEvidence, storageError: false };
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
      });

      const locSig = snapshot.signals.find(s => s.kind === 'location_status');
      const mapEvidence: SpatialMapEvidence | null = locSig
        ? {
            placeOrRoute: { name: 'Downtown Dining District', area: 'Downtown' },
            spatialEvidence: locSig,
          }
        : null;

      return { pipelineResult: result, spatialMapEvidence: mapEvidence, storageError: false };
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
      });

      return { pipelineResult: result, spatialMapEvidence: null, storageError: false };
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
      });

      return { pipelineResult: result, spatialMapEvidence: null, storageError: false };
    }

    case 'corrupt-storage': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshot = player.getSnapshotAt(D1_INITIAL_CLOCK);
      const result = runPipeline({
        snapshot,
        memory: [],
        clock: D1_INITIAL_CLOCK,
        plugins,
      });

      return { pipelineResult: result, spatialMapEvidence: null, storageError: true };
    }
  }
}

export function renderApp(root: HTMLElement, initialScene: DemoSceneId = 'clear'): void {
  let currentScene = initialScene;

  function update() {
    const { pipelineResult, spatialMapEvidence, storageError } = computeSceneState(currentScene);
    const living = pipelineResult.livingContext;
    const nowPlan = living.now;
    const notices = pipelineResult.notices;

    // Check if rain scene to render rain banner and chips
    const isRainScene = currentScene === 'rain';

    root.innerHTML = `
      <div class="app-layout">
        <header class="header-bar" role="banner">
          <div class="main-container" style="padding-bottom: 0;">
            <div class="top-meta">
              <span class="demo-chip" aria-label="Simulation Status">
                <span style="font-size: 1rem;" aria-hidden="true">🌱</span>
                ${STRINGS.header.demoChip}
              </span>
              <div class="scene-switcher">
                <label for="scene-select" class="scene-select-label">Demo Scene:</label>
                <select id="scene-select" class="scene-select" aria-label="Switch Demo Scenario">
                  <option value="clear" ${currentScene === 'clear' ? 'selected' : ''}>${STRINGS.scenes.clear}</option>
                  <option value="rain" ${currentScene === 'rain' ? 'selected' : ''}>${STRINGS.scenes.rain}</option>
                  <option value="away-lunch" ${currentScene === 'away-lunch' ? 'selected' : ''}>${STRINGS.scenes.awayLunch}</option>
                  <option value="busy-lunch" ${currentScene === 'busy-lunch' ? 'selected' : ''}>${STRINGS.scenes.busyLunch}</option>
                  <option value="missing-weather" ${currentScene === 'missing-weather' ? 'selected' : ''}>${STRINGS.scenes.missingWeather}</option>
                  <option value="corrupt-storage" ${currentScene === 'corrupt-storage' ? 'selected' : ''}>${STRINGS.scenes.corruptStorage}</option>
                </select>
              </div>
            </div>

            <div class="greeting-section">
              <h1 class="greeting-title">${STRINGS.header.greeting}</h1>
              <p class="greeting-subheading">${STRINGS.header.subheading}</p>
            </div>
          </div>
        </header>

        <main class="main-container" role="main">
          ${
            storageError
              ? `
            <div class="error-box" role="alert" aria-live="assertive">
              <h2 class="error-title">${STRINGS.storageError.title}</h2>
              <p>${STRINGS.storageError.message}</p>
              <div class="error-actions">
                <button type="button" class="btn btn-secondary" id="btn-export-storage">${STRINGS.storageError.exportBtn}</button>
                <button type="button" class="btn btn-danger" id="btn-reset-storage">${STRINGS.storageError.resetBtn}</button>
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
              <strong>Degraded Notice:</strong> ${n.noticeText}
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
              <section class="card map-card" aria-label="${STRINGS.map.label}">
                <div class="map-header">
                  <span class="section-label">${STRINGS.map.label}</span>
                  <span class="card-badge">${STRINGS.header.simulatedBadge}</span>
                </div>
                <div class="map-svg-illustration" role="img" aria-label="${STRINGS.map.abstractStreetDescription}">
                  <svg width="100%" height="100%" viewBox="0 0 300 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <line x1="20" y1="40" x2="280" y2="40" stroke="#CADBC9" stroke-width="4" stroke-linecap="round"/>
                    <line x1="20" y1="80" x2="280" y2="80" stroke="#CADBC9" stroke-width="4" stroke-linecap="round"/>
                    <line x1="80" y1="10" x2="80" y2="110" stroke="#CADBC9" stroke-width="4" stroke-linecap="round"/>
                    <line x1="200" y1="10" x2="200" y2="110" stroke="#CADBC9" stroke-width="4" stroke-linecap="round"/>
                    <circle cx="200" cy="40" r="8" fill="#2F6F64" />
                    <circle cx="200" cy="40" r="14" stroke="#2F6F64" stroke-width="2" stroke-dasharray="4 2"/>
                  </svg>
                </div>
                <div class="map-place-info">
                  📍 ${(spatialMapEvidence.placeOrRoute as Record<string, string>).name}
                </div>
              </section>
            `
                : ''
            }

            ${
              nowPlan
                ? `
              <section class="card now-card" aria-label="${STRINGS.sections.now}">
                <div>
                  <span class="section-label">${STRINGS.sections.now}</span>
                  <span class="card-badge">${STRINGS.header.simulatedBadge}</span>
                  <h2 class="now-title" id="now-title">${nowPlan.headline}</h2>
                </div>

                ${
                  isRainScene
                    ? `
                  <div class="rain-banner" role="status">
                    🌧️ ${STRINGS.rain.whatChanged}
                  </div>
                  <div class="checklist-container" aria-label="Recommended Checklist">
                    <span class="checklist-chip" id="chip-umbrella">
                      ☔ ${STRINGS.rain.umbrellaChip}
                    </span>
                  </div>
                `
                    : ''
                }

                ${
                  nowPlan.optionsOrSteps && nowPlan.optionsOrSteps.length > 0
                    ? `
                  <div class="options-grid" aria-label="Available Options">
                    ${nowPlan.optionsOrSteps
                      .map(opt => {
                        const label = typeof opt === 'string' ? opt : opt.label;
                        const meta = typeof opt === 'object' && opt && 'distanceMinutes' in opt ? `${(opt as unknown as { distanceMinutes: number }).distanceMinutes}m away` : '';
                        return `
                        <div class="option-tile">
                          <span class="option-label">${label}</span>
                          ${meta ? `<span class="option-meta">${meta}</span>` : ''}
                        </div>
                      `;
                      })
                      .join('')}
                  </div>
                `
                    : ''
                }

                <div class="now-basis">
                  <p>${nowPlan.why.derivation}</p>
                </div>

                <div class="action-row" aria-label="Plan Actions">
                  <button type="button" class="btn btn-primary" disabled aria-disabled="true" title="${STRINGS.actions.comingSoon}">
                    ${STRINGS.actions.accept}
                  </button>
                  <button type="button" class="btn btn-outline" disabled aria-disabled="true" title="${STRINGS.actions.comingSoon}">
                    ${STRINGS.actions.adjust}
                  </button>
                  <button type="button" class="btn btn-outline" disabled aria-disabled="true" title="${STRINGS.actions.comingSoon}">
                    ${STRINGS.actions.dismiss}
                  </button>
                  <span class="btn-hint">${STRINGS.actions.comingSoon}</span>
                </div>
              </section>
            `
                : `
              <section class="card quiet-card" aria-label="Quiet State">
                <div class="quiet-icon" aria-hidden="true">☀️</div>
                <h2 class="quiet-title">${STRINGS.quietState.title}</h2>
                <p class="quiet-subtitle">${STRINGS.quietState.subtitle}</p>
              </section>
            `
            }
          </div>

          <!-- Secondary Grid: AHEAD & FOR YOU -->
          <div class="secondary-grid">
            <section aria-label="${STRINGS.sections.ahead}">
              <h2 class="section-label">${STRINGS.sections.ahead}</h2>
              <div class="ahead-list">
                ${
                  living.ahead.length > 0
                    ? living.ahead
                        .map(
                          item => `
                  <div class="item-row">
                    <div>
                      <div class="item-title">${item.headline}</div>
                      <div class="item-subtitle">${item.why.derivation}</div>
                    </div>
                    <span class="card-badge">${STRINGS.header.simulatedBadge}</span>
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

            <section aria-label="${STRINGS.sections.forYou}">
              <h2 class="section-label">${STRINGS.sections.forYou}</h2>
              <div class="for-you-list">
                ${
                  living.forYou.length > 0
                    ? living.forYou
                        .map(
                          fact => `
                  <div class="item-row">
                    <div>
                      <div class="item-title">Memory Proposal: ${fact.key}</div>
                      <div class="item-subtitle">Status: ${fact.status} · ${String(fact.value)}</div>
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
            <span class="tab-icon" aria-hidden="true">☀️</span>
            <span>${STRINGS.tabs.today}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${STRINGS.tabs.comingSoonBadge}">
            <span class="tab-icon" aria-hidden="true">🧭</span>
            <span>${STRINGS.tabs.explore}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${STRINGS.tabs.comingSoonBadge}">
            <span class="tab-icon" aria-hidden="true">💬</span>
            <span>${STRINGS.tabs.ask}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="${STRINGS.tabs.comingSoonBadge}">
            <span class="tab-icon" aria-hidden="true">👤</span>
            <span>${STRINGS.tabs.me}</span>
          </button>
        </nav>
      </div>
    `;

    // Bind event listeners
    const selectEl = root.querySelector('#scene-select') as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.addEventListener('change', e => {
        currentScene = (e.target as HTMLSelectElement).value as DemoSceneId;
        update();
      });
    }

    const exportBtn = root.querySelector('#btn-export-storage') as HTMLButtonElement | null;
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        alert('Exporting raw corrupted storage payload...');
      });
    }

    const resetBtn = root.querySelector('#btn-reset-storage') as HTMLButtonElement | null;
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        currentScene = 'clear';
        update();
      });
    }
  }

  update();
}
