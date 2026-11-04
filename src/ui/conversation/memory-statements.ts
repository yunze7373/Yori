/**
 * HABIT-LEARN item 4: things the user tells Yori in Ask are saved as stated, directly; no proposal,
 * no Confirm. A small closed grammar (deterministic, zero model calls):
 *   "I'm vegetarian" / "I am vegan" / "remember I'm vegetarian"      -> dietary_preference
 *   "remember I like quiet places" / "I prefer quiet spots"            -> ambience_preference = quiet
 *   "I like ramen" / "remember I love sushi" / "I prefer Italian food" -> taste_preference = <cuisine>
 * Anything else falls through to the normal Ask interpreter.
 */

export interface MemoryStatement {
  readonly key: 'dietary_preference' | 'ambience_preference' | 'taste_preference' | 'shopping_list';
  readonly value: string | readonly string[];
  readonly reply: string;
  readonly items?: readonly string[];
}

const CUISINES = [
  'ramen', 'soba', 'udon', 'sushi', 'tempura', 'yakitori', 'curry', 'japanese', 'chinese', 'korean', 'thai',
  'vietnamese', 'indian', 'italian', 'french', 'spanish', 'mexican', 'pizza', 'pasta', 'burger', 'burgers',
  'salad', 'salads', 'cafe', 'cafes', 'coffee', 'bakery', 'noodles', 'dumplings', 'bbq', 'steak', 'seafood',
];

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.!?,。！？，]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitShoppingItems(raw: string): string[] {
  const tokens = raw
    .split(/(?:,|\band\b|&|、|和|及)+/i)
    .map(s => s.trim())
    .map(s => s.replace(/^(?:a|an|the|some)\s+/i, '').trim())
    .filter(s => s.length > 0 && s.length <= 60);

  return Array.from(new Set(tokens));
}

export function parseMemoryStatement(text: string): MemoryStatement | null {
  const t = clean(text);
  if (!t || t.length > 120) return null;
  const lead = /^(?:please\s+)?(?:remember\s+(?:that\s+)?)?/;
  const body = t.replace(lead, '');

  const diet = /^(?:i'?m|i am)\s+(?:a\s+)?(vegetarian|vegan)$/.exec(body);
  if (diet) {
    const value = diet[1]!;
    return {
      key: 'dietary_preference',
      value,
      reply: `Got it: you're ${value}. Yori will put ${value}-friendly places first. You can change this in Me.`,
    };
  }

  if (/^i\s+(?:like|love|prefer|enjoy)\s+quiet(?:er)?(?:\s+(?:places|spots|restaurants|cafes))?$/.test(body)) {
    return {
      key: 'ambience_preference',
      value: 'quiet',
      reply: 'Got it: you like quiet places. Yori will put them first. You can change this in Me.',
    };
  }

  const taste = /^i\s+(?:really\s+)?(?:like|love|prefer|enjoy)\s+([a-z]+)(?:\s+(?:food|places|restaurants))?$/.exec(body);
  if (taste && CUISINES.includes(taste[1]!)) {
    const value = taste[1]!.replace(/s$/, '') === 'cafe' ? 'cafe' : taste[1]!;
    return {
      key: 'taste_preference',
      value,
      reply: `Got it: you like ${value}. Yori will put ${value} places first. You can change this in Me.`,
    };
  }

  // 4. Shopping list statements (SHOPPING-REMINDER)
  let shoppingMatch: string | null = null;

  const remindMatch = /^(?:remind\s+me\s+to|remember\s+to|to)\s+(?:buy|get|pick\s+up)\s+(.+)$/i.exec(body);
  if (remindMatch) {
    shoppingMatch = remindMatch[1]!;
  }

  if (!shoppingMatch) {
    const addMatch = /^add\s+(.+?)\s+to\s+(?:(?:my|the)\s+)?shopping\s+list$/i.exec(body);
    if (addMatch) {
      shoppingMatch = addMatch[1]!;
    }
  }

  if (!shoppingMatch) {
    const needMatch = /^(?:i\s+)?(?:need|have|want)\s+to\s+(?:buy|get|pick\s+up)\s+(.+)$/i.exec(body);
    if (needMatch) {
      shoppingMatch = needMatch[1]!;
    }
  }

  if (!shoppingMatch) {
    const cnRemindMatch = /^(?:请)?提醒我(?:去)?买\s*(.+)$/.exec(body);
    if (cnRemindMatch) {
      shoppingMatch = cnRemindMatch[1]!;
    }
  }

  if (!shoppingMatch) {
    const cnAddMatch = /^(?:请)?(?:把|将)\s*(.+?)\s*(?:添?加[到入]|放[到入])(?:我的)?购物清单$/.exec(body);
    if (cnAddMatch) {
      shoppingMatch = cnAddMatch[1]!;
    }
  }

  if (!shoppingMatch) {
    const cnNeedMatch = /^(?:我)?(?:需要|想|要)买\s*(.+)$/.exec(body);
    if (cnNeedMatch) {
      shoppingMatch = cnNeedMatch[1]!;
    }
  }

  if (shoppingMatch) {
    const items = splitShoppingItems(shoppingMatch);
    if (items.length > 0) {
      const isCn = /[\u4e00-\u9fa5]/.test(t);
      const itemsFormatted = items.join(', ');
      return {
        key: 'shopping_list',
        value: items,
        items,
        reply: isCn
          ? `好的，已将${items.join('、')}加入购物清单。你可以在“我”页面查看。`
          : `Got it: added ${itemsFormatted} to your shopping list. You can see it in Me.`,
      };
    }
  }

  return null;
}
