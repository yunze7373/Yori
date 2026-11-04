/**
 * V2 Expanded Detail Views & Secondary Tab Views (LIVING_CONTEXT_V2.md §8 D1/D2/D4)
 *
 * Implements:
 * - TripDetail: mode tabs (drive/bus), large schematic map, current plan row, "Why this plan?".
 * - RestaurantDetail: local labelled SVG illustration, attribute chips, Save button,
 *   in-app schematic walking directions (strictly no external maps/URLs).
 * - PlansView: AHEAD list for the functional Plans bottom nav tab.
 * - ForYouView: Proposals & insights for the functional For You bottom nav tab.
 * - Data honesty: Fixture values only (no stars, review counts, or road forgeries).
 */

import { escapeHtml, formatTime } from './presentation.js';
import { STRINGS } from './strings.js';
import type {
  TripDetailVM,
  RestaurantDetailVM,
  ProposalItemVM,
} from '../view-models/index.js';
import { renderMapCard } from './v2-home-view.js';
import type { PreparedPlan } from '../../core/contracts/index.js';

/**
 * Render Trip Detail View (Rain / Departure Step-2)
 */
export function renderTripDetail(vm: TripDetailVM): string {
  const planId = vm.planId;
  const isLive = Boolean((vm as any).isLive);

  return `
    <div class="v2-detail-view v2-trip-detail" data-plan-id="${escapeHtml(planId)}" data-provenance="${isLive ? 'live' : 'fixture'}">
      <div class="v2-detail-top-nav">
        <button type="button" class="v2-back-btn" id="trip-detail-back-btn" aria-label="Back to home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back</span>
        </button>
        <span class="v2-detail-badge">${isLive ? 'Live' : escapeHtml(STRINGS.header.simulatedBadge)}</span>
      </div>

      <header class="v2-detail-header">
        <h1 class="v2-detail-title">${escapeHtml(vm.title)}</h1>
        <div class="v2-detail-headline">${escapeHtml(vm.headline)}</div>
      </header>

      <!-- Travel Mode Tabs (Drive & Bus only unless fixture exists) -->
      ${
        vm.modeTabs.length > 0
          ? `
        <div class="v2-options-grid v2-mode-tabs" role="tablist" aria-label="Available Modes">
          ${vm.modeTabs
            .map(
              tab => {
                const optTitleRef = tab.fieldSourceRefs?.leaveTime
                  ? `${escapeHtml(tab.fieldSourceRefs.leaveTime.recordId)}.${escapeHtml(tab.fieldSourceRefs.leaveTime.field)}`
                  : tab.sourceRef
                    ? `${escapeHtml(tab.sourceRef.recordId)}.${escapeHtml(tab.sourceRef.field)}`
                    : '';
                const optMetaRef = tab.fieldSourceRefs?.travelMinutes
                  ? `${escapeHtml(tab.fieldSourceRefs.travelMinutes.recordId)}.${escapeHtml(tab.fieldSourceRefs.travelMinutes.field)}`
                  : '';
                const optBasisRef = tab.fieldSourceRefs?.rankingBasis
                  ? `${escapeHtml(tab.fieldSourceRefs.rankingBasis.recordId)}.${escapeHtml(tab.fieldSourceRefs.rankingBasis.field)}`
                  : '';
                const optLateRef = tab.fieldSourceRefs?.lateMinutes
                  ? `${escapeHtml(tab.fieldSourceRefs.lateMinutes.recordId)}.${escapeHtml(tab.fieldSourceRefs.lateMinutes.field)}`
                  : '';

                const metaText = tab.meta || tab.detail || (tab.durationMinutes ? `${tab.durationMinutes} min ${tab.mode} + 5m margin` : '');
                let detailHtml = '';
                if (metaText) {
                  if (metaText.includes('late by')) {
                    const splitIdx = metaText.indexOf(' · ');
                    const travelPart = splitIdx >= 0 ? metaText.slice(0, splitIdx) : metaText;
                    const latePart = splitIdx >= 0 ? metaText.slice(splitIdx + 3) : '';
                    detailHtml = `<div class="v2-tab-times v2-option-meta"><span ${optMetaRef ? `data-source-ref="${optMetaRef}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option travel meta"`}>${escapeHtml(travelPart)}</span><span data-slot="chrome" data-slot-reason="Option late connector"> · </span><span ${optLateRef ? `data-source-ref="${optLateRef}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option late meta"`}>${escapeHtml(latePart)}</span></div>`;
                  } else {
                    detailHtml = `<div class="v2-tab-times v2-option-meta"${optMetaRef ? ` data-source-ref="${optMetaRef}" data-slot="domain"` : ` data-slot="chrome" data-slot-reason="Option travel meta"`}>${escapeHtml(metaText)}</div>`;
                  }
                }

                const badgeText = tab.badge || (tab.mode === 'drive' ? 'Recommended' : 'Alternative');
                const basisText = tab.rankingBasis || (tab.mode === 'drive' ? (isLive ? 'Ranked by habit: Rain travel habit' : 'Ranked by habit: Rain travel habit (Demo profile · sample)') : '');
                const modeCap = tab.mode ? (tab.mode.charAt(0).toUpperCase() + tab.mode.slice(1)) : 'Option';
                const labelText = tab.leaveTime ? `${modeCap} · leave ${tab.leaveTime}` : tab.label;

                return `
            <button
              type="button"
              role="tab"
              class="v2-mode-tab v2-option-card ${tab.isSelected ? 'selected' : ''}"
              id="${escapeHtml(tab.id)}"
              data-mode="${escapeHtml(tab.mode)}"
              aria-selected="${tab.isSelected}"
            >
              <div class="v2-option-top">
                <span class="v2-tab-label v2-option-label" ${optTitleRef ? `data-source-ref="${optTitleRef}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option mode label"`}>${escapeHtml(labelText)}</span>
                ${badgeText ? `<span class="v2-option-badge ${badgeText.toLowerCase()}" data-slot="chrome" data-slot-reason="Option recommendation badge">${escapeHtml(badgeText)}</span>` : ''}
              </div>
              <div class="v2-tab-duration" data-slot="chrome" data-slot-reason="Option duration label">${escapeHtml(tab.label)}</div>
              ${detailHtml}
              ${basisText ? `<div class="v2-option-basis" ${optBasisRef ? `data-source-ref="${optBasisRef}" data-slot="domain"` : `data-slot="chrome" data-slot-reason="Option ranking basis"`}>${escapeHtml(basisText)}</div>` : ''}
            </button>
          `;
              }
            )
            .join('')}
        </div>
      `
          : ''
      }

      <!-- Current / Recommended Timing Card -->
      <section class="card v2-trip-summary-card" aria-label="Timing Details">
        <div class="v2-trip-summary-times">
          <div class="v2-time-col">
            <span class="v2-time-label">Leave by</span>
            <strong class="v2-time-value" id="trip-leave-time">${escapeHtml(vm.leaveTime)}</strong>
          </div>
          <div class="v2-time-divider" aria-hidden="true">→</div>
          <div class="v2-time-col">
            <span class="v2-time-label">Arrive at</span>
            <strong class="v2-time-value" id="trip-arrive-time">${escapeHtml(vm.arriveTime)}</strong>
          </div>
        </div>

        <div class="v2-trip-badges">
          <span class="v2-buffer-pill">${escapeHtml(vm.bufferText)}</span>
          ${vm.prepText ? `<span class="v2-prep-pill">${escapeHtml(vm.prepText)}</span>` : ''}
        </div>

        <!-- Timeline Steps if available -->
        ${
          vm.steps && vm.steps.length > 0
            ? `
          <div class="v2-timeline v2-trip-steps" aria-label="Trip Milestones">
            <div class="v2-timeline-track"></div>
            ${vm.steps
              .map(
                step => `
              <div class="v2-timeline-step v2-trip-step ${step.isPrimary ? 'primary' : ''} ${step.isEvent ? 'event' : ''}">
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
      </section>

      <!-- Prominent Labelled Schematic Route Map -->
      ${vm.map ? renderMapCard(vm.map, { isLive }) : ''}

      <!-- "Why this plan?" Provenance Section -->
      <section class="card v2-why-plan-card" aria-label="Why this plan?">
        <h2 class="v2-section-heading">Why this plan?</h2>
        ${
          vm.whyDerivation
            ? `<p class="v2-why-derivation">${escapeHtml(vm.whyDerivation)}</p>`
            : ''
        }

        ${
          vm.whyHabits.length > 0
            ? `
          <div class="habit-note" data-source-ref="rain_transport_preference.habitNote" data-slot="domain">You usually prefer driving when it rains.</div>
          <div class="v2-habits-provenance-list">
            ${vm.whyHabits
              .map(
                habit => `
              <div class="v2-habit-row">
                <div class="v2-habit-info">
                  <span class="v2-habit-name">${escapeHtml(habit.label)}</span>
                  <span class="v2-habit-val">${escapeHtml(habit.value)}</span>
                </div>
                <span class="v2-provenance-chip ${habit.isConfirmed ? 'confirmed' : 'sample'}">
                  ${escapeHtml(habit.provenanceText)}
                </span>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }
      </section>

      <!-- Action Row -->
      <div class="action-row v2-detail-actions" aria-label="Plan Actions">
        ${
          vm.isAccepted
            ? `
          <span class="badge-accepted">${escapeHtml(STRINGS.actions.accepted)}</span>
          <button type="button" class="btn btn-outline" id="btn-undo-accept" data-plan-id="${escapeHtml(planId)}">
            ${escapeHtml(STRINGS.actions.undo)}
          </button>
        `
            : `
          <button type="button" class="btn btn-primary" id="btn-accept" data-plan-id="${escapeHtml(planId)}">
            ${escapeHtml(STRINGS.actions.accept)}
          </button>
        `
        }
        <button type="button" class="btn btn-secondary" id="btn-adjust" data-plan-id="${escapeHtml(planId)}">
          ${escapeHtml(STRINGS.actions.adjust)}
        </button>
      </div>
    </div>
  `;
}

/**
 * Render Restaurant Detail View (Lunch Candidate Step-2)
 */
export function renderRestaurantDetail(vm: RestaurantDetailVM): string {
  const isLive = Boolean((vm as any).isLive);

  return `
    <div class="v2-detail-view v2-restaurant-detail" data-candidate-id="${escapeHtml(vm.id)}" data-provenance="${isLive ? 'live' : 'fixture'}">
      <div class="v2-detail-top-nav">
        <button type="button" class="v2-back-btn" id="restaurant-detail-back-btn" aria-label="Back to home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back</span>
        </button>
        <span class="v2-detail-badge">${isLive ? 'Live' : escapeHtml(STRINGS.header.simulatedBadge)}</span>
      </div>

      ${
        vm.placePhoto
          ? `<!-- The place's own Google photo (keyless URI resolved on the server), credited -->
      <figure class="v2-restaurant-hero-photo" data-attribution="google">
        <img src="${escapeHtml(vm.placePhoto.uri)}" alt="Photo of ${escapeHtml(vm.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <figcaption class="qp-photo-credit">Photo: ${vm.placePhoto.authorAttributions
          .map(a =>
            a.uri
              ? `<a href="${escapeHtml(a.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.displayName)}</a>`
              : escapeHtml(a.displayName)
          )
          .join(', ')}</figcaption>
      </figure>`
          : `<!-- Local Labelled SVG Illustration (Zero Remote URLs) -->
      <div class="v2-restaurant-hero-art" role="img" aria-label="${escapeHtml(vm.photo.altText)}">
        ${vm.photo.svgMarkup}
        ${isLive ? '' : `<span class="v2-illustration-badge">${escapeHtml(vm.photo.simulatedBadge)}</span>`}
      </div>`
      }

      <header class="v2-detail-header">
        <h1 class="v2-detail-title" id="restaurant-detail-name">${escapeHtml(vm.name)}</h1>
        <div class="v2-attribute-chips" aria-label="Attributes">
          ${vm.attributeChips
            .map(chip => `<span class="v2-attr-chip">${escapeHtml(chip)}</span>`)
            .join('')}
        </div>
        <div class="mock-places-notice">${escapeHtml(vm.simulatedNotice)}</div>
      </header>

      <!-- Taste Preference Basis -->
      <div class="card v2-basis-card">
        <div class="v2-basis-text">${escapeHtml(vm.basis)}</div>
      </div>

      <!-- Primary Action Buttons: Save (UI state only) and Directions (in-app only) -->
      <div class="v2-restaurant-actions">
        <button
          type="button"
          class="btn ${vm.isSaved ? 'btn-saved' : 'btn-outline'} v2-save-btn"
          id="btn-restaurant-save"
          data-candidate-id="${escapeHtml(vm.id)}"
          aria-pressed="${vm.isSaved}"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${vm.isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right: 6px;">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>${vm.isSaved ? 'Saved' : 'Save'}</span>
        </button>

        <button
          type="button"
          class="btn btn-primary v2-directions-btn"
          id="btn-restaurant-directions"
          data-candidate-id="${escapeHtml(vm.id)}"
          aria-expanded="false"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right: 6px;">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
          <span>Directions</span>
        </button>
      </div>

      <!-- In-App Schematic Walking Route Panel (Never External Maps) -->
      <section class="card v2-directions-panel" id="restaurant-directions-panel" aria-label="Walking Directions" style="display: none;">
        <div class="v2-panel-header">
          <h2 class="v2-section-heading">Walking Directions</h2>
          <span class="v2-in-app-badge">${isLive ? 'In-app route' : 'In-app route · simulated'}</span>
        </div>
        <p class="v2-directions-intro">Schematic route to ${escapeHtml(vm.name)}${vm.distanceText ? ` (${escapeHtml(vm.distanceText)})` : ''}:</p>
        <ol class="v2-directions-list">
          ${vm.directions
            .map(
              (step, idx) => `
            <li class="v2-direction-item ${step.isFinal ? 'final' : ''}">
              <span class="v2-step-number">${idx + 1}</span>
              <div class="v2-step-instruction">
                <span>${escapeHtml(step.instruction)}</span>
                ${
                  step.durationText
                    ? `<span class="v2-step-dur">${escapeHtml(step.durationText)}</span>`
                    : ''
                }
              </div>
            </li>
          `
            )
            .join('')}
        </ol>
      </section>

      <!-- Compact Location Schematic Map -->
      ${vm.map ? renderMapCard(vm.map, { isLive }) : ''}
    </div>
  `;
}

/**
 * Render Plans View (Bottom Navigation 'Plans' Tab = AHEAD List)
 */
export function renderPlansView(aheadPlans: readonly PreparedPlan[]): string {
  return `
    <div class="v2-plans-view" aria-label="Upcoming Plans">
      <header class="v2-view-header">
        <h1 class="v2-view-title">Upcoming Plans</h1>
        <p class="v2-view-subtitle">What's scheduled and prepared ahead for your day.</p>
      </header>

      ${
        aheadPlans.length === 0
          ? `
        <div class="card v2-empty-plans" data-provenance="none">
          <p>No upcoming plans scheduled right now. Yori coordinates with your day as plans are confirmed.</p>
        </div>
      `
          : `
        <div class="v2-plans-list">
          ${aheadPlans
            .map(
              plan => `
            <div class="card v2-plan-item-card" data-plan-id="${escapeHtml(plan.id)}" data-provenance="${(plan as any).provenance === 'live' ? 'live' : 'fixture'}">
              <div class="v2-plan-item-header">
                ${(plan as any).provenance === 'live' ? '<span class="card-badge live-badge" data-provenance="live">Live</span>' : `<span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>`}
                <h2 class="v2-plan-headline">${escapeHtml(plan.headline)}</h2>
              </div>
              ${
                plan.subjectTitle
                  ? `<div class="v2-plan-subject">${escapeHtml(plan.subjectTitle)}</div>`
                  : ''
              }
              ${
                plan.apptAt
                  ? `<div class="v2-plan-time">Scheduled: <strong>${escapeHtml(formatTime(plan.apptAt, plan.timezone))}</strong></div>`
                  : ''
              }
              ${
                plan.checklist && plan.checklist.length > 0
                  ? `<div class="v2-plan-checklist">Checklist: ${escapeHtml(plan.checklist.join(', '))}</div>`
                  : ''
              }
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
  `;
}

/**
 * Render For You View (Bottom Navigation 'For You' Tab = Proposals & Insights)
 */
export function renderForYouView(proposals: readonly ProposalItemVM[]): string {
  return `
    <div class="v2-for-you-view" aria-label="For You Proposals">
      <header class="v2-view-header">
        <h1 class="v2-view-title">For You</h1>
        <p class="v2-view-subtitle">Proposals and routine insights waiting for your feedback.</p>
      </header>

      ${
        proposals.length === 0
          ? `
        <div class="card v2-empty-proposals" data-provenance="none">
          <p>No pending proposals waiting right now. Yori learns routines calmly as you use the app.</p>
        </div>
      `
          : `
        <div class="v2-for-you-list">
          ${proposals
            .map(
              prop => `
            <div class="card v2-proposal-item-card" data-proposal-key="${escapeHtml(prop.key)}" data-provenance="${prop.provenance || (prop.basis?.includes('Confirmed') ? 'user' : 'fixture')}">
              <div class="v2-proposal-header">
                <span class="card-badge">PROPOSAL</span>
                <h2 class="v2-proposal-title">${escapeHtml(prop.title)}</h2>
              </div>
              ${
                prop.basis
                  ? `<p class="v2-proposal-basis">${escapeHtml(prop.basis)}</p>`
                  : ''
              }
              <div class="v2-proposal-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-confirm-proposal"
                  data-key="${escapeHtml(prop.key)}"
                >
                  ${escapeHtml(STRINGS.actions.confirm)}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-reject-proposal"
                  data-key="${escapeHtml(prop.key)}"
                >
                  ${escapeHtml(STRINGS.actions.notTrue)}
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
  `;
}
