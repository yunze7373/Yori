/**
 * Yori-Managed Fact Key Contract
 * Governed by BACKLOG-20261031-XKEYDEL-P2.
 *
 * Single centralized authority for all fact keys that Yori is authorized to write or delete.
 * Enforced server-side in XMemo proxy and client-side across UI workflows.
 *
 * Aggregates:
 * 1. Core-adjacent UI keys (why-sheet, presentation, and grounding workflows).
 * 2. Declarative plugin manifest keys (`managedMemoryKeys` exported by plugins).
 *
 * Architectural Decision on Grocery Keys:
 * 'grocery_store_preference' and 'preferred_grocery_store' are explicitly declared as Yori-managed keys
 * because the grocery plugin reads confirmed store preferences and the Living Context UI generates
 * routine proposals for them. Declaring them in the grocery plugin manifest (`managedMemoryKeys`)
 * ensures that remote confirm and delete workflows succeed honestly without 403 Forbidden errors,
 * while preserving zero-core-diff extensibility.
 */

import { collectPluginManagedMemoryKeys } from '../../plugins/registry.js';

/**
 * Base core-adjacent UI fact keys known to Living Context UI flows.
 */
export const BASE_UI_FACT_KEYS: readonly string[] = Object.freeze([
  'prep_buffer_minutes',
  'prep_duration_minutes',
  'prep_buffer_preference',
  'rain_transport_preference',
  'taste_preference',
  'taste_preferences',
  'favorite_cuisine',
  'suppress_lunch',
  'suppress_lunch_recommendations',
  'shopping_list',
]);

/**
 * Derives the complete set of Yori-managed keys from UI baseline and plugin manifests.
 */
export function deriveManagedFactKeys(): ReadonlySet<string> {
  const pluginKeys = collectPluginManagedMemoryKeys();
  return new Set<string>([...BASE_UI_FACT_KEYS, ...pluginKeys]);
}

/**
 * Closed registry of fact keys that Yori is authorized to write or delete.
 * Enforced server-side on both write (POST confirmed-facts) and delete (DELETE confirmed-facts).
 * Anything outside this closed set is rejected with 403 ('Forbidden: not a Yori-managed key').
 */
export const YORI_MANAGED_FACT_KEYS: ReadonlySet<string> = deriveManagedFactKeys();

/**
 * Validates whether a key is strictly in the YORI_MANAGED_FACT_KEYS registry.
 * Rejects non-strings, whitespace variants, casing differences, unicode lookalikes,
 * and traversal/prefix tricks.
 */
export function isYoriManagedFactKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  return deriveManagedFactKeys().has(key);
}
