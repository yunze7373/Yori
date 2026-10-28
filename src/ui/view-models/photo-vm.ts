/**
 * Local Labelled Photo / Illustration View Models (LIVING_CONTEXT_V2.md §4 & §5)
 *
 * Rules:
 * - Strictly local licence-clean SVG illustrations.
 * - ZERO external image URLs or remote assets (enforced by static check).
 * - Visibly labelled "Illustration · simulated".
 * - No person photo as Yori avatar.
 */

import type { PhotoVM } from './types.js';

function createRamenSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F3EFE6" rx="8"/>
      <!-- Table surface hint -->
      <line x1="20" y1="105" x2="180" y2="105" stroke="#E2DCD0" stroke-width="3" stroke-linecap="round"/>
      <!-- Bowl shadow -->
      <ellipse cx="100" cy="98" rx="55" ry="10" fill="#E2DAC9"/>
      <!-- Bowl base and body -->
      <path d="M45 52 C45 92 65 95 100 95 C135 95 155 92 155 52 Z" fill="#2D4A3E"/>
      <ellipse cx="100" cy="52" rx="55" ry="14" fill="#3D6353"/>
      <!-- Broth surface -->
      <ellipse cx="100" cy="53" rx="50" ry="11" fill="#C4823F"/>
      <!-- Noodles / toppings hint -->
      <path d="M75 50 Q85 45 95 52 Q105 58 115 50" stroke="#FDE68A" stroke-width="3" stroke-linecap="round" fill="none"/>
      <ellipse cx="88" cy="53" rx="8" ry="5" fill="#FFFFFF"/>
      <ellipse cx="88" cy="53" rx="4" ry="3" fill="#F59E0B"/>
      <!-- Nori sheet -->
      <rect x="120" y="42" width="16" height="18" rx="2" fill="#1C2E26" transform="rotate(12 120 42)"/>
      <!-- Chopsticks resting -->
      <line x1="40" y1="42" x2="160" y2="35" stroke="#8C532B" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Gentle steam -->
      <path d="M85 30 Q90 22 85 15" stroke="#D1C7B7" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M102 28 Q107 18 102 12" stroke="#D1C7B7" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
  `.trim();
}

function createSaladSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#EFF5F1" rx="8"/>
      <line x1="20" y1="105" x2="180" y2="105" stroke="#D8E5DC" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="100" cy="98" rx="55" ry="10" fill="#D5E4D9"/>
      <!-- Ceramic bowl -->
      <path d="M46 54 C46 92 68 95 100 95 C132 95 154 92 154 54 Z" fill="#FFFFFF"/>
      <ellipse cx="100" cy="54" rx="54" ry="12" fill="#F8FAF9"/>
      <!-- Salad greens -->
      <circle cx="85" cy="50" r="14" fill="#40916C"/>
      <circle cx="110" cy="48" r="16" fill="#52B788"/>
      <circle cx="95" cy="54" r="12" fill="#74C69D"/>
      <!-- Cherry tomatoes -->
      <circle cx="78" cy="48" r="5" fill="#E63946"/>
      <circle cx="122" cy="52" r="5.5" fill="#E63946"/>
      <!-- Cucumber / avocado slices -->
      <circle cx="102" cy="44" r="6" fill="#95D5B2" stroke="#2D6A4F" stroke-width="1.5"/>
      <circle cx="88" cy="58" r="5" fill="#95D5B2" stroke="#2D6A4F" stroke-width="1.5"/>
    </svg>
  `.trim();
}

function createSushiSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F5F3EF" rx="8"/>
      <line x1="20" y1="105" x2="180" y2="105" stroke="#E3DFD5" stroke-width="3" stroke-linecap="round"/>
      <!-- Wooden geta plate -->
      <rect x="45" y="60" width="110" height="32" rx="4" fill="#C99B6D"/>
      <rect x="52" y="92" width="12" height="8" rx="2" fill="#9C6B3E"/>
      <rect x="136" y="92" width="12" height="8" rx="2" fill="#9C6B3E"/>
      <!-- Nigiri pieces -->
      <ellipse cx="70" cy="66" rx="14" ry="7" fill="#FFFFFF"/>
      <path d="M57 65 C57 58 83 58 83 65 Z" fill="#E76F51"/>
      <ellipse cx="100" cy="66" rx="14" ry="7" fill="#FFFFFF"/>
      <path d="M87 65 C87 58 113 58 113 65 Z" fill="#F4A261"/>
      <!-- Maki roll -->
      <ellipse cx="132" cy="66" rx="11" ry="8" fill="#1C2E26"/>
      <ellipse cx="132" cy="65" rx="8" ry="5.5" fill="#FFFFFF"/>
      <circle cx="132" cy="65" r="2.5" fill="#40916C"/>
    </svg>
  `.trim();
}

function createCafeSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F7F3EE" rx="8"/>
      <line x1="20" y1="105" x2="180" y2="105" stroke="#E5DED4" stroke-width="3" stroke-linecap="round"/>
      <!-- Saucer -->
      <ellipse cx="100" cy="92" rx="46" ry="10" fill="#E6DFD5"/>
      <ellipse cx="100" cy="90" rx="40" ry="8" fill="#FFFFFF"/>
      <!-- Ceramic Cup -->
      <path d="M72 58 C72 82 82 86 100 86 C118 86 128 82 128 58 Z" fill="#FFFFFF"/>
      <ellipse cx="100" cy="58" rx="28" ry="7" fill="#EAE5DC"/>
      <!-- Coffee surface -->
      <ellipse cx="100" cy="59" rx="24" ry="5.5" fill="#5E3821"/>
      <!-- Latte art leaf -->
      <path d="M96 59 Q100 56 104 59 Q100 61 96 59 Z" fill="#FAF5EF"/>
      <!-- Handle -->
      <path d="M127 63 C138 63 138 77 125 79" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none"/>
      <!-- Steam -->
      <path d="M96 46 Q100 38 96 32" stroke="#C9BEB0" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M106 44 Q110 36 106 28" stroke="#C9BEB0" stroke-width="2" stroke-linecap="round" fill="none"/>
    </svg>
  `.trim();
}

function createItalianSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#FBF8F3" rx="8"/>
      <line x1="20" y1="105" x2="180" y2="105" stroke="#EAE2D5" stroke-width="3" stroke-linecap="round"/>
      <!-- Plate -->
      <ellipse cx="100" cy="85" rx="60" ry="18" fill="#ECE5DA"/>
      <ellipse cx="100" cy="82" rx="52" ry="14" fill="#FFFFFF"/>
      <!-- Pasta swirl -->
      <ellipse cx="100" cy="78" rx="34" ry="10" fill="#F7DC6F"/>
      <path d="M80 76 Q95 68 112 75 Q120 80 102 82" stroke="#E59866" stroke-width="4" stroke-linecap="round" fill="none"/>
      <!-- Tomato sauce & basil garnish -->
      <circle cx="98" cy="76" r="8" fill="#C0392B"/>
      <ellipse cx="94" cy="72" rx="5" ry="3" fill="#27AE60" transform="rotate(-20 94 72)"/>
      <ellipse cx="105" cy="74" rx="4" ry="2.5" fill="#2ECC71" transform="rotate(25 105 74)"/>
    </svg>
  `.trim();
}

function createDefaultDiningSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F5F6F5" rx="8"/>
      <line x1="20" y1="105" x2="180" y2="105" stroke="#E1E4E1" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="100" cy="84" rx="48" ry="14" fill="#E2EAE5"/>
      <ellipse cx="100" cy="81" rx="40" ry="11" fill="#FFFFFF"/>
      <!-- Fork and knife icon -->
      <path d="M78 50 L78 72 M74 50 L74 60 C74 64 82 64 82 60 L82 50" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M122 50 L122 72 M122 50 C125 50 128 54 128 62 L122 64" stroke="#2D6A4F" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>
  `.trim();
}

export function getLocalIllustration(cuisineOrCategory: string, name?: string): PhotoVM {
  const norm = (cuisineOrCategory || '').toLowerCase();
  const nameNorm = (name || '').toLowerCase();

  let category = 'dining';
  let label = 'Dining illustration';
  let svgMarkup = createDefaultDiningSvg();

  if (norm.includes('ramen') || nameNorm.includes('ramen')) {
    category = 'ramen';
    label = 'Ramen dish illustration';
    svgMarkup = createRamenSvg();
  } else if (norm.includes('salad') || norm.includes('vegetarian') || nameNorm.includes('green') || nameNorm.includes('salad')) {
    category = 'salad';
    label = 'Fresh salad illustration';
    svgMarkup = createSaladSvg();
  } else if (norm.includes('sushi') || nameNorm.includes('sushi') || norm.includes('japanese')) {
    category = 'sushi';
    label = 'Sushi platter illustration';
    svgMarkup = createSushiSvg();
  } else if (norm.includes('cafe') || norm.includes('coffee') || nameNorm.includes('cafe') || nameNorm.includes('lumi')) {
    category = 'cafe';
    label = 'Café coffee illustration';
    svgMarkup = createCafeSvg();
  } else if (norm.includes('italian') || norm.includes('pasta') || nameNorm.includes('italian') || nameNorm.includes('sakura')) {
    category = 'italian';
    label = 'Italian pasta illustration';
    svgMarkup = createItalianSvg();
  }

  return {
    id: `photo-${category}`,
    label,
    category,
    simulatedBadge: 'Illustration · simulated',
    svgMarkup,
    altText: `${label} (Simulated local artwork)`,
  };
}
