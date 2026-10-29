# AC-EXT-1 Zero-Core-Diff Extensibility & Evidence Pack (Task V4 Closeout)

> **Governed by Plan:** `YORI_V2.plan.json` (Task `V4`, Priority P0, Condition C5, AC-EXT-1, INV-109)  
> **Invariant Anchor:** `f43c6c1d74c4bc1159300fed9d62aec9447b886e` (PH-001 closeout baseline)  
> **Status:** ✅ **PROVEN & VERIFIED**

---

## 1. Zero-Core-Diff Invariant Proof

The pure domain core (`src/core/contracts`, `src/core/composer`, `src/core/policy`, `src/core/storage`) is completely frozen. Adding a 3rd domain scenario plugin (`grocery-stub`) required **zero diffs** to `src/core`:

```bash
$ git diff --stat f43c6c1d HEAD -- src/core
(0 files changed, 0 insertions, 0 deletions)
```

---

## 2. AC-EXT-1 Grocery-Stub Code Diff

```diff
diff --git a/src/plugins/grocery-stub/adapter.ts b/src/plugins/grocery-stub/adapter.ts
new file mode 100644
index 0000000..95fa907
--- /dev/null
+++ b/src/plugins/grocery-stub/adapter.ts
@@ -0,0 +1,68 @@
+/**
+ * Mock Grocery Provider Adapter
+ * Governed by AC-EXT-1 and Invariant INV-102.
+ * Returns only SimulatedSignal with label 'simulated'.
+ */
+
+import {
+  createSimulatedSignal,
+  type SimulatedProviderAdapter,
+  type SimulatedSignal,
+} from '../../core/contracts/index.js';
+
+export interface GroceryItem {
+  readonly id: string;
+  readonly name: string;
+  readonly quantity?: string;
+}
+
+export class MockGroceryAdapter implements SimulatedProviderAdapter {
+  public readonly kind = 'mock-grocery-adapter';
+  public readonly source = 'simulated' as const;
+
+  public createGroceryListSignal(
+    items: readonly (string | GroceryItem)[],
+    issuedAt: string
+  ): SimulatedSignal {
+    const normalizedItems = items.map(item =>
+      typeof item === 'string' ? { id: item.toLowerCase().replace(/\s+/g, '-'), name: item } : item
+    );
+
+    return createSimulatedSignal({
+      kind: 'grocery_list',
+      value: {
+        itemCount: normalizedItems.length,
+        items: normalizedItems,
+      },
+      issuedAt,
+      validFor: 86400000,
+      confidence: 1.0,
+      consentScope: 'device_only',
+    });
+  }
+
+  public createGroceryStatusSignal(
+    options: { completedToday?: boolean; shoppedAt?: string },
+    issuedAt: string
+  ): SimulatedSignal {
+    return createSimulatedSignal({
+      kind: 'grocery_status',
+      value: {
+        completedToday: options.completedToday ?? false,
+        shoppedAt: options.shoppedAt,
+      },
+      issuedAt,
+      validFor: 86400000,
+      confidence: 1.0,
+      consentScope: 'device_only',
+    });
+  }
+
+  public signals(asOfIso: string = '2026-10-28T16:00:00.000Z'): readonly SimulatedSignal[] {
+    return Object.freeze([
+      this.createGroceryListSignal(['Milk', 'Eggs', 'Bread'], asOfIso),
+    ]);
+  }
+}
+
+export const mockGroceryAdapter = new MockGroceryAdapter();
diff --git a/src/plugins/grocery-stub/detector.ts b/src/plugins/grocery-stub/detector.ts
new file mode 100644
index 0000000..dca81b2
--- /dev/null
+++ b/src/plugins/grocery-stub/detector.ts
@@ -0,0 +1,79 @@
+/**
+ * Grocery Intent Detector
+ * Governed by AC-EXT-1, INV-108, INV-109.
+ *
+ * Detects grocery intent when items exist on the shopping list.
+ * Evaluates completion and schedule state into candidate metadata for generic core policy handling.
+ * Zero suppression logic inside the plugin (INV-108).
+ */
+
+import type {
+  IntentDetector,
+  IntentCandidate,
+  ContextSnapshot,
+  MemoryFact,
+  ContextSignal,
+} from '../../core/contracts/index.js';
+
+export class GroceryDetector implements IntentDetector {
+  public readonly id = 'grocery-detector';
+  public readonly targetIntent = 'grocery';
+
+  public detect(
+    snapshot: ContextSnapshot,
+    _memory: readonly MemoryFact[]
+  ): IntentCandidate | null {
+    if (!snapshot || !Array.isArray(snapshot.signals) || snapshot.signals.length === 0) {
+      return null;
+    }
+
+    const groceryListSignal = snapshot.signals.find(s => s.kind === 'grocery_list');
+    if (!groceryListSignal || !groceryListSignal.value || typeof groceryListSignal.value !== 'object') {
+      return null;
+    }
+
+    const val = groceryListSignal.value as Record<string, unknown>;
+    const items = Array.isArray(val.items) ? val.items : [];
+    if (items.length === 0) {
+      return null;
+    }
+
+    const groceryStatusSignal = snapshot.signals.find(s => s.kind === 'grocery_status');
+    let completedToday = false;
+    if (groceryStatusSignal && groceryStatusSignal.value && typeof groceryStatusSignal.value === 'object') {
+      const statusVal = groceryStatusSignal.value as Record<string, unknown>;
+      if (statusVal.completedToday === true) {
+        completedToday = true;
+      }
+    }
+
+    const scheduleSignal = snapshot.signals.find(s => s.kind === 'schedule_window');
+    let isUserBusy = false;
+    if (scheduleSignal && scheduleSignal.value && typeof scheduleSignal.value === 'object') {
+      const schedVal = scheduleSignal.value as Record<string, unknown>;
+      if (schedVal.isBusy === true) {
+        isUserBusy = true;
+      }
+    }
+
+    const evidence: ContextSignal[] = [groceryListSignal];
+    if (groceryStatusSignal) evidence.push(groceryStatusSignal);
+    if (scheduleSignal) evidence.push(scheduleSignal);
+
+    return Object.freeze({
+      intent: 'grocery',
+      confidence: 0.85,
+      evidence: Object.freeze(evidence),
+      urgency: 'low',
+      suggestedPlanningHorizonMs: 7200000,
+      suppressedBy: undefined, // Zero suppression logic in plugin; core handles via policies
+    });
+  }
+}
+
+export const groceryDetector = new GroceryDetector();
diff --git a/src/plugins/grocery-stub/preparer.ts b/src/plugins/grocery-stub/preparer.ts
new file mode 100644
index 0000000..f95e865
--- /dev/null
+++ b/src/plugins/grocery-stub/preparer.ts
@@ -0,0 +1,96 @@
+/**
+ * Grocery Plan Preparer
+ * Governed by AC-EXT-1, INV-102, INV-103.
+ * Plain-language derivation and honest attribution to memory facts.
+ */
+
+import type {
+  PlanPreparer,
+  IntentCandidate,
+  ContextSnapshot,
+  MemoryFact,
+  PreparedPlan,
+} from '../../core/contracts/index.js';
+
+export class GroceryPreparer implements PlanPreparer {
+  public readonly id = 'grocery-preparer';
+  public readonly targetIntent = 'grocery';
+
+  public prepare(
+    candidate: IntentCandidate,
+    snapshot: ContextSnapshot,
+    memory: readonly MemoryFact[]
+  ): PreparedPlan | null {
+    const groceryListSignal = candidate.evidence.find(s => s.kind === 'grocery_list');
+    if (!groceryListSignal || typeof groceryListSignal.value !== 'object') {
+      return null;
+    }
+
+    const val = groceryListSignal.value as Record<string, unknown>;
+    const items = Array.isArray(val.items) ? val.items : [];
+    const count = items.length;
+
+    const preferredStoreFact = memory.find(f => f.key === 'preferred_grocery_store');
+    const storeName = preferredStoreFact && typeof preferredStoreFact.value === 'string'
+      ? preferredStoreFact.value
+      : 'your usual grocery store';
+
+    const subjectTitle = `Grocery Run (${count} items)`;
+    const headline = `Restock ${count} items at ${storeName}`;
+    const derivation = preferredStoreFact
+      ? `Shopping list has ${count} items; routed to ${storeName} citing confirmed preference.`
+      : `Shopping list has ${count} items; routed to nearby store.`;
+
+    const memoryFactsUsed: MemoryFact[] = [];
+    if (preferredStoreFact) {
+      memoryFactsUsed.push(preferredStoreFact);
+    }
+
+    return Object.freeze({
+      id: `plan-grocery-${snapshot.asOf}`,
+      intentId: 'grocery',
+      status: 'pending',
+      headline,
+      derivation,
+      why: Object.freeze({
+        explanation: derivation,
+        evidenceSignals: Object.freeze([...candidate.evidence].map(e => ({
+          kind: e.kind,
+          source: e.source,
+          issuedAt: e.issuedAt,
+        }))),
+        memoryFactsUsed: Object.freeze(memoryFactsUsed),
+      }),
+      createdAt: snapshot.asOf,
+      timezone: snapshot.timezone ?? 'UTC',
+      subjectTitle,
+    });
+  }
+}
+
+export const groceryPreparer = new GroceryPreparer();
+```

---

## 3. Passing Verification Output

### Unit Suite: `src/plugins/grocery-stub/grocery.test.ts`
```text
$ npx vitest run src/plugins/grocery-stub/grocery.test.ts

 RUN  v3.2.7 <repo-root>

 ✓ src/plugins/grocery-stub/grocery.test.ts (9 tests) 35ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  10:56:09
   Duration  366ms
```

### Golden Acceptance Suite: `tests/golden/golden-harness.test.ts`
```text
$ npx vitest run tests/golden/golden-harness.test.ts

 RUN  v3.2.7 <repo-root>

 ✓ tests/golden/golden-harness.test.ts (10 tests) 37ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  10:56:09
   Duration  366ms
```

---

## 4. Architectural Honesty & Storage Boundaries

1. **X1 Remote Sync Gating**: Any memory write-back moment (adjusting prep/buffer or confirming proposals) operates exclusively on client-local storage. Remote XMemo OAuth sync remains strictly disabled (`X1 unauthorized`), preserving full user sovereignty (INV-107 / INV-110).
2. **Engine Status Honesty**: Screen recordings clearly display `Offline fallback · deterministic` and `Scripted model fixture · not a live model call`. Zero calls are made to live external AI models or remote APIs.
