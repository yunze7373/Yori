import path from 'path';

/**
 * Returns the directory path for E2E screenshot and artifact output.
 * Governed by BACKLOG-20261031-UIP3 / UI-POLISH:
 * By default, routes to untracked 'test-results/evidence/{subfolder}' so test runs never dirty git status.
 * Only routes to tracked 'docs/evidence/{subfolder}' when explicit opt-in env flag UPDATE_EVIDENCE is set.
 */
export function getEvidenceDir(subfolder: string): string {
  if (process.env.UPDATE_EVIDENCE === '1' || process.env.UPDATE_EVIDENCE === 'true') {
    return path.resolve(process.cwd(), 'docs/evidence', subfolder);
  }
  return path.resolve(process.cwd(), 'test-results/evidence', subfolder);
}
