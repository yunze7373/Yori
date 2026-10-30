import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  InProcessMockXMemoServer,
  runReadOnlyOwnerKey,
  classifyEnvelopeShape,
  formatReportMarkdown,
  assertReportPrivacy,
  ReadOnlyVerificationReport,
} from '../../../scripts/live-verify-xmemo.js';

describe('XMEMO-RO: Read-Only Owner-Key Connectivity Verification', () => {
  let tmpReportDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tmpReportDir = path.join(os.tmpdir(), `yori-s2-ro-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(tmpReportDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(tmpReportDir)) {
      fs.rmSync(tmpReportDir, { recursive: true, force: true });
    }
  });

  // ==========================================================================
  // 1. Precondition Checks (Live Refusal)
  // ==========================================================================
  describe('1. Precondition Checks (Live Refusal)', () => {
    it('refuses live run when --confirm-live-readonly is omitted', async () => {
      process.env.XMEMO_AUTH_MODE = 'owner_key';
      process.env.XMEMO_KEY = 'test-owner-key';
      process.env.NODE_ENV = 'development';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: false,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain('--confirm-live-readonly=missing');
    });

    it('refuses live run when XMEMO_AUTH_MODE is not owner_key', async () => {
      process.env.XMEMO_AUTH_MODE = 'oauth';
      process.env.XMEMO_KEY = 'test-owner-key';
      process.env.NODE_ENV = 'development';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain('XMEMO_AUTH_MODE=missing (must be owner_key)');
    });

    it('refuses live run when XMEMO_KEY is missing or empty', async () => {
      process.env.XMEMO_AUTH_MODE = 'owner_key';
      delete process.env.XMEMO_KEY;
      process.env.NODE_ENV = 'development';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain('XMEMO_KEY=missing');
    });

    it('refuses live run when NODE_ENV is production', async () => {
      process.env.XMEMO_AUTH_MODE = 'owner_key';
      process.env.XMEMO_KEY = 'test-owner-key';
      process.env.NODE_ENV = 'production';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain('(production forbidden)');
    });
  });

  // ==========================================================================
  // 2. Hard Cap Enforcement (Max 3 Upstream Requests)
  // ==========================================================================
  describe('2. Hard Cap Enforcement (Max 3 Requests)', () => {
    it('strictly clamps request execution to at most 3 requests even if more queries provided', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          maxRequests: 10, // Explicitly request 10
          queries: ['q1', 'q2', 'q3', 'q4', 'q5'], // 5 queries provided
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.refused).toBe(false);
        expect(res.report).toBeDefined();
        // Clamped to 3
        expect(res.report!.totalRequestsDispatched).toBe(3);
        expect(res.report!.requests).toHaveLength(3);
      } finally {
        await mockServer.stop();
      }
    });

    it('executes fewer than 3 requests when fewer queries are planned', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          maxRequests: 3,
          queries: ['preferences'],
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.report!.totalRequestsDispatched).toBe(1);
        expect(res.report!.requests).toHaveLength(1);
      } finally {
        await mockServer.stop();
      }
    });
  });

  // ==========================================================================
  // 3. Hard Stop on 401, 403, 5xx and Host Mismatch
  // ==========================================================================
  describe('3. Hard Stop on Upstream Errors & Host Mismatch', () => {
    it('halts immediately on HTTP 401 and skips MemoryPort roundtrip', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await runReadOnlyOwnerKey({
        dryRun: true,
        mockFetch,
        queries: ['q1', 'q2', 'q3'],
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.report?.executionStatus).toBe('hard_stop');
      expect(res.report?.hardStopReason).toContain('Upstream error HTTP 401');
      expect(res.report?.totalRequestsDispatched).toBe(1); // Aborted after first failure
      expect(res.report?.memoryPortRoundtrip.executed).toBe(false);
    });

    it('halts immediately on HTTP 403 and skips MemoryPort roundtrip', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await runReadOnlyOwnerKey({
        dryRun: true,
        mockFetch,
        queries: ['q1', 'q2'],
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.report?.executionStatus).toBe('hard_stop');
      expect(res.report?.hardStopReason).toContain('Upstream error HTTP 403');
      expect(res.report?.totalRequestsDispatched).toBe(1);
      expect(res.report?.memoryPortRoundtrip.executed).toBe(false);
    });

    it('halts immediately on HTTP 500 and skips MemoryPort roundtrip', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await runReadOnlyOwnerKey({
        dryRun: true,
        mockFetch,
        queries: ['q1', 'q2'],
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.report?.executionStatus).toBe('hard_stop');
      expect(res.report?.hardStopReason).toMatch(/Upstream error HTTP (500|502)/);
      expect(res.report?.totalRequestsDispatched).toBe(1);
      expect(res.report?.memoryPortRoundtrip.executed).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Structural Mutation Blocking (Zero Writes/Deletes)
  // ==========================================================================
  describe('4. Structural Mutation Blocking', () => {
    it('structurally cannot invoke remember or forget during read-only check', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);

        // Assert strictly zero mutating tool calls
        expect(mockServer.rememberCallCount).toBe(0);
        expect(mockServer.forgetCallCount).toBe(0);
        expect(mockServer.recallCallCount).toBeGreaterThan(0);

        // Verify request payload history has zero remember or forget invocations
        for (const req of mockServer.requestHistory) {
          if (req.body && req.body.params && req.body.params.name) {
            expect(req.body.params.name).not.toBe('remember');
            expect(req.body.params.name).not.toBe('forget');
            expect(req.body.params.name).toBe('recall');
          }
        }

        // Vault size remains completely identical to pre-seeded facts
        expect(mockServer.vaultFacts.size).toBe(3);
      } finally {
        await mockServer.stop();
      }
    });
  });

  // ==========================================================================
  // 5. Minimal-Metadata Report & Privacy Redaction Audit
  // ==========================================================================
  describe('5. Minimal-Metadata Report & Privacy Redaction Audit', () => {
    it('persists report with field names and counts only, never values, PII, or tokens', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      const sensitivePiiValue1 = 'secret-ssn-000-11-2222-do-not-leak';
      const sensitivePiiValue2 = 'sensitive-personal-email@private-host.org';
      const sensitivePiiValue3 = 'raw-user-secret-address-1234';

      mockServer.vaultFacts.set('prep_buffer_minutes', {
        key: 'prep_buffer_minutes',
        value: sensitivePiiValue1,
        status: 'confirmed',
        tag: 'yori:living-context',
        provenance: { source: 'user_confirmed' },
        updatedAt: new Date().toISOString(),
      });

      mockServer.vaultFacts.set('rain_transport_preference', {
        key: 'rain_transport_preference',
        value: sensitivePiiValue2,
        status: 'confirmed',
        tag: 'yori:living-context',
        provenance: { source: 'user_confirmed' },
        updatedAt: new Date().toISOString(),
      });

      mockServer.vaultFacts.set('secret_unmanaged_note', {
        key: 'secret_unmanaged_note',
        value: sensitivePiiValue3,
        status: 'confirmed',
        tag: 'external:secret',
        provenance: { source: 'external' },
        updatedAt: new Date().toISOString(),
      });

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);

        const jsonReportPath = path.join(tmpReportDir, 's2-ro-report.json');
        const mdReportPath = path.join(tmpReportDir, 'S2_RO_REPORT.md');

        expect(fs.existsSync(jsonReportPath)).toBe(true);
        expect(fs.existsSync(mdReportPath)).toBe(true);

        const jsonContent = fs.readFileSync(jsonReportPath, 'utf-8');
        const mdContent = fs.readFileSync(mdReportPath, 'utf-8');

        // Verify privacy: NONE of the sensitive PII values appear in JSON or MD
        expect(jsonContent).not.toContain(sensitivePiiValue1);
        expect(jsonContent).not.toContain(sensitivePiiValue2);
        expect(jsonContent).not.toContain(sensitivePiiValue3);
        expect(mdContent).not.toContain(sensitivePiiValue1);
        expect(mdContent).not.toContain(sensitivePiiValue2);
        expect(mdContent).not.toContain(sensitivePiiValue3);

        // Verify field names ONLY are captured
        const parsedReport: ReadOnlyVerificationReport = JSON.parse(jsonContent);
        expect(parsedReport.requests[0]?.itemFieldNames).toEqual([
          'key',
          'provenance',
          'status',
          'tag',
          'updatedAt',
          'value',
        ]);
        expect(parsedReport.privacyAudit.rawBodyPersisted).toBe(false);
        expect(parsedReport.privacyAudit.piiValueLeakDetected).toBe(false);
        expect(parsedReport.privacyAudit.tokenLeakDetected).toBe(false);

        // Built-in privacy assertion passes
        assertReportPrivacy(jsonContent, [sensitivePiiValue1, sensitivePiiValue2, sensitivePiiValue3]);
        assertReportPrivacy(mdContent, [sensitivePiiValue1, sensitivePiiValue2, sensitivePiiValue3]);
      } finally {
        await mockServer.stop();
      }
    });

    it('assertReportPrivacy throws immediately if a forbidden snippet appears', () => {
      const reportWithLeak = JSON.stringify({
        leak: 'super-secret-user-token-xyz',
      });

      expect(() => {
        assertReportPrivacy(reportWithLeak, ['super-secret-user-token-xyz']);
      }).toThrow(/Privacy violation/i);
    });

    it('formatReportMarkdown outputs clean markdown table without content or values', () => {
      const sampleReport: ReadOnlyVerificationReport = {
        schemaVersion: '1.0.0',
        timestampUtc: '2026-10-30T19:00:00.000Z',
        timestampJst: '2026/10/31 04:00:00 JST',
        runMode: 'offline_mock',
        targetHost: '127.0.0.1:51821',
        executionStatus: 'success',
        totalRequestsDispatched: 1,
        requests: [
          {
            requestIndex: 1,
            query: 'preferences',
            httpStatus: 200,
            latencyMs: 10,
            targetHost: '127.0.0.1:51821',
            shapeClassification: 'result.memories[]',
            itemCount: 2,
            yoriManagedKeyCount: 2,
            yoriTaggedCount: 2,
            itemFieldNames: ['key', 'status', 'value'],
          },
        ],
        memoryPortRoundtrip: {
          executed: true,
          success: true,
          loadedFactCount: 2,
          mappedShape: 'MemoryFact[]',
        },
        privacyAudit: {
          rawBodyPersisted: false,
          piiValueLeakDetected: false,
          tokenLeakDetected: false,
        },
      };

      const md = formatReportMarkdown(sampleReport);
      expect(md).toContain('# XMemo Read-Only Owner-Key Connectivity Verification Report');
      expect(md).toContain('| 1 | `preferences` | 200 | 10ms | `result.memories[]` | 2 | 2 | 2 | `key, status, value` |');
      expect(md).toContain('**Loaded Facts Count**: 2');
    });
  });

  // ==========================================================================
  // 6. Envelope Shape Classification
  // ==========================================================================
  describe('6. Envelope Shape Classification', () => {
    it('classifies result.facts[] correctly', () => {
      expect(classifyEnvelopeShape({ result: { facts: [{ key: 'k' }] } })).toBe('result.facts[]');
    });

    it('classifies result.memories[] correctly', () => {
      expect(classifyEnvelopeShape({ result: { memories: [{ key: 'k' }] } })).toBe('result.memories[]');
    });

    it('classifies result.items[] correctly', () => {
      expect(classifyEnvelopeShape({ result: { items: [{ key: 'k' }] } })).toBe('result.items[]');
    });

    it('classifies result.content[json] correctly', () => {
      expect(
        classifyEnvelopeShape({
          result: {
            content: [{ type: 'text', text: '[{"key":"test"}]' }],
          },
        })
      ).toBe('result.content[json]');
    });

    it('classifies result.content[text] correctly', () => {
      expect(
        classifyEnvelopeShape({
          result: {
            content: [{ type: 'text', text: 'plain text response' }],
          },
        })
      ).toBe('result.content[text]');
    });

    it('classifies result.array correctly', () => {
      expect(classifyEnvelopeShape([{ key: 'k' }])).toBe('result.array');
    });

    it('classifies error envelope correctly', () => {
      expect(classifyEnvelopeShape({ error: { code: -32602, message: 'Invalid params' } })).toBe('error');
    });

    it('classifies unknown / malformed structures as unknown', () => {
      expect(classifyEnvelopeShape(null)).toBe('unknown');
      expect(classifyEnvelopeShape(undefined)).toBe('unknown');
      expect(classifyEnvelopeShape('string-value')).toBe('unknown');
      expect(classifyEnvelopeShape(42)).toBe('unknown');
      expect(classifyEnvelopeShape({ foo: 'bar' })).toBe('unknown');
    });
  });

  // ==========================================================================
  // 7. MemoryPort Read-Side Roundtrip Robustness
  // ==========================================================================
  describe('7. MemoryPort Read-Side Roundtrip', () => {
    it('successfully maps upstream facts to MemoryFact[] in MemoryPort roundtrip', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.report?.memoryPortRoundtrip.executed).toBe(true);
        expect(res.report?.memoryPortRoundtrip.success).toBe(true);
        expect(res.report?.memoryPortRoundtrip.mappedShape).toBe('MemoryFact[]');
        expect(res.report?.memoryPortRoundtrip.loadedFactCount).toBeGreaterThan(0);
      } finally {
        await mockServer.stop();
      }
    });

    it('fails closed gracefully without throwing when upstream returns malformed envelope', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ unexpected: 'garbage_payload' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await runReadOnlyOwnerKey({
        dryRun: true,
        mockFetch,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      // Envelope has 0 items and roundtrip fails closed
      expect(res.report?.memoryPortRoundtrip.executed).toBe(true);
      expect(res.report?.memoryPortRoundtrip.loadedFactCount).toBe(0);
      expect(res.report?.memoryPortRoundtrip.mappedShape).toBe('MemoryFact[]');
    });
  });

  // ==========================================================================
  // 8. Zero Model Involvement & Production Ledger Immutability
  // ==========================================================================
  describe('8. Zero Model Involvement & Ledger Immutability', () => {
    it('verifies live-verify-xmemo script does not invoke or import model proxy', () => {
      const scriptPath = path.resolve(__dirname, '../../../scripts/live-verify-xmemo.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

      expect(scriptContent).not.toContain("from '../src/core/model-proxy'");
      expect(scriptContent).not.toContain('completeTask(');
      expect(scriptContent).not.toContain('metaApiKey');
    });

    it('verifies model live ledger SHA256 remains byte-identical at 17 entries', () => {
      const ledgerPath = path.resolve(__dirname, '../../../.yori-runtime/model-live-ledger.json');
      const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8');
      const ledger = JSON.parse(ledgerContent);

      expect(ledger.call_count).toBe(17);
      expect(ledger.reservations).toHaveLength(17);

      const actualHash = crypto.createHash('sha256').update(ledgerContent).digest('hex');
      expect(actualHash).toBe('46aa6fa9158356b29b327913522188615004b4c6d61952a2e61a2bd79b96da58');
    });
  });
});
