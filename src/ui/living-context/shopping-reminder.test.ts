import { describe, it, expect } from 'vitest';
import { parseMemoryStatement } from '../conversation/memory-statements.js';
import { humanizeMemoryKey, humanizeMemoryValue } from '../review/why-sheet.js';
import { renderMeView, type MeViewState } from '../me/me-view.js';
import { renderV2Home } from './v2-home-view.js';
import { buildHomeComposition } from '../view-models/home-vm.js';
import { createMemoryFact, type ContextSnapshot } from '../../core/contracts/index.js';
import { DEMO_SHOPPING_STORE, DEMO_SHOPPING_FACT } from './app.js';

describe('SHOPPING-REMINDER: Shopping list parsing & memory facts', () => {
  it('parses English and Chinese shopping list requests as stated without model calls', () => {
    const s1 = parseMemoryStatement('remind me to buy milk');
    expect(s1).not.toBeNull();
    expect(s1!.key).toBe('shopping_list');
    expect(s1!.value).toEqual(['milk']);

    const s2 = parseMemoryStatement('add eggs to my shopping list');
    expect(s2).not.toBeNull();
    expect(s2!.key).toBe('shopping_list');
    expect(s2!.value).toEqual(['eggs']);

    const s3 = parseMemoryStatement('I need to buy milk, eggs');
    expect(s3).not.toBeNull();
    expect(s3!.key).toBe('shopping_list');
    expect(s3!.value).toEqual(['milk', 'eggs']);

    const s4 = parseMemoryStatement('提醒我买牛奶');
    expect(s4).not.toBeNull();
    expect(s4!.key).toBe('shopping_list');
    expect(s4!.value).toEqual(['牛奶']);
  });

  it('never infers items when no items are stated', () => {
    expect(parseMemoryStatement('remind me to buy')).toBeNull();
    expect(parseMemoryStatement('add to my shopping list')).toBeNull();
    expect(parseMemoryStatement('i need to buy')).toBeNull();
  });

  it('preserves sensitive items without special-case blocking', () => {
    const s = parseMemoryStatement('remind me to buy aspirin');
    expect(s).not.toBeNull();
    expect(s!.value).toEqual(['aspirin']);
  });
});

describe('SHOPPING-REMINDER: Me page presentation & Forget', () => {
  it('displays "Shopping list: milk, eggs" under "What Yori has learned" with a quiet Forget button', () => {
    expect(DEMO_SHOPPING_FACT.key).toBe('shopping_list');
    expect(DEMO_SHOPPING_FACT.value).toEqual(['milk', 'eggs']);
    const fact = DEMO_SHOPPING_FACT;

    const meState: MeViewState = {
      memoryFacts: [fact],
      proposals: [],
      promptBudget: { date: '2026-11-05', count: 1 },
      maxDailyPrompts: 3,
    };

    const html = renderMeView(meState);

    // Key must be "Shopping list"
    expect(humanizeMemoryKey('shopping_list')).toBe('Shopping list');
    expect(html).toContain('Shopping list');

    // Value must be "milk, eggs"
    expect(humanizeMemoryValue('shopping_list', fact.value)).toBe('milk, eggs');
    expect(html).toContain('milk, eggs');

    // Must have Forget button with habit key
    expect(html).toContain('data-key="shopping_list"');
    expect(html).toContain('btn-forget-habit');
    expect(html).toContain('Forget');
  });
});

describe('SHOPPING-REMINDER: Proactive card composition rules', () => {
  const dummySnapshot: ContextSnapshot = {
    id: 'snap-1',
    asOf: '2026-11-05T07:00:00.000Z',
    timezone: 'America/Los_Angeles',
    signals: [],
  };

  it('renders card when list is non-empty and store is known', () => {
    const reminderText = 'Pick up milk, eggs at Maruetsu · 350m · Open now';
    const directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=Maruetsu';
    const homeVM = buildHomeComposition({
      plan: null,
      spatialEvidence: null,
      snapshot: dummySnapshot,
      isLive: true,
      nearbyItems: [
        {
          key: 'shopping_reminder',
          title: reminderText,
          basis: 'From your shopping list',
          value: ['milk', 'eggs'],
          provenance: 'user',
          actions: [
            { id: 'btn-shopping-directions', label: 'Directions', href: directionsUrl, variant: 'outline' },
            { id: 'btn-shopping-got-it', label: 'Got it', variant: 'primary' },
            { id: 'btn-shopping-not-now', label: 'Not now', variant: 'quiet' },
          ],
        },
      ],
      shoppingReminder: {
        text: reminderText,
        storeName: 'Maruetsu',
        distanceLabel: '350m',
        openStatus: 'open',
        directionsUrl,
        items: ['milk', 'eggs'],
        isSimulated: false,
      },
    });

    const html = renderV2Home(homeVM);
    expect(html).toContain('Pick up milk, eggs at Maruetsu · 350m · Open now');
    expect(html).toContain('btn-shopping-directions');
    expect(html).toContain('Directions');
    expect(html).toContain('btn-shopping-got-it');
    expect(html).toContain('Got it');
    expect(html).toContain('btn-shopping-not-now');
    expect(html).toContain('Not now');
    expect(html).toContain('You confirmed');
  });

  it('does NOT render card when shopping list is empty or undefined', () => {
    const homeVM = buildHomeComposition({
      plan: null,
      spatialEvidence: null,
      snapshot: dummySnapshot,
      isLive: true,
      nearbyItems: [],
      shoppingReminder: undefined,
    });

    const html = renderV2Home(homeVM);
    expect(html).not.toContain('card-shopping-now');
    expect(html).not.toContain('btn-shopping-got-it');
  });

  it('renders SIMULATED pill in demo shopping scene with fictional store name', () => {
    const reminderText = `Pick up milk, eggs at ${DEMO_SHOPPING_STORE.name} · 350m · Open now`;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(DEMO_SHOPPING_STORE.name)}`;
    const homeVM = buildHomeComposition({
      plan: null,
      spatialEvidence: null,
      snapshot: dummySnapshot,
      isLive: false,
      nearbyItems: [
        {
          key: 'shopping_reminder',
          title: reminderText,
          basis: 'From your shopping list',
          value: ['milk', 'eggs'],
          provenance: 'fixture',
          actions: [
            { id: 'btn-shopping-directions', label: 'Directions', href: directionsUrl, variant: 'outline' },
            { id: 'btn-shopping-got-it', label: 'Got it', variant: 'primary' },
            { id: 'btn-shopping-not-now', label: 'Not now', variant: 'quiet' },
          ],
        },
      ],
      shoppingReminder: {
        text: reminderText,
        storeName: DEMO_SHOPPING_STORE.name,
        distanceLabel: DEMO_SHOPPING_STORE.straightLineDistanceLabel,
        openStatus: DEMO_SHOPPING_STORE.openingStatus,
        directionsUrl,
        items: ['milk', 'eggs'],
        isSimulated: true,
      },
    });

    const html = renderV2Home(homeVM);
    expect(html).toContain('Simulated');
    expect(html).toContain(`Pick up milk, eggs at ${DEMO_SHOPPING_STORE.name} · 350m · Open now`);
    expect(html).toContain('Directions');
    expect(html).toContain('Got it');
    expect(html).toContain('Not now');
  });

  it('verifies MemoryPort writeBack and forget integration for shopping list', async () => {
    const { LocalMemoryAdapter } = await import('../../adapters/xmemo/local-adapter.js');
    const { YoriStorage, InMemoryStorageDriver } = await import('../../core/storage/index.js');

    const storage = new YoriStorage(new InMemoryStorageDriver());
    const adapter = new LocalMemoryAdapter(storage);

    // Write back shopping list
    const fact = createMemoryFact(
      'shopping_list',
      ['milk', 'eggs'],
      'confirmed',
      { source: 'user_stated', recordedAt: '2026-11-05T07:00:00.000Z' },
      '2026-11-05T07:00:00.000Z'
    );
    const writeRes = await adapter.writeBack(fact);
    expect(writeRes.success).toBe(true);

    let loaded = await adapter.loadFacts();
    expect(loaded.find(f => f.key === 'shopping_list')?.value).toEqual(['milk', 'eggs']);

    // Forget removes the item
    const forgetRes = await adapter.forget('shopping_list', '2026-11-05T07:05:00.000Z');
    expect(forgetRes.success).toBe(true);

    loaded = await adapter.loadFacts();
    expect(loaded.find(f => f.key === 'shopping_list')).toBeUndefined();
  });
});
