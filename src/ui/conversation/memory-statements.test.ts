import { describe, it, expect } from 'vitest';
import { parseMemoryStatement } from './memory-statements.js';

describe('HABIT-LEARN: Ask statements are saved as stated (no proposal, no confirm)', () => {
  it.each([
    ["I'm vegetarian", 'dietary_preference', 'vegetarian'],
    ['I am vegan', 'dietary_preference', 'vegan'],
    ["remember I'm a vegetarian.", 'dietary_preference', 'vegetarian'],
    ['Remember I like quiet places', 'ambience_preference', 'quiet'],
    ['I prefer quiet spots', 'ambience_preference', 'quiet'],
    ['I like ramen', 'taste_preference', 'ramen'],
    ['remember that I love sushi!', 'taste_preference', 'sushi'],
    ['I prefer Italian food', 'taste_preference', 'italian'],
    ['I like cafes', 'taste_preference', 'cafe'],
  ])('%s -> %s=%s', (text, key, value) => {
    const s = parseMemoryStatement(text)!;
    expect(s.key).toBe(key);
    expect(s.value).toBe(value);
    expect(s.reply).toMatch(/^Got it/);
    expect(s.reply).not.toMatch(/\?|confirm/i);
  });

  it.each(['quieter', 'vegetarian', 'why this restaurant?', 'I like you', 'leave 10 minutes later', '', 'I like ' + 'x'.repeat(130)])(
    '%s is not a memory statement (falls through to Ask)',
    text => {
      expect(parseMemoryStatement(text)).toBeNull();
    }
  );
});
