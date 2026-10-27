/**
 * Static Plugin Registry
 * Governed by Invariant INV-109 and Section 4 of Architecture.
 *
 * Placed explicitly outside core pipeline paths (src/core/*), so adding or
 * modifying plugins never alters core contracts, shared policy, or storage.
 *
 * S0-1 provides the static registry shape without detector, preparer, or UI behaviour.
 */

import type { IntentDetector, Preparer } from '../core/contracts/index.js';

export interface Plugin<TAdapter = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly detector: IntentDetector;
  readonly preparer: Preparer;
  readonly adapter?: TAdapter;
}

/**
 * Static plugin registry shape.
 */
class PluginRegistry {
  private readonly plugins: Map<string, Plugin> = new Map();

  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id '${plugin.id}' is already registered`);
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
 */
export const staticPluginRegistry = new PluginRegistry();
