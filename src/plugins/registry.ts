/**
 * Static Plugin Registry
 * Governed by Invariant INV-109 and Section 4 of Architecture.
 *
 * Placed explicitly outside core pipeline paths (src/core/*), so adding or
 * modifying plugins never alters core contracts, shared policy, or storage.
 */

import type { Plugin, ProviderAdapter } from '../core/contracts/index.js';
import { departPlugin } from './depart/index.js';
import { lunchPlugin } from './lunch/index.js';
import { groceryStubPlugin } from './grocery-stub/index.js';
import { fuelPlugin } from './fuel/index.js';
import { setDefaultPluginsProvider } from '../core/pipeline/index.js';

export type { Plugin } from '../core/contracts/index.js';
export { groceryStubPlugin } from './grocery-stub/index.js';
export { fuelPlugin } from './fuel/index.js';

/**
 * Extended plugin interface for declarative memory key management.
 * Governed by BACKLOG-20261031-XKEYDEL-P2: allows core-adjacent plugins
 * to declare managed fact keys without touching src/core.
 */
export interface YoriPlugin<TAdapter extends ProviderAdapter = ProviderAdapter> extends Plugin<TAdapter> {
  readonly managedMemoryKeys?: readonly string[];
}

/**
 * Collects all declarative managedMemoryKeys across registered plugins.
 */
export function collectPluginManagedMemoryKeys(): readonly string[] {
  const keys: string[] = [];
  for (const plugin of staticPluginRegistry.getAll()) {
    const pluginKeys = (plugin as YoriPlugin).managedMemoryKeys;
    if (Array.isArray(pluginKeys)) {
      keys.push(...pluginKeys);
    }
  }
  return keys;
}

/**
 * Static plugin registry shape.
 */
export class PluginRegistry {
  private readonly plugins: Map<string, Plugin> = new Map();

  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id '${plugin.id}' is already registered`);
    }

    // Carried P3: Reject Promise-returning or async plugins at registration with an explicit error
    if (
      plugin.detector?.detect?.constructor?.name === 'AsyncFunction' ||
      plugin.preparer?.prepare?.constructor?.name === 'AsyncFunction'
    ) {
      throw new Error(
        `Plugin '${plugin.id}' has async detector or preparer; synchronous registry requires sync plugins`
      );
    }

    this.plugins.set(plugin.id, Object.freeze({ ...plugin }));
  }

  public get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  public getAll(): readonly Plugin[] {
    return Array.from(this.plugins.values());
  }

  public has(id: string): boolean {
    return this.plugins.has(id);
  }

  public clear(): void {
    this.plugins.clear();
  }
}

/**
 * Singleton static registry instance.
 * S1-1: departPlugin is registered.
 * S2-1: lunchPlugin is registered.
 * S5-1: groceryStubPlugin is registered (AC-EXT-1 zero-core-diff extension).
 */
export const staticPluginRegistry = new PluginRegistry();
staticPluginRegistry.register(departPlugin);
staticPluginRegistry.register(lunchPlugin);
staticPluginRegistry.register(groceryStubPlugin);
staticPluginRegistry.register(fuelPlugin);

// Injects the default plugin provider into the core pipeline entry
setDefaultPluginsProvider(() => staticPluginRegistry.getAll());
