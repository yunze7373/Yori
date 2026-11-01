import { describe, it, expect } from 'vitest';
import {
  resolveShellBreakpoint,
  determineCardKind,
  panelSelectionReducer,
  createInitialPanelState,
  type CardSelectionState,
} from './desktop-ia.js';

describe('Desktop IA Breakpoint to Shell Mapping (S4-DESKTOP-IA)', () => {
  it('maps viewports < 768px to mobile shell (1 zone)', () => {
    expect(resolveShellBreakpoint(320)).toBe('mobile');
    expect(resolveShellBreakpoint(390)).toBe('mobile'); // standard mobile target
    expect(resolveShellBreakpoint(414)).toBe('mobile');
    expect(resolveShellBreakpoint(767)).toBe('mobile');
  });

  it('maps viewports 768px..1023px to tablet shell (2 zones)', () => {
    expect(resolveShellBreakpoint(768)).toBe('tablet'); // standard tablet breakpoint
    expect(resolveShellBreakpoint(834)).toBe('tablet');
    expect(resolveShellBreakpoint(1023)).toBe('tablet');
  });

  it('maps viewports >= 1024px to desktop shell (3 zones)', () => {
    expect(resolveShellBreakpoint(1024)).toBe('desktop');
    expect(resolveShellBreakpoint(1280)).toBe('desktop'); // standard desktop target
    expect(resolveShellBreakpoint(1440)).toBe('desktop'); // wide desktop target
    expect(resolveShellBreakpoint(1920)).toBe('desktop');
  });
});

describe('Desktop IA Card Kind Classification', () => {
  it('classifies departure, fuel, and trip journey plans as travel', () => {
    expect(determineCardKind({ intentId: 'depart' })).toBe('travel');
    expect(determineCardKind({ intentId: 'fuel' })).toBe('travel');
    expect(determineCardKind({ intentId: 'trip' })).toBe('travel');
    expect(determineCardKind({ layoutKind: 'journey' })).toBe('travel');
  });

  it('classifies lunch and places candidate plans as lunch', () => {
    expect(determineCardKind({ intentId: 'lunch' })).toBe('lunch');
    expect(determineCardKind({ intentId: 'places' })).toBe('lunch');
    expect(determineCardKind({ layoutKind: 'candidates' })).toBe('lunch');
  });

  it('classifies quiet plans or null/undefined as quiet', () => {
    expect(determineCardKind(null)).toBe('quiet');
    expect(determineCardKind(undefined)).toBe('quiet');
    expect(determineCardKind({ intentId: 'quiet' })).toBe('quiet');
    expect(determineCardKind({ layoutKind: 'quiet' })).toBe('quiet');
  });

  it('classifies unknown plans as generic', () => {
    expect(determineCardKind({ intentId: 'calendar_note' })).toBe('generic');
  });
});

describe('Desktop IA Panel Selection Reducer (Strict Coherence)', () => {
  const initial = createInitialPanelState();

  it('selects route panel for travel card with polite announcement', () => {
    const travelCard: CardSelectionState = {
      selectedId: 'plan-depart-1',
      cardKind: 'travel',
      planId: 'plan-depart-1',
      label: 'Commute to Piano Studio',
    };

    const next = panelSelectionReducer(initial, { type: 'SELECT_CARD', card: travelCard });
    expect(next.activePanel).toBe('route');
    expect(next.selectedId).toBe('plan-depart-1');
    expect(next.ariaAnnouncement).toContain('Commute to Piano Studio');
    expect(next.ariaAnnouncement).toContain('Showing route and destination details');
  });

  it('selects places panel for lunch card with polite announcement', () => {
    const lunchCard: CardSelectionState = {
      selectedId: 'plan-lunch-1',
      cardKind: 'lunch',
      planId: 'plan-lunch-1',
      label: 'Downtown Dining',
    };

    const next = panelSelectionReducer(initial, { type: 'SELECT_CARD', card: lunchCard });
    expect(next.activePanel).toBe('places');
    expect(next.selectedId).toBe('plan-lunch-1');
    expect(next.ariaAnnouncement).toContain('Downtown Dining');
    expect(next.ariaAnnouncement).toContain('Showing nearby places and walking times');
  });

  it('selects quiet panel for quiet state', () => {
    const quietCard: CardSelectionState = {
      selectedId: 'quiet-state',
      cardKind: 'quiet',
      label: 'Quiet State',
    };

    const next = panelSelectionReducer(initial, { type: 'SELECT_CARD', card: quietCard });
    expect(next.activePanel).toBe('quiet');
    expect(next.selectedId).toBe('quiet-state');
    expect(next.ariaAnnouncement).toContain('Selected quiet state');
  });

  it('strictly enforces panel coherence (travel never shows places, lunch never shows route)', () => {
    const travelCard: CardSelectionState = {
      selectedId: 'plan-travel',
      cardKind: 'travel',
      label: 'Rain Route',
    };
    const res1 = panelSelectionReducer(initial, { type: 'SELECT_CARD', card: travelCard });
    expect(res1.activePanel).not.toBe('places');
    expect(res1.activePanel).toBe('route');

    const lunchCard: CardSelectionState = {
      selectedId: 'plan-lunch',
      cardKind: 'lunch',
      label: 'Lunch Options',
    };
    const res2 = panelSelectionReducer(initial, { type: 'SELECT_CARD', card: lunchCard });
    expect(res2.activePanel).not.toBe('route');
    expect(res2.activePanel).toBe('places');
  });
});
