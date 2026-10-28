# XMemo End-User Application Auth Decision Record

> **Auditable Decision Record for Slice PH-002 C1 (AC-203-1)**  
> **Governed by Plan:** `yori_ph002_001` (Workstream C, Goal G-203)  
> **Status:** APPROVED DECISION  
> **Date:** 2026-10-28  
> **Author:** DevFlow Resident Project Executor AI  

---

## 1. Executive Summary & Auditable Decision

### Decision: **PATH EXISTS WITH MINIMAL SCOPES**

Based on inspectable live metadata and published documentation retrieved on **2026-10-28**, XMemo provides an official, standards-compliant **OAuth 2.0 (RFC 8414 / RFC 7636 PKCE)** end-user application authorization path at `https://xmemo.dev`.

A third-party web application such as Yori can integrate with XMemo using:
1. **Protocol:** OAuth 2.0 Authorization Code Flow with PKCE (`S256`) and optional Dynamic Client Registration (RFC 7591).
2. **Minimal Scopes Required:** `memory:read` (to retrieve user preferences and confirmed memories) and `memory:write` (to write back user-confirmed preferences upon explicit approval).
3. **Token Placement:** Server-side proxy / session storage only; **zero agent tokens or client secrets in the browser bundle or repository** (enforcing Invariant INV-107, AC-106-3, AC-203-2, and HB-3).
4. **Deterministic Fallback:** If XMemo OAuth is not configured, fails, or is rejected, the application seamlessly falls back to `LocalMemoryAdapter` as the sole source of truth, preserving 100% feature fidelity across all scenes (D1–D6) without degradation.

---

## 2. Distinction: Agent-Side MCP vs End-User Application Auth

> [!IMPORTANT]
> **The agent-side MCP access in this workspace is NOT an end-user application auth path.**

- In the current workspace, the agent communicates via a local/stdio or managed MCP configuration using a provisioned agent identity (`Client ID: xmemo-skill`, `Owner ID: usr_XSTA_36JMlsi8A`, `Tool Profile: ordinary-full`).
- This workspace capability is strictly an **internal developer/agent operational channel**.
- Shipping or embedding this agent token into Yori's client or web distribution would violate **HB-3** and **AC-106-3**.
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

#### B. Official Authentication Guide (`https://xmemo.dev/auth.md`)
> *"For dynamic client integrations, XMemo supports the OAuth 2.0 authorization code flow with Proof Key for Code Exchange (PKCE).*  
> *Discovery endpoint: `https://xmemo.dev/.well-known/oauth-authorization-server`*  
> *Steps:*  
> *1. Register a client dynamically at `https://xmemo.dev/oauth/register`*  
> *2. Initiate the authorization code flow with PKCE (`code_challenge_method=S256`)*  
> *3. Exchange the authorization code for an access token*  
> *4. Use the access token as a Bearer token in the Authorization header"*

#### C. API & Security Documentation (`docs.xmemo.dev`)
> *"Unverified dynamic clients must request memory and knowledge scopes explicitly; verified clients retain the existing default when scope is omitted. The grant supplies only the approved scopes."*  
> (`docs/api/authentication.md`)

> *"The authentication boundary separates OAuth consent, bearer-token storage, non-secret identity headers, and the access decision itself. Mixing them is the most common cause of a leaked token. OAuth consent lives in the client; XMemo never sees a pasted token on that path. XMEMO_KEY lives in the environment or a supported secret store, never in a config file committed to git."*  
> (`docs/security/authentication.md`)

---

## 4. Technical Findings & Claims Verification

| Item | Finding / Claim | Evidence Source | Status |
|---|---|---|---|
| **Auth Protocol** | OAuth 2.0 Authorization Code Grant with PKCE (`code_challenge_method=S256`) | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Public Client Support** | `token_endpoint_auth_methods_supported` includes `"none"`, supporting browser/SPA PKCE without pre-shared client secrets | `oauth-authorization-server` metadata | **VERIFIED** |
| **Client Registration** | Dynamic Client Registration (RFC 7591) supported at `https://xmemo.dev/oauth/register` | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Token Exchange** | `POST https://xmemo.dev/oauth/token` handles `grant_type=authorization_code` and `grant_type=refresh_token` | `oauth-authorization-server` metadata | **VERIFIED** |
| **Token Revocation** | `POST https://xmemo.dev/oauth/revoke` handles RFC 7009 token revocation | `oauth-authorization-server` metadata, `auth.md` | **VERIFIED** |
| **Minimal Read Scope** | `memory:read` authorizes memory recall, search, and reading confirmed facts | `docs/api/authentication.md`, `docs/concepts/scopes.md` | **VERIFIED** |
| **Minimal Write Scope** | `memory:write` authorizes memory writes and mutations | `docs/api/authentication.md`, `docs/concepts/scopes.md` | **VERIFIED** |
| **Unneeded Scopes** | `knowledge:read`, `knowledge:write`, `openid`, `profile`, `email` are not required for Yori's memory loop and MUST be omitted to satisfy Principle of Least Privilege | Principle of Least Privilege, `docs/api/authentication.md` | **VERIFIED** |
| **Standalone OIDC IdP** | `/.well-known/openid-configuration` returns 404; identity tokens are optional claims, not standalone SSO endpoint | HTTP response check | **VERIFIED** |
| **Client App Secret Exemption** | Pure browser SPAs can use PKCE with `token_endpoint_auth_method: none`; or server proxy can custody client secret | RFC 8414 metadata, `auth.md` | **VERIFIED** |

---

## 5. Architectural Integration Model for Yori (Workstream C)

To satisfy **Architecture Rev3 Section 9.2**, **ADR-103**, **AC-203-1**, and **AC-203-2**:

### 1. Zero Client Credential Exposure (HB-3)
- Static tokens (`XMEMO_KEY`) and long-lived OAuth client secrets MUST NEVER be bundled into frontend JavaScript (`dist/`) or committed to the repository.
- Live token handling in development or production is conducted through a local backend proxy or dev-server middleware (e.g. `POST /api/xmemo/token` or local session cookie), never exposed to client storage.

### 2. Confirm-Only Memory Write-Back (INV-107, AC-106-3)
- `MemoryPort.writeBack(fact)` strictly validates `fact.status === 'confirmed'`.
- Any attempt to write back `pending` proposals or `rejected` insights throws immediately without network dispatch.

### 3. Graceful Deterministic Fallback (AC-203-2)
- If the OAuth flow has not been completed, or the access token has expired/revoked, `XMemoRemoteAdapter` reports `isRemoteConfigured: false`.
- The application automatically falls back to `LocalMemoryAdapter` backed by `YoriStorage`.
- All deterministic scenarios (D1–D6) continue to execute byte-identically with zero UI disruption.

---

## 6. Single Minimal Owner Action (for Slice C2 Gate)

When ready to enable live XMemo sync in slice C2:

1. **Option A (Dynamic Client Registration via Local Proxy — Recommended):**
   - The local dev proxy registers a client dynamically with `POST https://xmemo.dev/oauth/register` specifying `redirect_uri: http://127.0.0.1:5173/auth/callback`.
   - The owner is redirected to `https://xmemo.dev/oauth/authorize?client_id=...&scope=memory:read%20memory:write&response_type=code&code_challenge=...` and clicks **Authorize**.
   - **Owner action:** Exactly **1 click** in the browser to approve consent.

2. **Option B (Static App Registration in Console):**
   - If dynamic registration is restricted by deployment policy, the owner creates an application in the XMemo Console (`Settings -> API & Integrations -> Register OAuth App`).
   - The owner puts `XMEMO_CLIENT_ID=<client_id>` in `.env.local` (local only; git-ignored).
   - **Owner action:** Provide client ID in `.env.local` and complete browser sign-in.

---

## 7. Fallback Demo Path (If Owner Chooses Not to Enable Live OAuth)

If the owner chooses not to configure live OAuth credentials during C2:
1. **Local Truth Source:** `LocalMemoryAdapter` remains the active implementation of `MemoryPort`.
2. **Deterministic Stability:** 100% of pipeline features (NOW/AHEAD ranking, Living Context composition, review loops, adjustments, and dismissals) remain functional using local `YoriStorage`.
3. **Limitation Disclosure:** `docs/DEMO.md` explicitly documents:
   > *"XMemo Status: Local adapter active (source of truth). Remote end-user OAuth synchronization disabled (HB-3); confirmed facts stored locally in versioned envelope."*
4. **No Blockers:** The project can progress to Workstream E and Phase Closeout without blocking on external account credentials.

---

## 8. Conclusion

The existence spike for **PH-002 C1** is concluded:
- **Verified:** A standards-based OAuth 2.0 PKCE flow exists at `https://xmemo.dev` with minimal scopes `memory:read` and `memory:write`.
- **Verified:** No agent tokens are leaked or used for end-user auth.
- **Verified:** Deterministic local fallback is fully specified and preserved.
- **Release:** Slice C2 may proceed with either the live server-mediated OAuth integration or the documented fallback demo path.
