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

  describe('SHOPPING-REMINDER: Shopping list parsing', () => {
    it.each([
      ['remind me to buy milk', ['milk']],
      ['add eggs to my shopping list', ['eggs']],
      ['add eggs to the shopping list', ['eggs']],
      ['add eggs to shopping list', ['eggs']],
      ['I need to buy milk, eggs', ['milk', 'eggs']],
      ['need to buy bread and butter', ['bread', 'butter']],
      ['remember to get apples, oranges, and bananas', ['apples', 'oranges', 'bananas']],
      ['remind me to pick up some coffee and a tea', ['coffee', 'tea']],
      ['提醒我买牛奶', ['牛奶']],
      ['把鸡蛋加到购物清单', ['鸡蛋']],
      ['将牛奶和面包加入购物清单', ['牛奶', '面包']],
      ['我要买苹果', ['苹果']],
      ['我需要买鸡蛋', ['鸡蛋']],
    ])('%s -> shopping_list=%j', (text, expectedItems) => {
      const s = parseMemoryStatement(text);
      expect(s).not.toBeNull();
      expect(s!.key).toBe('shopping_list');
      expect(s!.value).toEqual(expectedItems);
      expect(s!.items).toEqual(expectedItems);
      expect(s!.reply).not.toMatch(/\?|confirm/i);
    });

    it('never infers items when no item is explicitly mentioned', () => {
      expect(parseMemoryStatement('remind me to buy')).toBeNull();
      expect(parseMemoryStatement('remind me to get')).toBeNull();
      expect(parseMemoryStatement('add to my shopping list')).toBeNull();
      expect(parseMemoryStatement('i need to buy')).toBeNull();
      expect(parseMemoryStatement('提醒我买')).toBeNull();
      expect(parseMemoryStatement('加到购物清单')).toBeNull();
    });

    it('does not special-case or block sensitive items (medical, health, etc.) beyond existing sensitive guard', () => {
      const s1 = parseMemoryStatement('remind me to buy aspirin');
      expect(s1).not.toBeNull();
      expect(s1!.key).toBe('shopping_list');
      expect(s1!.value).toEqual(['aspirin']);

      const s2 = parseMemoryStatement('add bandages and vitamins to my shopping list');
      expect(s2).not.toBeNull();
      expect(s2!.key).toBe('shopping_list');
      expect(s2!.value).toEqual(['bandages', 'vitamins']);
    });
  });

  it.each(['quieter', 'vegetarian', 'why this restaurant?', 'I like you', 'leave 10 minutes later', '', 'I like ' + 'x'.repeat(130)])(
    '%s is not a memory statement (falls through to Ask)',
    text => {
      expect(parseMemoryStatement(text)).toBeNull();
    }
  );
});
