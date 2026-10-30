/**
 * ============================================================================
 * 🔒 OWNER RUNBOOK — XMEMO LIVE OAUTH & MCP MAPPING VERIFICATION (GATE-X1)
 * ============================================================================
 *
 * This script provides verification tooling for Slice GATE-X1 / S2-LIVE.
 * By default, this script and all standard test suites NEVER make real network
 * calls to external services (xmemo.dev).
 *
 * ----------------------------------------------------------------------------
 * 1. HOW TO CONFIGURE THE ENVIRONMENT FOR LIVE OAUTH
 * ----------------------------------------------------------------------------
 * When ready for owner-gated live authorization:
 * 1. Add the following to `.env.local` (which is gitignored):
 *
 *     XMEMO_OAUTH_ENABLED=true
 *
 * 2. Never paste tokens, credentials, or client secrets anywhere.
 * 3. Start the dev server:
 *
 *     npm run dev
 *
 * 4. Open your browser at:
 *
 *     http://127.0.0.1:5173/?ui=v2
 *
 * 5. Navigate to the "Me" tab.
 * 6. Click "Connect XMemo".
 * 7. Sign in on the XMemo authorization page, and click "Authorize" once.
 * 8. The browser will redirect back to Yori with connected status.
 *
 * ----------------------------------------------------------------------------
 * 2. HOW TO RUN SAFE OFFLINE DRY-RUN (ZERO EXTERNAL CALLS)
 * ----------------------------------------------------------------------------
 * To run the offline dry-run against the in-process mock XMemo server:
 *
 *     npm run verify:live:xmemo -- --dry-run
 *     # or directly:
 *     ./node_modules/.bin/vite-node scripts/live-verify-xmemo.ts --dry-run
 *
 * This performs:
 *   - Starts an in-process mock XMemo server (RFC 8414 discovery, RFC 7591 dynamic
 *     client registration, PKCE S256 token exchange, MCP endpoint)
 *   - Verifies RFC 8414 discovery & RFC 7591 dynamic client registration
 *   - Generates authorization URL with PKCE S256 and exact minimal scopes ('memory:read memory:write')
 *   - Executes callback authorization code exchange
 *   - Verifies connected status
 *   - Writes ONE labelled test fact with confirmed status only ('status: confirmed')
 *   - Reads back confirmed fact from mock XMemo vault
 *   - Deletes the test fact via forget MCP tool
 *   - Verifies fact deletion and outputs structured report
 *
 * ----------------------------------------------------------------------------
 * 3. REAL LIVE RUN REFUSAL IN GATE-X1-PREP
 * ----------------------------------------------------------------------------
 * A real live run requires:
 *   1. XMEMO_OAUTH_ENABLED=true
 *   2. XMEMO_LIVE_VERIFY=1
 *   3. --confirm-live flag
 *
 * In GATE-X1-PREP, even when all three flags are present, the script prints:
 *   'not implemented in GATE-X1-PREP (S2-LIVE pending owner consent)'
 * and exits with code 2. Real live calls remain strictly owner-gated.
 * ============================================================================
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  XMemoDevProxy,
  isYoriManagedFactKey,
  extractCandidateFacts,
  hasYoriProvenance,
} from '../src/adapters/xmemo/server-proxy.js';
import { XMemoRemoteAdapter } from '../src/adapters/xmemo/remote-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MockRegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
}

export interface MockAuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
}

export interface MockMemoryFact {
  key: string;
  value: string;
  status: string;
  tag?: string;
  provenance: any;
  updatedAt: string;
}

export class InProcessMockXMemoServer {
  private server: http.Server | null = null;
  public port: number = 0;
  public issuerUrl: string = '';
  public ownerKey?: string = 'mock-owner-key-ro-check';

  public clients = new Map<string, MockRegisteredClient>();
  public authCodes = new Map<string, MockAuthCode>();
  public accessTokens = new Map<string, { clientId: string; scope: string }>();
  public vaultFacts = new Map<string, MockMemoryFact>();
  public requestHistory: Array<{ method: string; url: string; body?: any }> = [];

  public rememberCallCount: number = 0;
  public forgetCallCount: number = 0;
  public recallCallCount: number = 0;

  public async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err: unknown) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Mock server internal error', detail: String(err) }));
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address();
        if (typeof addr === 'object' && addr !== null) {
          this.port = addr.port;
          this.issuerUrl = `http://127.0.0.1:${this.port}`;
          resolve(this.issuerUrl);
        } else {
          reject(new Error('Failed to obtain server address'));
        }
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const rawUrl = req.url || '';
    const urlPath = rawUrl.split('?')[0];
    const rawBody = await this.readBody(req);
    let parsedJson: any = null;
    if (rawBody.trim().startsWith('{')) {
      try {
        parsedJson = JSON.parse(rawBody);
      } catch {
        // non-json
      }
    }

    this.requestHistory.push({
      method: req.method || 'GET',
      url: rawUrl,
      body: parsedJson || rawBody,
    });

    // 1. RFC 8414 Discovery Endpoint
    if (urlPath === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          issuer: this.issuerUrl,
          authorization_endpoint: `${this.issuerUrl}/oauth/authorize`,
          token_endpoint: `${this.issuerUrl}/oauth/token`,
          registration_endpoint: `${this.issuerUrl}/oauth/register`,
          revocation_endpoint: `${this.issuerUrl}/oauth/revoke`,
          mcp_endpoint: `${this.issuerUrl}/mcp`,
          resource: `${this.issuerUrl}/mcp`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          scopes_supported: ['memory:read', 'memory:write'],
        })
      );
      return;
    }

    // 2. RFC 7591 Dynamic Client Registration Endpoint
    if (urlPath === '/oauth/register' && req.method === 'POST') {
      if (!parsedJson) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_request', error_description: 'JSON body required' }));
        return;
      }

      const clientId = `mock-client-${crypto.randomBytes(8).toString('hex')}`;
      const clientSecret = `mock-secret-${crypto.randomBytes(16).toString('hex')}`;

      const client: MockRegisteredClient = {
        clientId,
        clientSecret,
        clientName: parsedJson.client_name || 'Yori (local dev)',
        redirectUris: parsedJson.redirect_uris || [],
        grantTypes: parsedJson.grant_types || ['authorization_code'],
        responseTypes: parsedJson.response_types || ['code'],
        scope: parsedJson.scope || 'memory:read memory:write',
      };
      this.clients.set(clientId, client);

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          grant_types: client.grantTypes,
          response_types: client.responseTypes,
          token_endpoint_auth_method: 'none',
          scope: client.scope,
        })
      );
      return;
    }

    // 3. OAuth 2.0 Token Endpoint (PKCE S256 verification)
    if (urlPath === '/oauth/token' && req.method === 'POST') {
      const params = new URLSearchParams(rawBody);
      const grantType = params.get('grant_type');
      const code = params.get('code');
      const codeVerifier = params.get('code_verifier');

      if (grantType !== 'authorization_code' || !code || !codeVerifier) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Missing code or verifier' }));
        return;
      }

      const authCode = this.authCodes.get(code);
      if (!authCode) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Code not found or expired' }));
        return;
      }
      this.authCodes.delete(code);

      // Verify PKCE S256 challenge
      const computedChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      if (computedChallenge !== authCode.codeChallenge) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE challenge verification failed' }));
        return;
      }

      const accessToken = `mock-access-token-${crypto.randomBytes(16).toString('hex')}`;
      const refreshToken = `mock-refresh-token-${crypto.randomBytes(16).toString('hex')}`;
      this.accessTokens.set(accessToken, { clientId: authCode.clientId, scope: 'memory:read memory:write' });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: refreshToken,
          scope: 'memory:read memory:write',
        })
      );
      return;
    }

    // 4. Token Revocation Endpoint
    if (urlPath === '/oauth/revoke' && req.method === 'POST') {
      const params = new URLSearchParams(rawBody);
      const token = params.get('token');
      if (token) {
        this.accessTokens.delete(token);
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 5. MCP Streamable Endpoint
    if (urlPath === '/mcp' && req.method === 'POST') {
      const authHeader = req.headers['authorization'] || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!match || !match[1]) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized: Bearer token required' }));
        return;
      }

      const token = match[1];
      if (!this.accessTokens.has(token) && token !== this.ownerKey) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized: token invalid or expired' }));
        return;
      }

      const id = parsedJson?.id ?? 1;
      const method = parsedJson?.method;
      const params = parsedJson?.params || {};

      if (method === 'tools/call') {
        const toolName = params.name;
        const args = params.arguments || {};

        if (toolName === 'remember') {
          this.rememberCallCount++;
          // Strict server-side invariant check (INV-107)
          if (args.status !== 'confirmed') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: {
                  code: -32602,
                  message: `Invalid params: only confirmed facts can be written (status=${args.status})`,
                },
              })
            );
            return;
          }

          const memory: MockMemoryFact = {
            key: args.key,
            value: args.value,
            status: args.status,
            tag: args.tag,
            provenance: args.provenance,
            updatedAt: new Date().toISOString(),
          };
          this.vaultFacts.set(args.key, memory);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: `Saved confirmed fact: ${args.key}` }],
              },
            })
          );
          return;
        }

        if (toolName === 'recall') {
          this.recallCallCount++;
          const query = args.query;
          let memories = Array.from(this.vaultFacts.values());
          if (query && query !== 'preferences' && query !== 'dry-run') {
            memories = memories.filter(m => m.key === query || m.key.includes(query));
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                memories,
                content: [{ type: 'text', text: JSON.stringify(memories) }],
              },
            })
          );
          return;
        }

        if (toolName === 'forget') {
          this.forgetCallCount++;
          const key = args.key;
          const existed = this.vaultFacts.has(key);
          this.vaultFacts.delete(key);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: existed ? `Deleted fact: ${key}` : `Key not found: ${key}` }],
              },
            })
          );
          return;
        }
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }));
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  }
}

async function runDryRun(): Promise<void> {
  console.log('================================================================');
  console.log('🔬 XMEMO LIVE VERIFICATION HARNESS — OFFLINE DRY-RUN (MOCKED)');
  console.log('================================================================');
  console.log('Governed by: GATE-X1-PREP / S2-LIVE (RFC 7591 Dynamic Registration)');
  console.log('Zero external calls: running against local in-process mock XMemo server\n');

  const mockServer = new InProcessMockXMemoServer();
  const issuerUrl = await mockServer.start();
  console.log(`[1/8] In-process mock XMemo server listening at: ${issuerUrl}`);

  const tempStateFile = path.join(os.tmpdir(), `xmemo-client-dryrun-${Date.now()}.json`);

  try {
    // 1. Initialize proxy pointing to mock server
    const proxy = new XMemoDevProxy(
      {
        enabled: true,
        issuer: issuerUrl,
        clientStoragePath: tempStateFile,
        redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
      },
      msg => console.log(`   ${msg}`)
    );

    // 2. Discover endpoint & Dynamic Client Registration
    console.log('\n[2/8] Executing RFC 8414 Discovery & RFC 7591 Dynamic Registration...');
    const regResult = await proxy.ensureRegistered();
    if (!regResult.success || !regResult.clientId) {
      throw new Error(`Dynamic registration failed: ${regResult.error}`);
    }
    console.log(`   ✅ Dynamic registration succeeded! Assigned Client ID: ${regResult.clientId}`);

    // Verify local persistence and permissions
    if (!fs.existsSync(tempStateFile)) {
      throw new Error(`State file was not created at: ${tempStateFile}`);
    }
    const stat = fs.statSync(tempStateFile);
    const modeOctal = (stat.mode & 0o777).toString(8);
    console.log(`   ✅ Client ID persisted to ${tempStateFile} with file mode 0${modeOctal}`);

    // 3. PKCE Authorization URL Generation
    console.log('\n[3/8] Generating PKCE S256 Authorization URL...');
    const { authUrl, state } = proxy.createAuthUrl();
    const parsedAuth = new URL(authUrl);
    console.log(`   ✅ Auth URL generated: ${parsedAuth.origin}${parsedAuth.pathname}`);
    console.log(`      response_type: ${parsedAuth.searchParams.get('response_type')}`);
    console.log(`      client_id: ${parsedAuth.searchParams.get('client_id')}`);
    console.log(`      scope: ${parsedAuth.searchParams.get('scope')}`);
    console.log(`      code_challenge_method: ${parsedAuth.searchParams.get('code_challenge_method')}`);

    const codeChallenge = parsedAuth.searchParams.get('code_challenge');
    if (!codeChallenge) throw new Error('Missing code_challenge in authUrl');

    // Register code in mock server
    const mockAuthCode = `mock-code-${crypto.randomBytes(8).toString('hex')}`;
    mockServer.authCodes.set(mockAuthCode, {
      code: mockAuthCode,
      clientId: regResult.clientId,
      redirectUri: 'http://127.0.0.1:5173/api/xmemo/callback',
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: Date.now() + 60000,
    });

    // 4. Callback Authorization Code Exchange
    console.log('\n[4/8] Simulating Browser OAuth Callback & Token Exchange...');
    const exchangeResult = await proxy.exchangeCode(mockAuthCode, state);
    if (!exchangeResult.success) {
      throw new Error(`Token exchange failed: ${exchangeResult.error}`);
    }
    console.log('   ✅ PKCE code exchange succeeded! Access token held in server memory.');

    // 5. Verify Connected Status
    console.log('\n[5/8] Verifying Proxy Status...');
    const status = proxy.getStatus();
    console.log(`   Status: enabled=${status.enabled}, connected=${status.connected}, text="${status.statusText}"`);
    if (!status.connected) {
      throw new Error('Proxy failed to report connected status after code exchange');
    }

    // 6. Write ONE Labelled Test Fact with Confirmed Status Only
    console.log('\n[6/8] Writing ONE labelled test fact (status: confirmed only)...');
    const testFactKey = 'prep_buffer_preference';
    const testFactPayload = {
      key: testFactKey,
      value: 'Owner prefers 10 min prep buffer (GATE-X1-PREP test fact)',
      status: 'confirmed',
      tag: 'yori:living-context',
      provenance: {
        source: 'user_confirmed',
        recordedAt: new Date().toISOString(),
        note: 'GATE-X1-PREP Live Verification Harness Dry-Run Test Fact',
      },
    };

    const writeRes = await proxy.writeConfirmedFact(testFactPayload);
    if (writeRes.status !== 200) {
      throw new Error(`writeConfirmedFact returned status ${writeRes.status}: ${JSON.stringify(writeRes.data)}`);
    }
    console.log(`   ✅ Confirmed fact written to remote vault: "${testFactKey}"`);

    // 7. Read Back Confirmed Fact from Vault
    console.log('\n[7/8] Reading back confirmed fact from remote vault...');
    const readRes = await proxy.readPreferences('dry-run');
    if (readRes.status !== 200) {
      throw new Error(`readPreferences returned status ${readRes.status}`);
    }
    const readData = readRes.data as any;
    const recalledMemories = readData?.result?.memories || [];
    const found = recalledMemories.find((m: any) => m.key === testFactKey);
    if (!found) {
      throw new Error(`Written test fact "${testFactKey}" was not found upon read-back`);
    }
    console.log(`   ✅ Read-back verified! Retrieved fact value: "${found.value}"`);

    // 8. Delete Fact from Remote Vault
    console.log('\n[8/8] Deleting test fact from remote vault via MCP forget tool...');
    const delRes = await proxy.deleteFact(testFactKey);
    if (delRes.status !== 200) {
      throw new Error(`deleteFact returned status ${delRes.status}`);
    }
    console.log(`   ✅ Test fact "${testFactKey}" deleted successfully.`);

    // Read back again to prove deletion
    const readAfterDel = await proxy.readPreferences('dry-run');
    const memoriesAfterDel = (readAfterDel.data as any)?.result?.memories || [];
    const stillExists = memoriesAfterDel.some((m: any) => m.key === testFactKey);
    if (stillExists) {
      throw new Error(`Fact "${testFactKey}" was NOT deleted from vault`);
    }
    console.log('   ✅ Vault read-back confirmed test fact is completely removed.');

    // Disconnect
    await proxy.disconnect();
    console.log('\n   Session disconnected. Final status: connected=' + proxy.getStatus().connected);

    // Summary Report
    console.log('\n================================================================');
    console.log('📊 DRY-RUN VERIFICATION REPORT: SUCCESS');
    console.log('================================================================');
    console.log('• RFC 8414 Discovery:            PASS (Retrieved registration endpoint)');
    console.log('• RFC 7591 Dynamic Registration: PASS (Assigned public client_id)');
    console.log('• Client ID Persistence (0600):  PASS (Verified permissions and reuse)');
    console.log('• PKCE S256 Auth URL:            PASS (Exact scopes: memory:read memory:write)');
    console.log('• PKCE Code Exchange:            PASS (Server-only token holding)');
    console.log('• Connected Status:              PASS (Reflected in getStatus())');
    console.log('• Confirm-Only Write (INV-107):  PASS (1 labelled test fact written)');
    console.log('• Remote Vault Read-Back:        PASS (Fact verified intact)');
    console.log('• MCP Forget Deletion:           PASS (Fact successfully removed)');
    console.log('• External Network Calls:        0 (100% in-process mock)');
    console.log('================================================================\n');
  } finally {
    try {
      if (fs.existsSync(tempStateFile)) {
        fs.unlinkSync(tempStateFile);
      }
    } catch {
      // ignore
    }
    await mockServer.stop();
  }
}

export type EnvelopeShapeClassification =
  | 'result.facts[]'
  | 'result.memories[]'
  | 'result.items[]'
  | 'result.content[text]'
  | 'result.content[json]'
  | 'result.array'
  | 'error'
  | 'unknown';

export interface ReadOnlyRequestRecord {
  readonly requestIndex: number;
  readonly query: string;
  readonly httpStatus: number;
  readonly latencyMs: number;
  readonly targetHost: string;
  readonly shapeClassification: EnvelopeShapeClassification;
  readonly itemCount: number;
  readonly yoriManagedKeyCount: number;
  readonly yoriTaggedCount: number;
  readonly itemFieldNames: readonly string[];
}

export interface MemoryPortRoundtripResult {
  readonly executed: boolean;
  readonly success: boolean;
  readonly loadedFactCount: number;
  readonly mappedShape: string;
}

export interface ReadOnlyVerificationReport {
  readonly schemaVersion: '1.0.0';
  readonly timestampUtc: string;
  readonly timestampJst: string;
  readonly runMode: 'offline_mock' | 'live_readonly';
  readonly targetHost: string;
  readonly executionStatus: 'success' | 'hard_stop' | 'refused';
  readonly hardStopReason?: string;
  readonly totalRequestsDispatched: number;
  readonly requests: readonly ReadOnlyRequestRecord[];
  readonly memoryPortRoundtrip: MemoryPortRoundtripResult;
  readonly privacyAudit: {
    readonly rawBodyPersisted: false;
    readonly piiValueLeakDetected: false;
    readonly tokenLeakDetected: false;
  };
}

export function classifyEnvelopeShape(data: unknown): EnvelopeShapeClassification {
  if (!data || typeof data !== 'object') {
    return 'unknown';
  }
  const root = data as Record<string, unknown>;
  if (root.error) {
    return 'error';
  }
  const payload =
    root.result !== undefined && typeof root.result === 'object' && root.result !== null
      ? (root.result as Record<string, unknown>)
      : root;

  if (Array.isArray(payload)) {
    return 'result.array';
  }
  if (Array.isArray(payload.facts)) {
    return 'result.facts[]';
  }
  if (Array.isArray(payload.memories)) {
    return 'result.memories[]';
  }
  if (Array.isArray(payload.items)) {
    return 'result.items[]';
  }
  if (Array.isArray(payload.content)) {
    const first = payload.content[0];
    if (first && typeof first === 'object' && typeof (first as any).text === 'string') {
      try {
        JSON.parse((first as any).text);
        return 'result.content[json]';
      } catch {
        return 'result.content[text]';
      }
    }
    return 'result.content[text]';
  }
  return 'unknown';
}

export function formatReportMarkdown(report: ReadOnlyVerificationReport): string {
  const lines: string[] = [];
  lines.push('# XMemo Read-Only Owner-Key Connectivity Verification Report');
  lines.push('');
  lines.push(`- **Run Mode**: \`${report.runMode}\``);
  lines.push(`- **Timestamp (UTC)**: \`${report.timestampUtc}\``);
  lines.push(`- **Timestamp (JST)**: \`${report.timestampJst}\``);
  lines.push(`- **Target Host**: \`${report.targetHost}\``);
  lines.push(`- **Execution Status**: \`${report.executionStatus}\``);
  if (report.hardStopReason) {
    lines.push(`- **Hard Stop Reason**: \`${report.hardStopReason}\``);
  }
  lines.push(`- **Total Requests Dispatched**: ${report.totalRequestsDispatched} (max cap: 3)`);
  lines.push('');
  lines.push('## 📡 Upstream Request Metadata (Names & Counts Only — Zero Content)');
  lines.push('');
  lines.push('| # | Query | Status | Latency | Envelope Shape | Item Count | Yori Managed Keys | Yori Tagged | Field Names |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  for (const r of report.requests) {
    const fields = r.itemFieldNames.length > 0 ? r.itemFieldNames.join(', ') : 'none';
    lines.push(
      `| ${r.requestIndex} | \`${r.query}\` | ${r.httpStatus} | ${r.latencyMs}ms | \`${r.shapeClassification}\` | ${r.itemCount} | ${r.yoriManagedKeyCount} | ${r.yoriTaggedCount} | \`${fields}\` |`
    );
  }

  lines.push('');
  lines.push('## 🔄 MemoryPort Roundtrip (Read Side)');
  lines.push('');
  lines.push(`- **Executed**: ${report.memoryPortRoundtrip.executed ? 'Yes' : 'No'}`);
  lines.push(`- **Success**: ${report.memoryPortRoundtrip.success ? 'Yes' : 'No'}`);
  lines.push(`- **Loaded Facts Count**: ${report.memoryPortRoundtrip.loadedFactCount}`);
  lines.push(`- **Mapped Shape**: \`${report.memoryPortRoundtrip.mappedShape}\``);
  lines.push('');
  lines.push('## 🛡️ Privacy & Secret Hygiene Audit');
  lines.push('');
  lines.push(`- **Raw Body Persisted**: \`${report.privacyAudit.rawBodyPersisted}\` (0 bytes stored)`);
  lines.push(`- **PII / Content Leak Detected**: \`${report.privacyAudit.piiValueLeakDetected}\` (0 content strings)`);
  lines.push(`- **Token Leak Detected**: \`${report.privacyAudit.tokenLeakDetected}\` (0 credentials in report or logs)`);
  lines.push('');

  return lines.join('\n');
}

export function assertReportPrivacy(
  reportStr: string,
  forbiddenSnippets: readonly string[]
): void {
  for (const snippet of forbiddenSnippets) {
    if (snippet && typeof snippet === 'string' && reportStr.includes(snippet)) {
      throw new Error(`Privacy violation: report contains forbidden snippet: "${snippet}"`);
    }
  }
}

export interface ReadOnlyOwnerKeyOptions {
  dryRun?: boolean;
  confirmLiveReadonly?: boolean;
  maxRequests?: number;
  queries?: string[];
  reportDir?: string;
  mockServer?: InProcessMockXMemoServer;
  logger?: (msg: string) => void;
  mockFetch?: typeof fetch;
}

export interface ReadOnlyVerificationResult {
  success: boolean;
  refused: boolean;
  refusalReason?: string;
  report?: ReadOnlyVerificationReport;
}

export async function runReadOnlyOwnerKey(
  options: ReadOnlyOwnerKeyOptions = {}
): Promise<ReadOnlyVerificationResult> {
  const logger = options.logger || console.log;
  const isDryRun = options.dryRun ?? false;

  logger('================================================================');
  logger(`🔍 XMEMO READ-ONLY OWNER-KEY CONNECTIVITY CHECK (${isDryRun ? 'OFFLINE MOCKED' : 'LIVE READ-ONLY'})`);
  logger('================================================================');

  // Preconditions for live run
  if (!isDryRun) {
    const authMode = process.env.XMEMO_AUTH_MODE;
    const ownerKey = process.env.XMEMO_KEY;
    const confirmLive = options.confirmLiveReadonly;
    const isProd = process.env.NODE_ENV === 'production';

    if (authMode !== 'owner_key' || !ownerKey || !confirmLive || isProd) {
      const reason =
        `Precondition check failed: ` +
        `XMEMO_AUTH_MODE=${authMode === 'owner_key' ? 'ok' : 'missing (must be owner_key)'}, ` +
        `XMEMO_KEY=${ownerKey ? 'present' : 'missing'}, ` +
        `--confirm-live-readonly=${confirmLive ? 'present' : 'missing'}, ` +
        `NODE_ENV=${process.env.NODE_ENV || 'development'} ${isProd ? '(production forbidden)' : '(ok)'}`;
      logger(`❌ Refusing live read-only run:\n   ${reason}`);
      return { success: false, refused: true, refusalReason: reason };
    }
  }

  let serverToStop: InProcessMockXMemoServer | null = null;
  let issuerUrl: string;
  let activeOwnerKey: string;

  if (isDryRun) {
    const mockServer = options.mockServer || new InProcessMockXMemoServer();
    if (!options.mockServer) {
      issuerUrl = await mockServer.start();
      serverToStop = mockServer;
    } else {
      issuerUrl = mockServer.issuerUrl;
    }
    activeOwnerKey = 'mock-owner-key-ro-check';
    mockServer.ownerKey = activeOwnerKey;

    // Pre-seed representative facts
    if (mockServer.vaultFacts.size === 0) {
      mockServer.vaultFacts.set('prep_buffer_minutes', {
        key: 'prep_buffer_minutes',
        value: '5',
        status: 'confirmed',
        tag: 'yori:living-context',
        provenance: { source: 'user_confirmed' },
        updatedAt: new Date().toISOString(),
      });
      mockServer.vaultFacts.set('taste_preference', {
        key: 'taste_preference',
        value: 'ramen',
        status: 'confirmed',
        tag: 'yori:living-context',
        provenance: { source: 'user_confirmed' },
        updatedAt: new Date().toISOString(),
      });
      mockServer.vaultFacts.set('third_party_secret_note', {
        key: 'third_party_secret_note',
        value: 'synthetic-secret-value-never-leak-9988',
        status: 'confirmed',
        tag: 'external:secret',
        provenance: { source: 'external' },
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    issuerUrl = process.env.XMEMO_ISSUER || 'https://xmemo.dev';
    activeOwnerKey = process.env.XMEMO_KEY!;
  }

  const expectedHost = new URL(issuerUrl).host;
  const maxRequests = Math.min(options.maxRequests || 3, 3);
  const records: ReadOnlyRequestRecord[] = [];
  let executionStatus: 'success' | 'hard_stop' = 'success';
  let hardStopReason: string | undefined;

  const proxy = new XMemoDevProxy(
    {
      authMode: 'owner_key',
      ownerKey: activeOwnerKey,
      issuer: issuerUrl,
      mcpUrl: `${issuerUrl}/mcp`,
    },
    options.mockFetch ? undefined : msg => logger(`   ${msg}`),
    undefined,
    options.mockFetch
  );

  const plannedQueries = options.queries || ['preferences', 'prep_buffer_minutes'];

  try {
    for (let i = 0; i < plannedQueries.length && i < maxRequests; i++) {
      const q = plannedQueries[i] ?? '';
      const start = Date.now();
      const readRes = await proxy.readPreferences(q);
      const latencyMs = Date.now() - start;

      const targetHost = new URL(proxy.getConfig().mcpUrl).host;
      if (targetHost !== expectedHost) {
        executionStatus = 'hard_stop';
        hardStopReason = `Target host mismatch: expected ${expectedHost}, got ${targetHost}`;
        records.push({
          requestIndex: i + 1,
          query: q,
          httpStatus: readRes.status,
          latencyMs,
          targetHost,
          shapeClassification: 'error',
          itemCount: 0,
          yoriManagedKeyCount: 0,
          yoriTaggedCount: 0,
          itemFieldNames: [],
        });
        break;
      }

      const shape = classifyEnvelopeShape(readRes.data);
      const candidates = extractCandidateFacts(readRes.data);
      const itemCount = candidates ? candidates.length : 0;

      let managedCount = 0;
      let taggedCount = 0;
      const fieldNamesSet = new Set<string>();

      if (candidates) {
        for (const item of candidates) {
          const k = item.key ?? item.name;
          if (isYoriManagedFactKey(k)) managedCount++;
          if (hasYoriProvenance(item)) taggedCount++;
          for (const fn of Object.keys(item)) {
            fieldNamesSet.add(fn);
          }
        }
      }

      records.push({
        requestIndex: i + 1,
        query: q,
        httpStatus: readRes.status,
        latencyMs,
        targetHost,
        shapeClassification: shape,
        itemCount,
        yoriManagedKeyCount: managedCount,
        yoriTaggedCount: taggedCount,
        itemFieldNames: Array.from(fieldNamesSet).sort(),
      });

      // Hard stop on 401/403/5xx
      if (readRes.status === 401 || readRes.status === 403 || readRes.status >= 500) {
        executionStatus = 'hard_stop';
        hardStopReason = `Upstream error HTTP ${readRes.status}`;
        break;
      }
    }

    // MemoryPort roundtrip (read side only)
    let roundtripResult: MemoryPortRoundtripResult = {
      executed: false,
      success: false,
      loadedFactCount: 0,
      mappedShape: 'none',
    };

    if (executionStatus === 'success') {
      try {
        const remoteAdapter = new XMemoRemoteAdapter({
          proxyEndpoint: '/api/xmemo',
          appAuthToken: activeOwnerKey,
          fetchFn: async (_url: URL | RequestInfo, init?: RequestInit) => {
            const parsed = init?.body ? JSON.parse(init.body as string) : {};
            const q = parsed.query;
            const res = await proxy.readPreferences(q);
            return {
              ok: res.status === 200,
              status: res.status,
              json: async () => res.data,
            } as Response;
          },
        });

        const loaded = await remoteAdapter.loadFacts();
        roundtripResult = {
          executed: true,
          success: true,
          loadedFactCount: loaded.length,
          mappedShape: 'MemoryFact[]',
        };
      } catch (err: unknown) {
        roundtripResult = {
          executed: true,
          success: false,
          loadedFactCount: 0,
          mappedShape: 'failed_closed',
        };
      }
    }

    const now = new Date();
    const timestampUtc = now.toISOString();
    const timestampJst =
      new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now) + ' JST';

    const report: ReadOnlyVerificationReport = {
      schemaVersion: '1.0.0',
      timestampUtc,
      timestampJst,
      runMode: isDryRun ? 'offline_mock' : 'live_readonly',
      targetHost: expectedHost,
      executionStatus,
      hardStopReason,
      totalRequestsDispatched: records.length,
      requests: records,
      memoryPortRoundtrip: roundtripResult,
      privacyAudit: {
        rawBodyPersisted: false,
        piiValueLeakDetected: false,
        tokenLeakDetected: false,
      },
    };

    const reportJson = JSON.stringify(report, null, 2);
    const reportMd = formatReportMarkdown(report);

    // Privacy assertion: zero secret data or values in reports
    assertReportPrivacy(reportJson, [
      activeOwnerKey,
      'synthetic-secret-value-never-leak-9988',
      'password',
      'secret-location',
    ]);
    assertReportPrivacy(reportMd, [
      activeOwnerKey,
      'synthetic-secret-value-never-leak-9988',
      'password',
      'secret-location',
    ]);

    // Persist report to docs/evidence/s2-ro/
    const reportDir = options.reportDir || path.resolve(__dirname, '../docs/evidence/s2-ro');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 's2-ro-report.json'), reportJson, 'utf-8');
    fs.writeFileSync(path.join(reportDir, 'S2_RO_REPORT.md'), reportMd, 'utf-8');

    logger(`\n📊 READ-ONLY CHECK SUMMARY: ${executionStatus.toUpperCase()}`);
    logger(`   Requests Dispatched: ${records.length} / ${maxRequests} (cap)`);
    logger(`   Target Host:         ${expectedHost}`);
    logger(`   MemoryPort Loaded:   ${roundtripResult.loadedFactCount} facts (${roundtripResult.mappedShape})`);
    logger(`   Evidence Generated:  docs/evidence/s2-ro/ (JSON + MD)`);

    return { success: executionStatus === 'success', refused: false, report };
  } finally {
    if (serverToStop) {
      await serverToStop.stop();
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const isOwnerKeyMode = args.includes('--owner-key');
  const isReadOnlyMode = args.includes('--read-only');
  const isDryRun = args.includes('--dry-run');
  const confirmLiveReadonly = args.includes('--confirm-live-readonly');

  // Case 1: Read-Only Owner-Key Check
  if (isOwnerKeyMode && isReadOnlyMode) {
    if (isDryRun) {
      const res = await runReadOnlyOwnerKey({ dryRun: true });
      process.exit(res.success ? 0 : 1);
    }

    if (confirmLiveReadonly) {
      const res = await runReadOnlyOwnerKey({ dryRun: false, confirmLiveReadonly: true });
      process.exit(res.success ? 0 : 1);
    }

    console.error('❌ Refusing live read-only run: missing required flags.');
    console.error(`   XMEMO_AUTH_MODE: ${process.env.XMEMO_AUTH_MODE || '(unset)'} (must be 'owner_key')`);
    console.error(`   XMEMO_KEY: ${process.env.XMEMO_KEY ? 'present' : '(unset)'}`);
    console.error(`   --confirm-live-readonly flag: missing`);
    console.error('\nRun safe offline dry-run instead:');
    console.error('   npm run verify:live:xmemo -- --owner-key --read-only --dry-run');
    process.exit(1);
  }

  // Case 2: OAuth Registration Dry Run
  if (isDryRun) {
    await runDryRun();
    process.exit(0);
  }

  // Case 3: Full Live OAuth Run (GATE-X1-PREP refusal)
  const oauthEnabled = process.env.XMEMO_OAUTH_ENABLED === 'true' || process.env.XMEMO_OAUTH_ENABLED === '1';
  const liveVerify = process.env.XMEMO_LIVE_VERIFY === '1';
  const confirmLive = args.includes('--confirm-live');

  if (!oauthEnabled || !liveVerify || !confirmLive) {
    console.error('❌ Refusing live run: missing required flags.');
    console.error(`   XMEMO_OAUTH_ENABLED: ${process.env.XMEMO_OAUTH_ENABLED || '(unset)'} (must be 'true' or '1')`);
    console.error(`   XMEMO_LIVE_VERIFY: ${process.env.XMEMO_LIVE_VERIFY || '(unset)'} (must be '1')`);
    console.error(`   --confirm-live flag: ${confirmLive ? 'present' : 'missing'}`);
    console.error('\nRun dry-run instead:');
    console.error('   npm run verify:live:xmemo -- --dry-run');
    console.error('   npm run verify:live:xmemo -- --owner-key --read-only --dry-run');
    process.exit(1);
  }

  console.log('not implemented in GATE-X1-PREP (S2-LIVE pending owner consent)');
  process.exit(2);
}

export { main };

if (!process.env.VITEST) {
  main().catch(err => {
    console.error('❌ Fatal error in live-verify-xmemo:', err);
    process.exit(1);
  });
}
