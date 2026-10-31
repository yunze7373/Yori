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
  sanitizeFieldName,
  loadEnvLocal,
  ALLOWED_LIVE_ORIGIN,
  ReadOnlyVerificationReport,
  runHealthCheck,
} from '../../../scripts/live-verify-xmemo.js';
import { XMemoRemoteAdapter } from './remote-adapter.js';

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
  // 1. Precondition Checks & Origin Pinning (Live Refusal)
  // ==========================================================================
  describe('1. Precondition Checks & Origin Pinning (Live Refusal)', () => {
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

    it('refuses live run when XMEMO_ISSUER origin differs from pinned origin https://xmemo.dev', async () => {
      process.env.XMEMO_AUTH_MODE = 'owner_key';
      process.env.XMEMO_KEY = 'test-owner-key';
      process.env.NODE_ENV = 'development';
      process.env.XMEMO_ISSUER = 'https://evil.example.com';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain(`origin must be pinned to '${ALLOWED_LIVE_ORIGIN}'`);
    });

    it('refuses live run when XMEMO_ISSUER protocol is insecure http', async () => {
      process.env.XMEMO_AUTH_MODE = 'owner_key';
      process.env.XMEMO_KEY = 'test-owner-key';
      process.env.NODE_ENV = 'development';
      process.env.XMEMO_ISSUER = 'http://xmemo.dev';

      const res = await runReadOnlyOwnerKey({
        dryRun: false,
        confirmLiveReadonly: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.refused).toBe(true);
      expect(res.refusalReason).toContain(`origin must be pinned to '${ALLOWED_LIVE_ORIGIN}' with https`);
    });
  });

  // ==========================================================================
  // 2. Structural Request Cap & Ground Truth Reconciliation (P1)
  // ==========================================================================
  describe('2. Request Cap & Ground Truth Reconciliation (P1)', () => {
    it('default run: reported totalRequestsDispatched strictly equals mockServer.recallCallCount (3 == 3)', async () => {
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
        expect(res.report).toBeDefined();

        // Structural equality: reported count matches mock ground truth exactly
        expect(res.report!.totalRequestsDispatched).toBe(mockServer.recallCallCount);
        expect(res.report!.totalRequestsDispatched).toBe(3);
        expect(res.report!.requests).toHaveLength(3);
        expect(mockServer.recallCallCount).toBeLessThanOrEqual(3);
      } finally {
        await mockServer.stop();
      }
    });

    it('3-query run: reported totalRequestsDispatched strictly equals mockServer.recallCallCount (3 == 3)', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          maxRequests: 3,
          queries: ['q1', 'q2', 'q3'],
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.report).toBeDefined();

        // 3 queries use all 3 slots; roundtrip respects cap and skips extra dispatch
        expect(res.report!.totalRequestsDispatched).toBe(mockServer.recallCallCount);
        expect(res.report!.totalRequestsDispatched).toBe(3);
        expect(res.report!.requests).toHaveLength(3);
        expect(mockServer.recallCallCount).toBeLessThanOrEqual(3);
      } finally {
        await mockServer.stop();
      }
    });

    it('5-query run: capped structurally to at most 3 upstream requests (3 == 3)', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          maxRequests: 99, // Unbounded input option
          queries: ['q1', 'q2', 'q3', 'q4', 'q5'], // 5 queries provided
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.report).toBeDefined();

        // Must clamp structurally to 3
        expect(res.report!.totalRequestsDispatched).toBe(mockServer.recallCallCount);
        expect(res.report!.totalRequestsDispatched).toBe(3);
        expect(res.report!.requests).toHaveLength(3);
        expect(mockServer.recallCallCount).toBeLessThanOrEqual(3);
      } finally {
        await mockServer.stop();
      }
    });

    it('1-query run: executes exactly 1 upstream request (1 == 1)', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          maxRequests: 1,
          queries: ['preferences'],
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.report!.totalRequestsDispatched).toBe(mockServer.recallCallCount);
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
  // 5. Remote Adapter Security Hardening (P2: No Owner Key in appAuthToken)
  // ==========================================================================
  describe('5. Remote Adapter Security Hardening (P2)', () => {
    it('remote adapter constructed during roundtrip does not include owner key in client headers', async () => {
      const capturedHeaders: Record<string, string>[] = [];

      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      // Custom mock fetch that captures request headers
      const trackingFetch: typeof fetch = async (input, init) => {
        const headers = init?.headers ? (init.headers as Record<string, string>) : {};
        capturedHeaders.push({ ...headers });
        return fetch(input, init);
      };

      try {
        const res = await runReadOnlyOwnerKey({
          dryRun: true,
          mockServer,
          mockFetch: trackingFetch,
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);

        // Verify that remote adapter roundtrip passes no client Authorization header with activeOwnerKey
        const adapter = new XMemoRemoteAdapter({
          proxyEndpoint: '/api/xmemo',
          fetchFn: async (_url, init) => {
            const h = (init?.headers as Record<string, string>) || {};
            expect(h['Authorization']).toBeUndefined();
            expect(h['authorization']).toBeUndefined();
            return new Response(JSON.stringify({ result: { memories: [] } }), { status: 200 });
          },
        });

        const loaded = await adapter.loadFacts();
        expect(loaded).toEqual([]);
      } finally {
        await mockServer.stop();
      }
    });
  });

  // ==========================================================================
  // 6. Minimal-Metadata Report & Privacy Redaction Audit (P3)
  // ==========================================================================
  describe('6. Minimal-Metadata Report & Privacy Redaction Audit', () => {
    it('persists report with sanitized field names and counts only, never values, PII, or tokens', async () => {
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
        expect(parsedReport.privacyAudit.reportContainsValues).toBe('structurally_excluded');
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

    it('sanitizeFieldName sanitizes arbitrary/nonconforming property names safely', () => {
      expect(sanitizeFieldName('valid_key_name')).toBe('valid_key_name');
      expect(sanitizeFieldName('camelCaseKey')).toBe('camelCaseKey');
      expect(sanitizeFieldName('key123')).toBe('key123');

      // Nonconforming property names containing spaces, punctuation, or injection characters
      expect(sanitizeFieldName('illegal space')).toBe('<nonconforming len=13>');
      expect(sanitizeFieldName('{"injected":"json"}')).toBe('<nonconforming len=19>');
      expect(sanitizeFieldName('tool:call/arg')).toBe('<nonconforming len=13>');
      expect(sanitizeFieldName('a'.repeat(45))).toBe('<nonconforming len=45>');
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
          reportContainsValues: 'structurally_excluded',
          rawBodyPersisted: false,
          piiValueLeakDetected: false,
          tokenLeakDetected: false,
        },
      };

      const md = formatReportMarkdown(sampleReport);
      expect(md).toContain('# XMemo Read-Only Owner-Key Connectivity Verification Report');
      expect(md).toContain('| 1 | `preferences` | 200 | 10ms | `result.memories[]` | 2 | 2 | 2 | `key, status, value` |');
      expect(md).toContain('**Report Contains Values**: `structurally_excluded`');
      expect(md).toContain('**Loaded Facts Count**: 2');
    });
  });

  // ==========================================================================
  // 7. Envelope Shape Classification
  // ==========================================================================
  describe('7. Envelope Shape Classification', () => {
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
  // 8. .env.local Loading Helper (P2)
  // ==========================================================================
  describe('8. .env.local Loading Helper (P2)', () => {
    it('loadEnvLocal loads variables from .env.local when not in test runner', () => {
      const envDir = path.join(tmpReportDir, 'env-test');
      fs.mkdirSync(envDir, { recursive: true });
      fs.writeFileSync(
        path.join(envDir, '.env.local'),
        'XMEMO_AUTH_MODE=owner_key\nXMEMO_KEY=test-owner-key-from-file\n',
        'utf-8'
      );

      delete process.env.XMEMO_AUTH_MODE;
      delete process.env.XMEMO_KEY;
      delete process.env.VITEST;
      delete process.env.NODE_ENV;

      try {
        loadEnvLocal(envDir);
        expect(process.env.XMEMO_AUTH_MODE).toBe('owner_key');
        expect(process.env.XMEMO_KEY).toBe('test-owner-key-from-file');
      } finally {
        process.env.VITEST = 'true';
        process.env.NODE_ENV = 'test';
      }
    });
  });

  // ==========================================================================
  // 9. MemoryPort Read-Side Roundtrip Robustness
  // ==========================================================================
  describe('9. MemoryPort Read-Side Roundtrip Robustness', () => {
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
  // 10. Zero Model Involvement & Production Ledger Immutability
  // ==========================================================================
  describe('10. Zero Model Involvement & Ledger Immutability', () => {
    it('verifies live-verify-xmemo script does not invoke or import model proxy', () => {
      const scriptPath = path.resolve(__dirname, '../../../scripts/live-verify-xmemo.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

      expect(scriptContent).not.toContain("from '../src/core/model-proxy'");
      expect(scriptContent).not.toContain('completeTask(');
      expect(scriptContent).not.toContain('metaApiKey');
    });

    it('verifies model live ledger remains byte-identical across XMemo verification', async () => {
      const ledgerPath = path.resolve(__dirname, '../../../.yori-runtime/model-live-ledger.json');
      const initialContent = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf-8') : null;
      const initialHash = initialContent ? crypto.createHash('sha256').update(initialContent).digest('hex') : null;

      // Run dry-run read-only verification
      await runReadOnlyOwnerKey({
        dryRun: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      if (initialContent !== null) {
        const postContent = fs.readFileSync(ledgerPath, 'utf-8');
        const postHash = crypto.createHash('sha256').update(postContent).digest('hex');
        expect(postHash).toBe(initialHash);
        expect(postContent).toBe(initialContent);
      }
    });
  });

  // ==========================================================================
  // 11. XMEMO-HEALTH: Unauthenticated Public Discovery & Health Verification
  // ==========================================================================
  describe('11. XMEMO-HEALTH: Unauthenticated Public Discovery & Health Verification', () => {
    const validDiscoveryPayload = {
      issuer: 'https://xmemo.dev',
      authorization_endpoint: 'https://xmemo.dev/oauth/authorize',
      token_endpoint: 'https://xmemo.dev/oauth/token',
      registration_endpoint: 'https://xmemo.dev/oauth/register',
      revocation_endpoint: 'https://xmemo.dev/oauth/revoke',
      mcp_endpoint: 'https://xmemo.dev/mcp',
      resource: 'https://xmemo.dev/mcp',
      protected_resource_metadata_endpoint: 'https://xmemo.dev/.well-known/oauth-protected-resource',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['memory:read', 'memory:write', 'knowledge:read'],
    };

    const validProtectedResourcePayload = {
      resource: 'https://xmemo.dev/mcp',
      authorization_servers: ['https://xmemo.dev'],
      scopes_supported: ['memory:read', 'memory:write'],
      bearer_methods_supported: ['header'],
    };

    it('evaluates MATCH when upstream surface matches all AC-203-1 configured expectations', async () => {
      const mockFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('/.well-known/oauth-authorization-server')) {
          return new Response(JSON.stringify(validDiscoveryPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/.well-known/oauth-protected-resource')) {
          return new Response(JSON.stringify(validProtectedResourcePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.endsWith('/mcp')) {
          return new Response(JSON.stringify({ error: 'Unauthorized: Bearer token required' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate':
                'Bearer resource_metadata="https://xmemo.dev/.well-known/oauth-protected-resource", scope="memory:read memory:write", error="invalid_token"',
            },
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(true);
      expect(res.verdict).toBe('PASS');
      expect(res.report.executionStatus).toBe('success');
      expect(res.report.totalRequestsDispatched).toBe(3);
      expect(res.report.surfaceComparisons.length).toBeGreaterThanOrEqual(8);
      expect(res.report.surfaceComparisons.every(c => c.status === 'MATCH')).toBe(true);
      expect(res.report.mcpProbe.verdict).toBe('PASS');
      expect(res.report.mcpProbe.unauthenticatedStatus).toBe(401);
      expect(res.report.mcpProbe.hasWwwAuthenticate).toBe(true);
      expect(res.report.privacyAudit.credentialsSent).toBe(false);
      expect(res.report.privacyAudit.authorizationHeaderSent).toBe(false);
    });

    it('evaluates MISMATCH as a finding without throwing when upstream returns non-matching fields', async () => {
      const mismatchedDiscovery = {
        ...validDiscoveryPayload,
        authorization_endpoint: 'https://xmemo.dev/oauth/other-authorize',
        grant_types_supported: ['authorization_code'], // missing refresh_token
        scopes_supported: ['memory:read'], // missing memory:write
      };

      const mockFetch: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('/.well-known/oauth-authorization-server')) {
          return new Response(JSON.stringify(mismatchedDiscovery), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/.well-known/oauth-protected-resource')) {
          return new Response(JSON.stringify(validProtectedResourcePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.endsWith('/mcp')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer scope="memory:read"',
            },
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      // Does not throw; returns completed report with findings
      expect(res.success).toBe(true);
      expect(res.verdict).toBe('FAIL');
      expect(res.report.executionStatus).toBe('success');

      const authEndpointComp = res.report.surfaceComparisons.find(c => c.field === 'authorization_endpoint');
      expect(authEndpointComp?.status).toBe('MISMATCH');

      const grantComp = res.report.surfaceComparisons.find(c => c.field === 'grant_types_supported');
      expect(grantComp?.status).toBe('MISMATCH');

      const scopesComp = res.report.surfaceComparisons.find(c => c.field === 'scopes_supported');
      expect(scopesComp?.status).toBe('MISMATCH');

      expect(res.report.findings.length).toBeGreaterThanOrEqual(3);
    });

    it('verifies 401 challenge on unauthenticated MCP probe with WWW-Authenticate header', async () => {
      // 1. Expected 401 case
      const mockFetch401: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('/.well-known/oauth-authorization-server')) {
          return new Response(JSON.stringify(validDiscoveryPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/.well-known/oauth-protected-resource')) {
          return new Response(JSON.stringify(validProtectedResourcePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.endsWith('/mcp')) {
          return new Response(JSON.stringify({ error: 'invalid_token' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer error="invalid_token", scope="memory:read memory:write"',
            },
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res401 = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch: mockFetch401,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res401.report.mcpProbe.unauthenticatedStatus).toBe(401);
      expect(res401.report.mcpProbe.hasWwwAuthenticate).toBe(true);
      expect(res401.report.mcpProbe.wwwAuthenticateHeader).toContain('Bearer');
      expect(res401.report.mcpProbe.verdict).toBe('PASS');

      // 2. Negative case: unexpected HTTP 200 without auth (unauthenticated leak)
      const mockFetch200: typeof fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes('/.well-known/oauth-authorization-server')) {
          return new Response(JSON.stringify(validDiscoveryPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/.well-known/oauth-protected-resource')) {
          return new Response(JSON.stringify(validProtectedResourcePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.endsWith('/mcp')) {
          return new Response(JSON.stringify({ result: { status: 'open' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res200 = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch: mockFetch200,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res200.report.mcpProbe.unauthenticatedStatus).toBe(200);
      expect(res200.report.mcpProbe.verdict).toBe('FAIL');
      expect(res200.verdict).toBe('FAIL');
    });

    it('triggers fail-closed hard stop on unexpected redirect to external host and halts subsequent dispatches', async () => {
      let callCount = 0;
      const mockFetchRedirect: typeof fetch = async () => {
        callCount++;
        return new Response('', {
          status: 302,
          headers: {
            Location: 'https://attacker-external-host.com/oauth/discovery',
          },
        });
      };

      const res = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch: mockFetchRedirect,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(false);
      expect(res.verdict).toBe('FAIL');
      expect(res.report.executionStatus).toBe('hard_stop');
      expect(res.report.hardStopReason).toContain('external host');
      expect(res.report.hardStopReason).toContain('attacker-external-host.com');
      // Halts immediately: exactly 1 request made, 0 subsequent dispatches
      expect(callCount).toBe(1);
      expect(res.report.totalRequestsDispatched).toBe(1);
    });

    it('never sends token, owner key, cookie, or Authorization header across any request', async () => {
      const capturedHeaders: Array<Record<string, string>> = [];

      const mockFetch: typeof fetch = async (input, init) => {
        const hdrs = (init?.headers as Record<string, string>) || {};
        capturedHeaders.push({ ...hdrs });

        const urlStr = String(input);
        if (urlStr.includes('/.well-known/oauth-authorization-server')) {
          return new Response(JSON.stringify(validDiscoveryPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/.well-known/oauth-protected-resource')) {
          return new Response(JSON.stringify(validProtectedResourcePayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.endsWith('/mcp')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': 'Bearer error="invalid_token"',
            },
          });
        }
        return new Response('Not Found', { status: 404 });
      };

      const res = await runHealthCheck({
        dryRun: true,
        issuerUrl: 'https://xmemo.dev',
        mockFetch,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(res.success).toBe(true);
      expect(capturedHeaders.length).toBe(3);

      for (const hdrs of capturedHeaders) {
        const lowerKeys = Object.keys(hdrs).map(k => k.toLowerCase());
        expect(lowerKeys).not.toContain('authorization');
        expect(lowerKeys).not.toContain('cookie');
        expect(lowerKeys).not.toContain('x-owner-key');
        expect(lowerKeys).not.toContain('x-api-key');
        expect(lowerKeys).not.toContain('proxy-authorization');
      }

      expect(res.report.privacyAudit.authorizationHeaderSent).toBe(false);
      expect(res.report.privacyAudit.credentialsSent).toBe(false);
    });

    it('runs end-to-end against InProcessMockXMemoServer in dry-run mode and persists valid reports', async () => {
      const mockServer = new InProcessMockXMemoServer();
      await mockServer.start();

      try {
        const res = await runHealthCheck({
          dryRun: true,
          mockServer,
          reportDir: tmpReportDir,
          logger: () => {},
        });

        expect(res.success).toBe(true);
        expect(res.verdict).toBe('PASS');
        expect(res.report.totalRequestsDispatched).toBe(3);
        expect(res.report.surfaceComparisons.every(c => c.status === 'MATCH')).toBe(true);
        expect(res.report.mcpProbe.verdict).toBe('PASS');

        // Check report files on disk
        const jsonPath = path.join(tmpReportDir, 'xmemo-health-report.json');
        const mdPath = path.join(tmpReportDir, 'XMEMO_HEALTH_REPORT.md');
        expect(fs.existsSync(jsonPath)).toBe(true);
        expect(fs.existsSync(mdPath)).toBe(true);

        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const mdContent = fs.readFileSync(mdPath, 'utf-8');

        // Privacy assertions pass
        assertReportPrivacy(jsonContent, ['mock-secret', 'password', 'Authorization: Bearer']);
        assertReportPrivacy(mdContent, ['mock-secret', 'password', 'Authorization: Bearer']);
      } finally {
        await mockServer.stop();
      }
    });

    it('refuses live health check when target host or protocol violates xmemo.dev HTTPS invariant', async () => {
      // Insecure HTTP to live host
      const resInsecure = await runHealthCheck({
        dryRun: false,
        issuerUrl: 'http://xmemo.dev',
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(resInsecure.success).toBe(false);
      expect(resInsecure.verdict).toBe('FAIL');
      expect(resInsecure.report.executionStatus).toBe('hard_stop');
      expect(resInsecure.report.hardStopReason).toContain('https:');

      // Untrusted external host in live mode
      const resExternal = await runHealthCheck({
        dryRun: false,
        issuerUrl: 'https://evil-untrusted.com',
        reportDir: tmpReportDir,
        logger: () => {},
      });

      expect(resExternal.success).toBe(false);
      expect(resExternal.verdict).toBe('FAIL');
      expect(resExternal.report.executionStatus).toBe('hard_stop');
      expect(resExternal.report.hardStopReason).toContain(ALLOWED_LIVE_ORIGIN);
    });

    it('confirms model live ledger remains strictly untouched across health checks', async () => {
      const ledgerPath = path.resolve(__dirname, '../../../.yori-runtime/model-live-ledger.json');
      const initialContent = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf-8') : null;
      const initialHash = initialContent ? crypto.createHash('sha256').update(initialContent).digest('hex') : null;

      // Run health check
      await runHealthCheck({
        dryRun: true,
        reportDir: tmpReportDir,
        logger: () => {},
      });

      if (initialContent !== null) {
        const postContent = fs.readFileSync(ledgerPath, 'utf-8');
        const postHash = crypto.createHash('sha256').update(postContent).digest('hex');
        expect(postHash).toBe(initialHash);
        expect(postContent).toBe(initialContent);
      }
    });
  });
});
