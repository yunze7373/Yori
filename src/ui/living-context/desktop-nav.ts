/**
 * Desktop Left Navigation Sidebar Component (S4-DESKTOP-IA)
 * Governed by TID: INBOX-20261031-CD2FF4 and REV3_LIVE_ROADMAP.plan.md §Slice S4.
 *
 * Implements:
 * - Vertical sidebar for desktop (≥1024px) and tablet (768-1023px icon rail).
 * - Items: Yori wordmark, Home, Plans, For You, Connectors, Memories, Settings.
 * - Active state indicator, keyboard arrow navigation, visible focus.
 * - WCAG AA compliant hit targets (>= 44x44px).
 */

import { escapeHtml } from './presentation.js';

export interface NavItemConfig {
  readonly id: string;
  readonly tabId: string;
  readonly label: string;
  readonly iconSvg: string;
}

export const SIDEBAR_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'desktop-nav-home',
    tabId: 'home',
    label: 'Home',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
  },
  {
    id: 'desktop-nav-plans',
    tabId: 'plans',
    label: 'Plans',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  },
  {
    id: 'desktop-nav-for-you',
    tabId: 'for-you',
    label: 'For You',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  },
  {
    id: 'desktop-nav-connectors',
    tabId: 'connectors',
    label: 'Connectors',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>`,
  },
  {
    id: 'desktop-nav-me',
    tabId: 'me',
    label: 'Memories',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  },
  {
    id: 'desktop-nav-settings',
    tabId: 'settings',
    label: 'Settings',
    iconSvg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="sidebar-nav-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  },
];

export function renderDesktopLeftNav(
  activeTab: string,
  isConnectorsActive = false,
  includeWordmarkClass = false,
  activeNavId?: string
): string {
  return `
    <aside class="desktop-left-nav" aria-label="Sidebar Navigation">
      <div class="desktop-left-nav-inner">
        <div class="sidebar-brand">
          <span class="sidebar-brand-wordmark ${includeWordmarkClass ? 'v2-brand-wordmark' : ''}">Yori</span>
        </div>
        <nav class="sidebar-nav-list" role="navigation" aria-label="Main Navigation">
          ${SIDEBAR_NAV_ITEMS.map(item => {
            const isActive = isConnectorsActive
              ? activeNavId === 'desktop-nav-settings'
                ? item.id === 'desktop-nav-settings'
                : item.id === 'desktop-nav-connectors'
              : !isConnectorsActive && (item.tabId === activeTab || (item.tabId === 'home' && activeTab === 'today'));

            return `
            <button
              type="button"
              class="sidebar-nav-item ${isActive ? 'active' : ''}"
              data-tab="${escapeHtml(item.tabId)}"
              id="${escapeHtml(item.id)}"
              aria-current="${isActive ? 'page' : 'false'}"
              aria-label="${escapeHtml(item.label)}"
              title="${escapeHtml(item.label)}"
            >
              ${item.iconSvg}
              <span class="nav-item-label">${escapeHtml(item.label)}</span>
            </button>
          `;
          }).join('')}
        </nav>
      </div>
    </aside>
  `;
}
