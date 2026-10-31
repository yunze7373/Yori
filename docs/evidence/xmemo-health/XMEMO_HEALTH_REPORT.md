# XMemo Public Authorization & Health Check Report (XMEMO-HEALTH)

- **Run Mode**: `live_health`
- **Timestamp (UTC)**: `2026-10-31T03:37:50.274Z`
- **Timestamp (JST)**: `2026/10/31 12:37:50 JST`
- **Target Host**: `xmemo.dev`
- **Execution Status**: `success`
- **Overall Verdict**: `PASS`
- **Total Requests Dispatched**: 3 / 3 (max cap: 3)

## 📡 Dispatched Requests (Unauthenticated Public Discovery Only)

| # | Method | URL | Status | Latency | Key Headers / Challenge |
|---|---|---|---|---|---|
| 1 | `GET` | `https://xmemo.dev/.well-known/oauth-authorization-server` | 200 | 146ms | `content-type: application/json` |
| 2 | `GET` | `https://xmemo.dev/.well-known/oauth-protected-resource` | 200 | 36ms | `content-type: application/json` |
| 3 | `POST` | `https://xmemo.dev/mcp` | 401 | 39ms | `WWW-Authenticate: Bearer resource_metadata="https://xmemo.dev/.well-known/oauth-protected-resource", scope="memory:read memory:write", error="invalid_token", error_description="Your XMemo OAuth authorization is missing, expired, or no longer valid. Reconnect XMemo from your client to complete OAuth authorization again, then retry."` |

## 🔍 Authorization Surface Parity (AC-203-1 vs Discovered)

| Field | Configured Expectation (AC-203-1) | Discovered from Upstream | Verdict | Notes |
|---|---|---|---|---|
| `issuer` | `https://xmemo.dev` | `https://xmemo.dev` | `MATCH` | - |
| `authorization_endpoint` | `https://xmemo.dev/oauth/authorize` | `https://xmemo.dev/oauth/authorize` | `MATCH` | - |
| `token_endpoint` | `https://xmemo.dev/oauth/token` | `https://xmemo.dev/oauth/token` | `MATCH` | - |
| `registration_endpoint` | `https://xmemo.dev/oauth/register` | `https://xmemo.dev/oauth/register` | `MATCH` | - |
| `revocation_endpoint` | `https://xmemo.dev/oauth/revoke` | `https://xmemo.dev/oauth/revoke` | `MATCH` | - |
| `grant_types_supported` | `authorization_code, refresh_token` | `authorization_code, refresh_token` | `MATCH` | Must support authorization_code and refresh_token |
| `code_challenge_methods_supported` | `S256` | `S256` | `MATCH` | Must support S256 PKCE |
| `scopes_supported` | `memory:read, memory:write` | `memory:read, memory:write, knowledge:read, knowledge:write, openid, profile, email` | `MATCH` | Must include memory:read, memory:write |
| `protected_resource.resource` | `https://xmemo.dev/mcp` | `https://xmemo.dev/mcp` | `MATCH` | RFC 9207 / RFC 9470 protected resource identifier |

## 🛡️ MCP Endpoint Unauthenticated Challenge

- **Target Endpoint**: `https://xmemo.dev/mcp`
- **HTTP Status**: `401` (401 Unauthorized expected)
- **WWW-Authenticate Header**: `Bearer resource_metadata="https://xmemo.dev/.well-known/oauth-protected-resource", scope="memory:read memory:write", error="invalid_token", error_description="Your XMemo OAuth authorization is missing, expired, or no longer valid. Reconnect XMemo from your client to complete OAuth authorization again, then retry."`
- **Probe Verdict**: `PASS`

## 🔒 Security & Privacy Audit

- **Credentials Sent**: `false` (strictly 0 tokens/keys sent)
- **Authorization Header Sent**: `false` (guarded before dispatch)
- **Report Contains Tokens**: `false`
- **Report Contains Keys**: `false`
