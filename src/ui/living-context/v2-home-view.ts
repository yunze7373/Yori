/**
 * V2 Scene-Driven Home View Component (LIVING_CONTEXT_V2.md §4)
 *
 * Implements:
 * - Information-value driven layout (Journey vs Candidates vs Quiet).
 * - Prominent route map for travel/rain; compact map for lunch candidates.
 * - Local labelled SVG illustrations for candidate cards.
 * - Departure timeline with steps and arrival buffers.
 * - Collapsed empty blocks (no empty fixed NOW/AHEAD/FOR YOU placeholders).
 * - Full button and event compatibility with existing review loops.
 */

import { escapeHtml } from './presentation.js';
import { STRINGS } from './strings.js';
import type { HomeCompositionVM, MapVM } from '../view-models/index.js';

function renderMapSvg(map: MapVM): string {
  const isProminent = map.sizeHint === 'prominent';
  const viewBoxHeight = isProminent ? 180 : 130;

  return `
    <div class="v2-map-canvas ${map.sizeHint}" role="img" aria-label="${escapeHtml(map.ariaDescription)}">
      <svg width="100%" height="100%" viewBox="0 0 340 ${viewBoxHeight}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="100%" height="100%" fill="#E9F1E8" rx="14"/>

        <!-- Abstract schematic street grid (simulated, no fake roads) -->
        <line x1="20" y1="45" x2="320" y2="45" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
        <line x1="20" y1="115" x2="320" y2="115" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
        ${
          isProminent
            ? `<line x1="20" y1="155" x2="320" y2="155" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>`
            : ''
        }
        <line x1="90" y1="15" x2="90" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
        <line x1="210" y1="15" x2="210" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
        <line x1="275" y1="15" x2="275" y2="${viewBoxHeight - 15}" stroke="#CADBC9" stroke-width="5" stroke-linecap="round"/>

        <!-- Route Polylines -->
        ${map.polylines
          .map(
            poly => `
          <polyline
            points="${poly.points}"
            stroke="${poly.strokeColor}"
            stroke-width="${poly.strokeWidth}"
            stroke-linecap="round"
            stroke-linejoin="round"
            ${poly.strokeDasharray ? `stroke-dasharray="${poly.strokeDasharray}"` : ''}
          />
        `
          )
          .join('')}

        <!-- Weather Callout on Map if rain is present -->
        ${
          map.weatherCallout
            ? `
          <g transform="translate(${map.weatherCallout.x - 55}, ${map.weatherCallout.y - 18})">
            <rect width="110" height="34" rx="8" fill="#1C382F" opacity="0.9"/>
            <text x="55" y="14" fill="#FFFFFF" font-size="10" font-weight="700" text-anchor="middle" font-family="sans-serif">
              ${escapeHtml(map.weatherCallout.text)}
            </text>
            <text x="55" y="27" fill="#E2EAE5" font-size="8" text-anchor="middle" font-family="sans-serif">
              ${escapeHtml(map.weatherCallout.subtext || '')}
            </text>
          </g>
        `
            : ''
        }

        <!-- Markers -->
        ${map.markers
          .map(m => {
            if (m.type === 'origin') {
              return `
                <g class="v2-map-marker origin" transform="translate(${m.x}, ${m.y})">
                  <circle cx="0" cy="0" r="6" fill="#16382F"/>
                  <circle cx="0" cy="0" r="10" stroke="#16382F" stroke-width="1.5" opacity="0.4"/>
                  <text x="0" y="18" fill="#16382F" font-size="10" font-weight="700" text-anchor="middle" font-family="sans-serif">
                    ${escapeHtml(m.label)}
                  </text>
                </g>
              `;
            }
            if (m.type === 'destination') {
              return `
                <g class="v2-map-marker destination" transform="translate(${m.x}, ${m.y})">
                  <circle cx="0" cy="0" r="8" fill="#2D6A4F"/>
                  <circle cx="0" cy="0" r="14" stroke="#2D6A4F" stroke-width="2" stroke-dasharray="4 2"/>
                  <text x="0" y="-12" fill="#16382F" font-size="10" font-weight="700" text-anchor="middle" font-family="sans-serif">
                    ${escapeHtml(m.label)}
                  </text>
                </g>
              `;
            }
            // Candidate place marker
            return `
              <g class="v2-map-marker place ${m.isHighlight ? 'highlight' : ''}" transform="translate(${m.x}, ${m.y})">
                <circle cx="0" cy="0" r="${m.isHighlight ? 7 : 5}" fill="${m.isHighlight ? '#2D6A4F' : '#5B6B65'}"/>
                ${m.isHighlight ? '<circle cx="0" cy="0" r="11" stroke="#2D6A4F" stroke-width="1.5" opacity="0.5"/>' : ''}
                <text x="0" y="${m.y < 70 ? -10 : 16}" fill="#16382F" font-size="9" font-weight="${m.isHighlight ? '700' : '500'}" text-anchor="middle" font-family="sans-serif">
                  ${escapeHtml(m.label)}
                </text>
              </g>
            `;
          })
          .join('')}
      </svg>
    </div>
  `;
}

function renderMapCard(map: MapVM): string {
  return `
    <section class="card v2-map-card ${map.sizeHint}" aria-label="${escapeHtml(map.label)}">
      <div class="map-header">
        <span class="section-label">${escapeHtml(map.label)}</span>
        <span class="card-badge">${escapeHtml(map.simulatedBadge)}</span>
      </div>
      ${renderMapSvg(map)}
      <div class="map-place-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        ${escapeHtml(map.destinationName)}
      </div>
    </section>
  `;
}

function renderActionRow(vm: HomeCompositionVM): string {
  const planId = vm.planId || '';
  if (vm.isAccepted) {
    return `
      <div class="action-row" aria-label="Plan Actions">
        <span class="badge-accepted">${escapeHtml(STRINGS.actions.accepted)}</span>
        <button type="button" class="btn btn-outline" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}">
          ${escapeHtml(STRINGS.actions.undo)}
        </button>
        <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(planId)}">
          ${escapeHtml(STRINGS.actions.why)}
        </button>
      </div>
    `;
  }
  return `
    <div class="action-row" aria-label="Plan Actions">
      <button type="button" class="btn btn-primary" id="btn-accept" data-plan-id="${escapeHtml(planId)}">
        ${escapeHtml(STRINGS.actions.accept)}
      </button>
      <button type="button" class="btn btn-outline" id="btn-adjust" data-plan-id="${escapeHtml(planId)}">
        ${escapeHtml(STRINGS.actions.adjust)}
      </button>
      <button type="button" class="btn btn-outline" id="btn-dismiss" data-plan-id="${escapeHtml(planId)}">
        ${escapeHtml(STRINGS.actions.dismiss)}
      </button>
      <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(planId)}">
        ${escapeHtml(STRINGS.actions.why)}
      </button>
    </div>
  `;
}

export function renderV2Home(vm: HomeCompositionVM): string {
  // 1. Quiet State
  if (vm.layoutKind === 'quiet') {
    return `
      <div class="v2-home-container quiet">
        <section class="card quiet-card" aria-label="Quiet State">
          <div class="quiet-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
            </svg>
          </div>
          <h2 class="quiet-title">${escapeHtml(vm.title)}</h2>
          <p class="quiet-subtitle">${escapeHtml(vm.headline)}</p>
        </section>
      </div>
    `;
  }

  // 2. Journey Layout (Depart / Rain)
  if (vm.layoutKind === 'journey') {
    return `
      <div class="v2-home-container journey">
        <!-- Weather / Insight Alert Banner -->
        ${
          vm.isRain && vm.rainBanner
            ? `
          <div class="v2-insight-banner" role="status">
            <div class="v2-insight-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
                <line x1="8" y1="19" x2="8" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
                <line x1="16" y1="19" x2="16" y2="21"></line>
              </svg>
            </div>
            <div class="v2-insight-body">
              <h2 class="v2-insight-title">${escapeHtml(vm.rainBanner)}</h2>
              <p class="v2-insight-desc">Rain expected around 2:00 PM. I've prepared an updated departure schedule.</p>
              ${
                vm.umbrellaChip
                  ? `
                <div class="checklist-container" aria-label="Recommended Checklist">
                  <span class="checklist-chip" id="chip-umbrella">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    ${escapeHtml(vm.umbrellaChip)}
                  </span>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        `
            : ''
        }

        <!-- Responsive Hero Structure (Prominent Map + NOW Card) -->
        <div class="v2-journey-grid">
          ${vm.map ? renderMapCard(vm.map) : ''}

          <section class="card now-card v2-journey-card" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
            <div class="v2-card-header">
              <span class="section-label">${escapeHtml(STRINGS.sections.now)}</span>
              <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
              <h2 class="now-subject">${escapeHtml(vm.title)}</h2>
              <div class="now-title" id="now-title">${escapeHtml(vm.headline)}</div>
              ${
                vm.umbrellaChip
                  ? `
                <div class="checklist-container" aria-label="Recommended Checklist">
                  <span class="checklist-chip" id="chip-umbrella">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    ${escapeHtml(vm.umbrellaChip)}
                  </span>
                </div>
              `
                  : ''
              }
            </div>

            <!-- Departure Timeline -->
            ${
              vm.timeline
                ? `
              <div class="v2-timeline" aria-label="${escapeHtml(vm.timeline.title)}">
                <div class="v2-timeline-track"></div>
                ${vm.timeline.steps
                  .map(
                    step => `
                  <div class="v2-timeline-step ${step.isPrimary ? 'primary' : ''} ${step.isEvent ? 'event' : ''}">
                    <span class="v2-step-time">${escapeHtml(step.time)}</span>
                    <span class="v2-step-node" aria-hidden="true"></span>
                    <div class="v2-step-content">
                      <strong class="v2-step-label">${escapeHtml(step.label)}</strong>
                      ${step.detail ? `<span class="v2-step-detail">${escapeHtml(step.detail)}</span>` : ''}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : ''
            }

            <!-- Transit Option Cards -->
            ${
              vm.options && vm.options.length > 0
                ? `
              <div class="v2-options-grid" aria-label="Travel Options">
                ${vm.options
                  .map(
                    opt => `
                  <div class="v2-option-card ${opt.isSelected ? 'selected' : ''}">
                    <div class="v2-option-top">
                      <span class="v2-option-label">${escapeHtml(opt.title)}</span>
                      ${opt.badge ? `<span class="v2-option-badge ${opt.isRecommended ? 'recommended' : ''}">${escapeHtml(opt.badge)}</span>` : ''}
                    </div>
                    ${opt.detail ? `<div class="v2-option-meta">${escapeHtml(opt.detail)}</div>` : ''}
                    ${opt.rankingBasis ? `<div class="v2-option-basis">${escapeHtml(opt.rankingBasis)}</div>` : ''}
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : ''
            }

            ${vm.habitNote ? `<div class="habit-note">${escapeHtml(vm.habitNote)}</div>` : ''}

            <div class="now-basis">
              <p>${escapeHtml(vm.basis)}</p>
            </div>

            ${renderActionRow(vm)}
          </section>
        </div>

        ${renderCollapsibleSecondary(vm)}
      </div>
    `;
  }

  // 3. Candidates Layout (Lunch Away)
  return `
    <div class="v2-home-container candidates">
      <section class="card now-card v2-candidates-hero" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(vm.planId || '')}">
        <div class="v2-card-header">
          <span class="section-label">${escapeHtml(STRINGS.sections.now)}</span>
          <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
          <h2 class="now-subject">${escapeHtml(vm.title)}</h2>
          <div class="now-title" id="now-title">${escapeHtml(vm.headline)}</div>
          <div class="mock-places-notice">${escapeHtml(STRINGS.lunch.mockPlacesNotice)}</div>
        </div>

        <!-- Candidate Cards with Local Labelled SVG Illustrations -->
        ${
          vm.candidateCards && vm.candidateCards.length > 0
            ? `
          <div class="v2-candidate-list" aria-label="Lunch Recommendations">
            ${vm.candidateCards
              .map(
                c => `
              <div class="v2-candidate-card ${c.isSelected ? 'selected' : ''}">
                <div class="v2-candidate-art" role="img" aria-label="${escapeHtml(c.photo.altText)}">
                  ${c.photo.svgMarkup}
                  <span class="v2-illustration-badge">${escapeHtml(c.photo.simulatedBadge)}</span>
                </div>
                <div class="v2-candidate-info">
                  <h3 class="v2-candidate-name">${escapeHtml(c.name)}</h3>
                  <div class="v2-candidate-tags">
                    <span class="v2-cuisine-chip">${escapeHtml(c.cuisine)}</span>
                    <span class="v2-distance-chip">${escapeHtml(c.distanceText)}</span>
                  </div>
                  <div class="v2-candidate-basis">${escapeHtml(c.basis)}</div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        <div class="now-basis">
          <p>${escapeHtml(vm.basis)}</p>
        </div>

        ${renderActionRow(vm)}
      </section>

      <!-- Compact Location Map -->
      ${vm.map ? renderMapCard(vm.map) : ''}

      ${renderCollapsibleSecondary(vm)}
    </div>
  `;
}

function renderCollapsibleSecondary(vm: HomeCompositionVM): string {
  // If both are empty, collapse completely! Zero empty placeholder cards!
  if (vm.aheadItems.length === 0 && vm.proposals.length === 0) {
    return '';
  }

  return `
    <div class="secondary-grid v2-secondary">
      ${
        vm.aheadItems.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.ahead)}">
          <h2 class="section-label">${escapeHtml(STRINGS.sections.ahead)}</h2>
          <div class="ahead-list">
            ${vm.aheadItems
              .map(
                item => `
              <div class="card ahead-card" data-ahead-id="${escapeHtml(item.id)}">
                <h3 class="ahead-title">${escapeHtml(item.title)}</h3>
                <p class="ahead-subtitle">${escapeHtml(item.subtitle)}</p>
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `
          : ''
      }

      ${
        vm.proposals.length > 0
          ? `
        <section aria-label="${escapeHtml(STRINGS.sections.forYou)}">
          <h2 class="section-label">${escapeHtml(STRINGS.sections.forYou)}</h2>
          <div class="for-you-list">
            ${vm.proposals
              .map(
                prop => `
              <div class="card proposal-card" data-proposal-key="${escapeHtml(prop.key)}">
                <h3 class="proposal-title">${escapeHtml(prop.title)}</h3>
                ${prop.basis ? `<p class="proposal-basis">${escapeHtml(prop.basis)}</p>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `
          : ''
      }
    </div>
  `;
}
