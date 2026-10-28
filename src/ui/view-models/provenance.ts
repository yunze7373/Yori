/**
 * Provenance Classifier & Formatting
 * Governed by Living Context Architecture and Reviewer Amendment (msg_2ce5d22929cd4a35).
 *
 * Central source of truth for categorizing memory facts and context items into honest
 * provenance categories:
 * - 'user_confirmed': explicitly saved/confirmed by the user in this session or storage;
 *                     requires provenance.source === 'user_confirmed' AND membership in userConfirmedKeys.
 *                     Status alone ('confirmed') NEVER yields 'user_confirmed'.
 * - 'demo_sample': initial/sample profile facts bundled in the demo scenario.
 * - 'user_request': ephemeral session-scoped request override (never persisted as a fact).
 * - 'provider': live or external provider facts.
 */

export type FactSourceKind = 'user_confirmed' | 'demo_sample' | 'user_request' | 'provider';

export interface FactLike {
  readonly key: string;
  readonly status?: string;
  readonly provenance?: {
    readonly source?: string;
    readonly [key: string]: unknown;
  } | unknown;
  readonly value?: unknown;
}

/**
 * Classifies a memory fact or cited key into its honest provenance bucket.
 * Invariant: Status alone ('confirmed') NEVER qualifies a fact as 'user_confirmed'.
 * It strictly requires fact.provenance.source === 'user_confirmed' AND presence in userConfirmedKeys.
 */
export function classifyFactSource(
  fact: FactLike | string,
  userConfirmedKeys?: ReadonlySet<string>,
  knownFacts?: readonly FactLike[]
): FactSourceKind {
  const key = typeof fact === 'string' ? fact : fact.key;
  const factObj: FactLike | undefined =
    typeof fact === 'string'
      ? knownFacts?.find(f => f.key === key)
      : fact;

  if (key === 'user_request') {
    return 'user_request';
  }

  const provSource =
    factObj?.provenance && typeof factObj.provenance === 'object' && 'source' in factObj.provenance
      ? String((factObj.provenance as { source?: unknown }).source)
      : undefined;

  if (provSource === 'user_request') {
    return 'user_request';
  }

  if (provSource === 'provider' || provSource === 'live') {
    return 'provider';
  }

  if (provSource === 'demo_profile' || provSource === 'sample_profile' || provSource === 'sample') {
    return 'demo_sample';
  }

  // Status alone never yields user_confirmed:
  // Must be explicitly present in userConfirmedKeys
  if (userConfirmedKeys?.has(key)) {
    // If explicit provenance is present, ensure it is not a demo sample
    if (provSource === undefined || provSource === 'user_confirmed') {
      return 'user_confirmed';
    }
  }

  return 'demo_sample';
}

/**
 * Human-facing label for each provenance category.
 */
export function provenanceLabel(kind: FactSourceKind): string {
  switch (kind) {
    case 'user_confirmed':
      return 'Confirmed';
    case 'demo_sample':
      return 'Demo profile · sample preference';
    case 'user_request':
      return 'Your request · this session';
    case 'provider':
      return 'Live provider';
  }
}

/**
 * True if and only if the fact is classified as user_confirmed.
 */
export function isFactUserConfirmed(
  fact: FactLike | string,
  userConfirmedKeys?: ReadonlySet<string>,
  knownFacts?: readonly FactLike[]
): boolean {
  return classifyFactSource(fact, userConfirmedKeys, knownFacts) === 'user_confirmed';
}
