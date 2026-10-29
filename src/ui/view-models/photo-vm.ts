/**
 * Local Labelled Photo / Illustration View Models (LIVING_CONTEXT_V2.md §4 & §5)
 *
 * Rules:
 * - Strictly local licence-clean SVG illustrations.
 * - ZERO external image URLs or remote assets (enforced by static check).
 * - Visibly labelled "Illustration · simulated".
 * - No person photo as Yori avatar.
 * - Match on fixture cuisine and dish attributes only (zero concept image venue names).
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
      <rect width="100%" height="100%" fill="#F7F5F0" rx="8"/>
      <!-- Dark slate serving board -->
      <rect x="35" y="42" width="130" height="60" rx="4" fill="#212F2B"/>
      <!-- Nigiri 1: Salmon -->
      <rect x="52" y="58" width="26" height="15" rx="5" fill="#F8F9FA"/>
      <rect x="50" y="54" width="30" height="12" rx="4" fill="#FA8072"/>
      <line x1="56" y1="56" x2="74" y2="56" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <!-- Nigiri 2: Tuna -->
      <rect x="87" y="58" width="26" height="15" rx="5" fill="#F8F9FA"/>
      <rect x="85" y="54" width="30" height="12" rx="4" fill="#C93B3B"/>
      <!-- Nigiri 3: Tamago with Nori band -->
      <rect x="122" y="58" width="26" height="15" rx="5" fill="#F8F9FA"/>
      <rect x="120" y="53" width="30" height="13" rx="4" fill="#F6BD60"/>
      <rect x="131" y="53" width="8" height="20" fill="#1C2E26"/>
      <!-- Wasabi dab & Ginger -->
      <ellipse cx="48" cy="88" rx="6" ry="4" fill="#74C69D"/>
      <ellipse cx="152" cy="88" rx="8" ry="4" fill="#FFDDD2"/>
    </svg>
  `.trim();
}

function createCafeSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F9F6F0" rx="8"/>
      <ellipse cx="100" cy="100" rx="45" ry="10" fill="#E8DFD3"/>
      <!-- Saucer -->
      <ellipse cx="100" cy="85" rx="46" ry="12" fill="#E6DFD5"/>
      <ellipse cx="100" cy="83" rx="40" ry="10" fill="#FFFFFF"/>
      <!-- Cup -->
      <path d="M72 55 C72 82 82 85 100 85 C118 85 128 82 128 55 Z" fill="#FFFFFF"/>
      <ellipse cx="100" cy="55" rx="28" ry="8" fill="#F0ECE4"/>
      <!-- Coffee & Latte Art -->
      <ellipse cx="100" cy="55" rx="25" ry="7" fill="#6F4E37"/>
      <path d="M92 55 Q100 51 108 55 Q100 58 92 55" fill="#FFFFFF" opacity="0.85"/>
      <!-- Handle -->
      <path d="M126 60 C138 60 138 74 124 76" stroke="#FFFFFF" stroke-width="4.5" fill="none"/>
    </svg>
  `.trim();
}

function createItalianSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#FBF8F3" rx="8"/>
      <!-- Plate rim and center -->
      <ellipse cx="100" cy="75" rx="60" ry="22" fill="#FFFFFF" stroke="#E5DFD7" stroke-width="2"/>
      <ellipse cx="100" cy="75" rx="42" ry="15" fill="#FAF6F0"/>
      <!-- Pasta mound with tomato sauce -->
      <ellipse cx="100" cy="73" rx="32" ry="11" fill="#F3D58C"/>
      <path d="M85 70 Q100 64 115 70 Q105 76 90 73" fill="#D34B38"/>
      <!-- Basil leaf -->
      <path d="M96 66 C93 61 100 58 104 64 C100 66 98 67 96 66 Z" fill="#3A8657"/>
    </svg>
  `.trim();
}

function createDefaultDiningSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F6F7F5" rx="8"/>
      <ellipse cx="100" cy="80" rx="50" ry="16" fill="#FFFFFF" stroke="#DEE2DF" stroke-width="2"/>
      <circle cx="100" cy="78" r="18" fill="#4B6B5C" opacity="0.8"/>
      <circle cx="100" cy="78" r="12" fill="#E8EDEA"/>
      <!-- Cloche / Cover hint -->
      <path d="M82 72 C82 58 118 58 118 72 Z" fill="#8FA499" opacity="0.4"/>
      <circle cx="100" cy="56" r="3.5" fill="#4B6B5C"/>
    </svg>
  `.trim();
}

function createFuelPumpSvg(): string {
  return `
    <svg width="100%" height="100%" viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <rect width="100%" height="100%" fill="#F1F5F9" rx="8"/>
      <!-- Ground line -->
      <line x1="20" y1="105" x2="180" y2="105" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round"/>
      <!-- Pump body -->
      <rect x="75" y="35" width="50" height="70" rx="6" fill="#3B82F6"/>
      <!-- Display screen -->
      <rect x="85" y="45" width="30" height="20" rx="3" fill="#1E293B"/>
      <rect x="88" y="52" width="24" height="6" rx="1" fill="#38BDF8"/>
      <!-- Fuel nozzle hose -->
      <path d="M125 55 C145 55 145 85 135 90 C130 92 125 90 125 80" stroke="#475569" stroke-width="4" stroke-linecap="round" fill="none"/>
      <!-- Pump base -->
      <rect x="70" y="100" width="60" height="6" rx="2" fill="#1E293B"/>
    </svg>
  `.trim();
}

export function getLocalIllustration(cuisineOrCategory: string, name?: string): PhotoVM {
  const norm = (cuisineOrCategory || '').toLowerCase();
  const nameNorm = (name || '').toLowerCase();

  let category = 'dining';
  let label = 'Dining illustration';
  let svgMarkup = createDefaultDiningSvg();

  if (norm.includes('fuel') || norm.includes('gas') || norm.includes('petrol') || nameNorm.includes('gas') || nameNorm.includes('fuel') || nameNorm.includes('petrol')) {
    category = 'fuel';
    label = 'Gas station illustration';
    svgMarkup = createFuelPumpSvg();
  } else if (norm.includes('ramen') || nameNorm.includes('ramen')) {
    category = 'ramen';
    label = 'Ramen dish illustration';
    svgMarkup = createRamenSvg();
  } else if (norm.includes('salad') || norm.includes('vegetarian') || nameNorm.includes('salad')) {
    category = 'salad';
    label = 'Fresh salad illustration';
    svgMarkup = createSaladSvg();
  } else if (norm.includes('sushi') || nameNorm.includes('sushi') || norm.includes('japanese')) {
    category = 'sushi';
    label = 'Sushi platter illustration';
    svgMarkup = createSushiSvg();
  } else if (norm.includes('cafe') || norm.includes('coffee') || nameNorm.includes('cafe')) {
    category = 'cafe';
    label = 'Café coffee illustration';
    svgMarkup = createCafeSvg();
  } else if (norm.includes('italian') || norm.includes('pasta') || nameNorm.includes('italian')) {
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
