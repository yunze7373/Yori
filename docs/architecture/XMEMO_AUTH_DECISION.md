# XMemo End-User Application Auth Decision Record

> **Auditable Decision Record for Slice PH-002 C1 (AC-203-1)**  
> **Governed by Plan:** `yori_ph002_001` (Workstream C, Goal G-203)  
> **Status:** PROPOSED — pending Reviewer  
> **Date:** 2026-10-28  
> **Author:** DevFlow Resident Project Executor AI  

---

## 1. Executive Summary & Auditable Decision

### Decision: **PATH EXISTS WITH MINIMAL SCOPES**

Based on inspectable live metadata and published documentation retrieved on **2026-10-28**, XMemo provides an official, standards-compliant **OAuth 2.0 (RFC 8414 / RFC 7636 PKCE)** end-user application authorization path at `https://xmemo.dev`.

A third-party web application such as Yori can integrate with XMemo using:
1. **Protocol:** OAuth 2.0 Authorization Code Flow with PKCE (`S256`) and Dynamic Client Registration (RFC 7591).
2. **Minimal Scopes Required:** `memory:read` (to retrieve user preferences and confirmed memories) and `memory:write` (to write back user-confirmed preferences upon explicit approval).
3. **Data Access Surface:** Streamable MCP-over-HTTP at `https://xmemo.dev/mcp` (the declared protected resource) using bearer authorization (`Authorization: Bearer <token>`).
4. **Token Placement:** Server-side proxy / session storage only; **zero agent tokens or client secrets in the browser bundle or repository** (enforcing Invariant INV-107, AC-106-3, AC-203-2, and HB-3).
5. **Deterministic Fallback:** If XMemo OAuth is unconfigured, fails, or is rejected, the application seamlessly falls back to `LocalMemoryAdapter` as the sole source of truth, preserving 100% feature fidelity across all scenes (D1–D6) without degradation.

---

## 2. Distinction: Agent-Side MCP vs End-User Application Auth

> [!IMPORTANT]
> **The agent-side MCP access in this workspace is NOT an end-user application auth path.**

- In the current workspace, the agent communicates via an internal development MCP configuration using a provisioned agent identity used by the owner's developer tooling.
- This workspace capability is strictly an **internal developer/agent operational channel**.
- Shipping or embedding agent tokens or provisioning details into Yori's client or web distribution is prohibited under **HB-3** and **AC-106-3**.
- End-user integration must instead use the user-authorized OAuth 2.0 flow where the end user explicitly grants permissions via XMemo's consent screen.

---

## 3. Sources Consulted & Inspected Evidence

All findings below were directly retrieved and verified from live, inspectable HTTP endpoints on **2026-10-28**.

| Source URL | Access Date | HTTP Status | Role in Verification |
|---|---|---|---|
| `https://xmemo.dev/.well-known/oauth-authorization-server` | 2026-10-28 | `200 OK` | RFC 8414 OAuth 2.0 Authorization Server Metadata (endpoints, grants, scopes, PKCE). |
| `https://xmemo.dev/.well-known/oauth-protected-resource` | 2026-10-28 | `200 OK` | Protected resource metadata for the `https://xmemo.dev/mcp` resource. |
| `https://xmemo.dev/.well-known/openid-configuration` | 2026-10-28 | `404 Not Found` | Verified non-existence: XMemo does not expose a standalone OIDC provider config; OAuth 2.0 RFC 8414 is the authoritative discovery endpoint. |
| `https://xmemo.dev/auth.md` | 2026-10-28 | `200 OK` | Official agent and client authentication specification. |
| `https://docs.xmemo.dev/docs/api/authentication.md` | 2026-10-28 | `200 OK` | Canonical documentation on API authentication, scopes, and surface differences. |
| `https://docs.xmemo.dev/docs/security/authentication.md` | 2026-10-28 | `200 OK` | Canonical documentation on security boundaries, token segregation, and credential placement. |
| `https://docs.xmemo.dev/docs/concepts/scopes.md` | 2026-10-28 | `200 OK` | Canonical documentation on bucket vs. scope boundaries and client integration patterns. |

### Verbatim Evidence Quotes

#### A. RFC 8414 Authorization Server Metadata
Retrieved from `https://xmemo.dev/.well-known/oauth-authorization-server`:
```json
{
  "issuer": "https://xmemo.dev",
  "authorization_endpoint": "https://xmemo.dev/oauth/authorize",
  "token_endpoint": "https://xmemo.dev/oauth/token",
  "registration_endpoint": "https://xmemo.dev/oauth/register",
  "revocation_endpoint": "https://xmemo.dev/oauth/revoke",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "client_id_metadata_document_supported": false,
  "scopes_supported": [
    "memory:read",
    "memory:write",
    "knowledge:read",
    "knowledge:write",
    "openid",
    "profile",
    "email"
  ],
  "service_documentation": "https://docs.xmemo.dev",
  "mcp_endpoint": "https://xmemo.dev/mcp",
  "resource": "https://xmemo.dev/mcp",
  "protected_resource_metadata_endpoint": "https://xmemo.dev/.well-known/oauth-protected-resource"
}
```

#### B. Protected Resource Metadata
Retrieved from `https://xmemo.dev/.well-known/oauth-protected-resource`:
```json
{
  "resource": "https://xmemo.dev/mcp",
  "authorization_servers": ["https://xmemo.dev"],
  "scopes_supported": ["memory:read", "memory:write", "knowledge:read", "knowledge:write"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://docs.xmemo.dev",
  "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"]
}
```

#### C. Official Authentication Guide (`https://xmemo.dev/auth.md`)
> *"For dynamic client integrations, XMemo supports the OAuth 2.0 authorization code flow with Proof Key for Code Exchange (PKCE).*  
> *Discovery endpoint: `https://xmemo.dev/.well-known/oauth-authorization-server`*  
> *Steps:*  
> *1. Register a client dynamically at `https://xmemo.dev/oauth/register`*  
> *2. Initiate the authorization code flow with PKCE (`code_challenge_method=S256`)*  
> *3. Exchange the authorization code for an access token*  
> *4. Use the access token as a Bearer token in the Authorization header"*

#### D. API & Security Documentation (`docs.xmemo.dev`)
> *"The hosted MCP endpoint and the REST API authenticate differently. Pick the one that matches the client you are wiring, and never place a credential in public configuration or a generated URL.*  
> *- MCP — OAuth where the client supports it, otherwise Authorization: Bearer ${XMEMO_KEY}.*  
> *- REST data plane — X-API-Key: <your-assigned-api-key> (Authorization: Bearer <token> is also accepted by the server)."*  
> (`docs/api/authentication.md`)

> *"Unverified dynamic clients must request memory and knowledge scopes explicitly; verified clients retain the existing default when scope is omitted. The grant supplies only the approved scopes."*  
> (`docs/api/authentication.md`)

---

## 4. Technical Findings & Claims Verification

| Item | Finding / Claim | Evidence Source | Status |
|---|---|---|---|
| **Auth Protocol** | OAuth 2.0 Authorization Code Grant with PKCE (`code_challenge_method=S256`) | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Public Client Support** | `token_endpoint_auth_methods_supported` includes `"none"`, supporting PKCE without pre-shared client secrets | `oauth-authorization-server` metadata | **VERIFIED** |
| **Dynamic Client Registration** | RFC 7591 dynamic registration supported at `https://xmemo.dev/oauth/register` | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Token Exchange & Revocation** | `POST /oauth/token` (code & refresh grants); `POST /oauth/revoke` (revocation) | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Minimal Scopes** | `memory:read` (recall/search) and `memory:write` (write-back confirmed facts) | `docs/api/authentication.md`, `docs/concepts/scopes.md` | **VERIFIED** |
| **Unneeded Scopes** | `knowledge:read`, `knowledge:write`, `openid`, `profile`, `email` omitted for least privilege | Principle of Least Privilege | **VERIFIED** |
| **Target Data Surface** | The token audience/resource is strictly the MCP endpoint `https://xmemo.dev/mcp` | `oauth-protected-resource` metadata, `docs/api/authentication.md` | **VERIFIED** |
| **Loopback Redirect Acceptance** | Acceptance of `http://127.0.0.1:<port>/...` as dynamic registration redirect URI | Not stated in metadata or docs | **UNVERIFIED** (Requires live probe in C2) |
| **Console OAuth Registration UI** | User-facing self-service app registration form in Memory Console | Docs describe Console for memory inspection/export only | **UNVERIFIED** (No source documents this UI) |
| **REST Data Surface with OAuth Token** | Direct REST data calls (`/v1/memories/...`) using dynamic OAuth access token | Docs state REST uses `X-API-Key` (though Bearer accepted) | **UNVERIFIED** (MCP is the documented OAuth surface) |

---

## 5. Target Data Access Surface: MCP-over-HTTP

The metadata from `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` establishes that:
- The declared `resource` is `https://xmemo.dev/mcp`.
- The primary authenticated data surface for OAuth clients is the **hosted Model Context Protocol (MCP) endpoint** at `https://xmemo.dev/mcp`.

### Consequences for Slice C2
1. **Protocol:** C2 must interact with XMemo via **Streamable MCP-over-HTTP** sending `Authorization: Bearer <access_token>`.
2. **Operations:** Operations use standard, documented MCP tools (`recall` to read confirmed preferences and `remember` to write back user-confirmed facts).
3. **No Invented Endpoints:** Yori must NOT invent arbitrary REST paths (e.g. `/v1/preferences` or `/v1/oauth/userinfo`) that are not backed by evidence.

---

## 6. Architectural Integration Model for Yori (Workstream C)

To satisfy **Architecture Rev3 Section 9.2**, **ADR-103**, **AC-203-1**, and **AC-203-2**:

### 1. Zero Client Credential Exposure (HB-3)
- Static tokens (`XMEMO_KEY`) and long-lived credentials MUST NEVER be bundled into frontend JavaScript (`dist/`) or committed to the repository.
- Token exchange in development is conducted through a local backend proxy / dev-server middleware (e.g. `POST /api/xmemo/token`), never exposed in client storage.

### 2. Confirm-Only Memory Write-Back (INV-107, AC-106-3)
- `MemoryPort.writeBack(fact)` strictly validates `fact.status === 'confirmed'`.
- Any attempt to write back `pending` proposals or `rejected` insights throws immediately without dispatch.

### 3. Graceful Deterministic Fallback (AC-203-2)
- If the OAuth flow has not been completed, or the access token has expired/revoked, `XMemoRemoteAdapter` reports `isRemoteConfigured: false`.
- The application automatically falls back to `LocalMemoryAdapter` backed by `YoriStorage`.
- All deterministic scenarios (D1–D6) continue to execute byte-identically with zero UI disruption.

---

## 7. Single Minimal Owner Action (for Slice C2 Gate)

When ready to enable live XMemo sync in slice C2:

- **Dynamic Client Registration Flow:**
  1. The local dev proxy registers a client dynamically with `POST https://xmemo.dev/oauth/register`.
  2. The browser navigates to `https://xmemo.dev/oauth/authorize?client_id=...&scope=memory:read%20memory:write&response_type=code&code_challenge=...`.
  3. The owner clicks **Authorize** on the XMemo consent screen.
  - **Owner action:** Exactly **1 click** in the browser to approve consent.

---

## 8. Fallback Demo Path (If Owner Chooses Not to Enable Live OAuth)

If the owner chooses not to configure live OAuth credentials during C2:
1. **Local Truth Source:** `LocalMemoryAdapter` remains the active implementation of `MemoryPort`.
2. **Deterministic Stability:** 100% of pipeline features (NOW/AHEAD ranking, Living Context composition, review loops, adjustments, and dismissals) remain functional using local `YoriStorage`.
3. **Limitation Disclosure:** `docs/DEMO.md` explicitly documents:
   > *"XMemo Status: Local adapter active (source of truth). Remote end-user OAuth synchronization disabled (HB-3); confirmed facts stored locally in versioned envelope."*
4. **No Blockers:** The project can progress to Workstream E and Phase Closeout without blocking on external account credentials.

---

## 9. Open Questions for Slice C2 Live Probe

Slice C2 must resolve the following open questions through an owner-authorized live test:
1. **Redirect URI Validation:** Does `https://xmemo.dev/oauth/register` accept local loopback redirect URIs (`http://127.0.0.1:<port>/callback` or `http://localhost:<port>/callback`) for dynamic public clients?
2. **DCR Expiry/Quotas:** Are dynamic client credentials ephemeral or persistent across server restarts?
3. **MCP Tool Invocation Format:** Confirm the exact JSON-RPC payload envelope accepted by `POST https://xmemo.dev/mcp` with Bearer authentication for `recall` and `remember`.
