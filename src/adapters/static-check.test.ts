/**
 * Static Audit & Security Integrity Checks
 * Governed by Acceptance Criteria AC-106-3 & Invariants INV-107, HB-2, HB-3.
 *
 * Verifies:
 * 1. Zero API key / secret token literals or MODEL_API_KEY literal assignments exist in src/ or dist/.
 * 2. MemoryPort write-back strictly rejects non-confirmed facts.
 * 3. Never attempts to read ~/.config/muse/auth.json.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalMemoryAdapter, XMemoRemoteAdapter } from './xmemo/index.js';
import { createMemoryFact } from '../core/contracts/index.js';

describe('Static Security Check (AC-106-3, HB-2, HB-3)', () => {
  function collectFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath));
      } else if (
        (entry.name.endsWith('.ts') ||
          entry.name.endsWith('.js') ||
          entry.name.endsWith('.json')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('ensures src/ contains zero hardcoded API key or secret token literals', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    expect(srcFiles.length).toBeGreaterThan(0);

    // Regex patterns for potential secret tokens / keys
    const secretPatterns = [
      /\bsk-[a-zA-Z0-9_-]{20,}\b/,           // OpenAI / Meta standard keys
      /\bghp_[a-zA-Z0-9]{30,}\b/,             // GitHub personal tokens
      /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\b/, // JWT tokens
      /MODEL_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/, // Hardcoded key value
      /META_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/,
    ];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of secretPatterns) {
        const match = pattern.exec(content);
        expect(
          match,
          `Potential hardcoded secret or API key found in ${path.relative(process.cwd(), filePath)}: ${match?.[0]}`
        ).toBeNull();
      }
    }
  });

  it('ensures dist/ (if exists) contains zero hardcoded API key or secret token literals', () => {
    const distPath = path.resolve('dist');
    if (!fs.existsSync(distPath)) {
      return; // dist not built yet
    }
    const distFiles = collectFiles(distPath);
    for (const filePath of distFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/\bsk-[a-zA-Z0-9_-]{20,}\b/);
      expect(content).not.toMatch(/MODEL_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/);
    }
  });

  it('ensures code never references or reads ~/.config/muse/auth.json (Section 9.1)', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(
        content.includes('.config/muse'),
        `Forbidden muse auth config reference found in ${filePath}`
      ).toBe(false);
    }
  });

  it('fails if MemoryPort write-back accepts non-confirmed facts (AC-106-3)', async () => {
    const localAdapter = new LocalMemoryAdapter();
    const remoteAdapter = new XMemoRemoteAdapter('mock-auth');

    const pendingFact = createMemoryFact(
      'taste',
      'ramen',
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    const rejectedFact = createMemoryFact(
      'taste',
      'ramen',
      'rejected',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(localAdapter.writeBack(pendingFact)).rejects.toThrow();
    await expect(localAdapter.writeBack(rejectedFact)).rejects.toThrow();

    await expect(remoteAdapter.writeBack(pendingFact)).rejects.toThrow();
    await expect(remoteAdapter.writeBack(rejectedFact)).rejects.toThrow();
  });
});
