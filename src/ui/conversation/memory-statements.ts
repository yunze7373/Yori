/**
 * HABIT-LEARN item 4: things the user tells Yori in Ask are saved as stated, directly; no proposal,
 * no Confirm. A small closed grammar (deterministic, zero model calls):
 *   "I'm vegetarian" / "I am vegan" / "remember I'm vegetarian"      -> dietary_preference
 *   "remember I like quiet places" / "I prefer quiet spots"            -> ambience_preference = quiet
 *   "I like ramen" / "remember I love sushi" / "I prefer Italian food" -> taste_preference = <cuisine>
 * Anything else falls through to the normal Ask interpreter.
 */

export interface MemoryStatement {
  readonly key: 'dietary_preference' | 'ambience_preference' | 'taste_preference';
  readonly value: string;
  readonly reply: string;
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
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  return null;
}
