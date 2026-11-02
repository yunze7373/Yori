import { describe, it, expect } from 'vitest';
import { renderDesktopLeftNav, SIDEBAR_NAV_ITEMS } from './desktop-nav.js';

describe('Desktop Left Navigation Sidebar (S4-DESKTOP-IA)', () => {
  it('renders all required sidebar items with wordmark', () => {
    const html = renderDesktopLeftNav('home');
    expect(html).toContain('desktop-left-nav');
    expect(html).toContain('Yori');
    expect(html).toContain('desktop-nav-home');
    expect(html).toContain('desktop-nav-plans');
    expect(html).toContain('desktop-nav-for-you');
    expect(html).toContain('desktop-nav-connectors');
    expect(html).toContain('desktop-nav-me');
    expect(html).toContain('desktop-nav-settings');
  });

  it('marks active tab with active class and aria-current=page', () => {
    const homeHtml = renderDesktopLeftNav('home');
    expect(homeHtml).toMatch(/class="[^"]*active[^"]*"[^>]*id="desktop-nav-home"/);
    expect(homeHtml).toMatch(/id="desktop-nav-home"[^>]*aria-current="page"/);

    const plansHtml = renderDesktopLeftNav('plans');
    expect(plansHtml).toMatch(/class="[^"]*active[^"]*"[^>]*id="desktop-nav-plans"/);
    expect(plansHtml).toMatch(/id="desktop-nav-plans"[^>]*aria-current="page"/);

    const connectorsHtml = renderDesktopLeftNav('home', true);
    expect(connectorsHtml).toMatch(/class="[^"]*active[^"]*"[^>]*id="desktop-nav-connectors"/);
    expect(connectorsHtml).toMatch(/id="desktop-nav-connectors"[^>]*aria-current="page"/);
  });

  it('marks settings active when connectors view is opened via settings', () => {
    const settingsHtml = renderDesktopLeftNav('home', true, false, 'desktop-nav-settings');
    expect(settingsHtml).toMatch(/class="[^"]*active[^"]*"[^>]*id="desktop-nav-settings"/);
    expect(settingsHtml).toMatch(/id="desktop-nav-settings"[^>]*aria-current="page"/);
    expect(settingsHtml).not.toMatch(/class="[^"]*active[^"]*"[^>]*id="desktop-nav-connectors"/);
  });

  it('provides accessible labels and icons for all items', () => {
    for (const item of SIDEBAR_NAV_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.iconSvg).toContain('<svg');
    }
  });
});
