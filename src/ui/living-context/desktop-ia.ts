/**
 * Desktop Information Architecture (S4-DESKTOP-IA)
 * Governed by TID: INBOX-20261031-CD2FF4 and REV3_LIVE_ROADMAP.plan.md §Slice S4.
 *
 * Provides:
 * 1. Breakpoint-to-shell mapping (≥1024px: 3 zones, 768-1023px: 2 zones, <768px: 1 zone).
 * 2. Card kind classification and panel-selection reducer.
 * 3. Enforces strict panel coherence: travel → route panel, lunch → places panel.
 * 4. Aria live polite announcements for keyboard and selection changes.
 */

export type ShellBreakpoint = 'desktop' | 'tablet' | 'mobile';

export interface BreakpointConfig {
  readonly minWidth: number;
  readonly maxWidth?: number;
  readonly shell: ShellBreakpoint;
  readonly zones: 1 | 2 | 3;
}

export const BREAKPOINT_CONFIGS: readonly BreakpointConfig[] = [
  { minWidth: 1024, shell: 'desktop', zones: 3 },
  { minWidth: 768, maxWidth: 1023, shell: 'tablet', zones: 2 },
  { minWidth: 0, maxWidth: 767, shell: 'mobile', zones: 1 },
];

export function resolveShellBreakpoint(width: number): ShellBreakpoint {
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

export type CardKind = 'travel' | 'lunch' | 'quiet' | 'generic';
export type PanelKind = 'route' | 'places' | 'quiet' | 'none';

export interface CardSelectionState {
  readonly selectedId: string;
  readonly cardKind: CardKind;
  readonly planId?: string;
  readonly candidateId?: string;
  readonly label?: string;
}

export interface DesktopPanelState {
  readonly activePanel: PanelKind;
  readonly selectedId: string;
  readonly ariaAnnouncement: string;
}

export function determineCardKind(plan: { intentId?: string; layoutKind?: string } | null | undefined): CardKind {
  if (!plan) return 'quiet';
  const intent = plan.intentId?.toLowerCase();
  const layout = plan.layoutKind?.toLowerCase();
  if (intent === 'depart' || intent === 'fuel' || intent === 'trip' || layout === 'journey') {
    return 'travel';
  }
  if (intent === 'lunch' || intent === 'places' || layout === 'candidates') {
    return 'lunch';
  }
  if (layout === 'quiet' || intent === 'quiet') {
    return 'quiet';
  }
  return 'generic';
}

export function createInitialPanelState(defaultCard?: CardSelectionState): DesktopPanelState {
  if (!defaultCard) {
    return {
      activePanel: 'none',
      selectedId: '',
      ariaAnnouncement: '',
    };
  }
  return panelSelectionReducer(
    { activePanel: 'none', selectedId: '', ariaAnnouncement: '' },
    { type: 'SELECT_CARD', card: defaultCard }
  );
}

export function panelSelectionReducer(
  _current: DesktopPanelState,
  action: { type: 'SELECT_CARD'; card: CardSelectionState } | { type: 'RESET_DEFAULT'; defaultCard: CardSelectionState }
): DesktopPanelState {
  const card = action.type === 'SELECT_CARD' ? action.card : action.defaultCard;
  let panelKind: PanelKind;
  let announcement = '';

  switch (card.cardKind) {
    case 'travel':
      panelKind = 'route';
      announcement = `Selected ${card.label || 'travel plan'}. Showing route and destination details.`;
      break;
    case 'lunch':
      panelKind = 'places';
      announcement = `Selected ${card.label || 'lunch options'}. Showing nearby places and walking times.`;
      break;
    case 'quiet':
      panelKind = 'quiet';
      announcement = `Selected quiet state. No immediate travel or dining actions needed.`;
      break;
    default:
      panelKind = 'none';
      announcement = `Selected ${card.label || 'item'}.`;
      break;
  }

  // Ensure strict coherence: travel never shows places, lunch never shows route
  if (card.cardKind === 'travel' && panelKind === 'places') {
    panelKind = 'route';
  }
  if (card.cardKind === 'lunch' && panelKind === 'route') {
    panelKind = 'places';
  }

  return {
    activePanel: panelKind,
    selectedId: card.selectedId,
    ariaAnnouncement: announcement,
  };
}
