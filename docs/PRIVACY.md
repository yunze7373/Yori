# Yori Privacy Policy & Data Disclosures

*Last updated: October 30, 2026*  
*Governed by Architecture Rev3, AC-106-3, AC-203-2, AC-204-2, and Meta Model API Platform Terms*

---

## 1. Overview & Commitment to Calm Privacy

Yori (ヨリ) is designed from the ground up as a **calm, privacy-preserving, proactive assistant**. We believe proactive intelligence should not require surveillance or unchecked data harvesting.

This Privacy Policy describes how Yori collects, processes, flows, and retains data when you use the local application and its optional integrated services (Meta Muse Spark Model API and XMemo long-term memory).

In compliance with the **Meta Model API Terms of Service (§6.2, §10.1)** and the **Meta Model API Acceptable Use Policy (AUP)**, this document transparently discloses all data flows, user rights, age eligibility requirements, and AI output limitations.

---

## 2. Information We Collect and Process

Yori processes only the minimal data strictly necessary to synthesize your **Living Context**:

### A. Geolocation Data (Consented, One-Shot, Default OFF)
- **Status**: Completely disabled by default (`GEO_LIVE_ENABLED=false`).
- **One-Shot & Consent-Gated**: If enabled, location is captured only upon explicit in-app user consent via `navigator.geolocation.getCurrentPosition`.
- **Zero Persistent Tracking**: Continuous GPS background tracking (`watchPosition`) is absent across the entire repository (verified by static audit `AC-211-1`, `AC-211-2`).
- **No Coordinate Leakage**: Raw coordinates are held in volatile client memory only for proximity filtering. Raw latitude and longitude coordinates are **never** logged, persisted to disk, or transmitted to any AI model.
- **Demo Mode**: In standard demo scenes, only deterministic mock fixtures with fixed city coordinates (San Francisco / Los Angeles) are utilized.

### B. Personal Memories & Preferences (Confirm-Only)
- **Confirm-Only Invariant (INV-107)**: Yori separates candidate observations from confirmed facts. Unconfirmed behavioral patterns remain local pending proposals in the **Me** tab.
- **User Control**: Only facts that you explicitly inspect and tap **Confirm** on are committed to long-term memory or synced to remote vaults.
- **Scoped Schema**: Confirmed facts are restricted to bounded preference tags (`yori:living-context`, food preferences, transit choices).

### C. Schedule & Ambient Conditions
- **Local Fixtures**: In demonstration mode, schedule events (e.g. "Piano lesson at 3:00 PM") and transit times are simulated scenario snapshots loaded locally from code fixtures.
- **No Third-Party Account Scraping**: Yori does not access, scrape, or store private Google Calendar, iCloud, or Microsoft Exchange account credentials.
- **Weather Signals**: Ambient weather summaries are derived either from deterministic local fixtures or keyless non-commercial Open-Meteo forecasts for the configured demo city coordinates.

---

## 3. Data Flows & Third-Party Integrations

Yori enforces strict architectural boundaries isolating external service integrations:

```
┌──────────────────────────────────────────────────────────────────┐
│                   Browser Client (Yori UI)                       │
│  - Volatile coordinates (never sent to model or logged)          │
│  - Local storage: confirmed memories + pending proposals         │
└────────────────┬────────────────────────────────┬────────────────┘
                 │ Local Loopback                 │ Local Loopback
                 │ http://127.0.0.1:5173          │ http://127.0.0.1:5173
                 ▼                                ▼
┌────────────────────────────────┐  ┌──────────────────────────────┐
│ Model Dev Proxy (ModelPort)    │  │ XMemo Dev Proxy (MemoryPort) │
│ - Meta Muse Spark Gateway      │  │ - RFC 7591/8414 DCR & PKCE   │
│ - Template-allowlisted facts   │  │ - Strict Origin Allowlist    │
│ - ZERO coordinates/raw prompts │  │ - Server-side INV-107 guard  │
└────────────────┬───────────────┘  └─────────────┬────────────────┘
                 │ HTTPS (Restricted)             │ HTTPS (Restricted)
                 ▼                                ▼
┌────────────────────────────────┐  ┌──────────────────────────────┐
│ Meta Model API (Cloud)         │  │ XMemo Remote Vault (Cloud)   │
│ https://api.meta.ai/v1         │  │ https://xmemo.dev/mcp        │
│ (Wording polish & reordering)  │  │ (Confirmed facts only)       │
└────────────────────────────────┘  └──────────────────────────────┘
```

### A. Meta Model API (`ModelPort` / Muse Spark)
- **Integration Boundary**: The browser client never communicates with Meta servers directly. Requests pass through the local dev server proxy at `127.0.0.1:5173`. The default upstream endpoint is `https://api.meta.ai/v1` (configurable via `MODEL_BASE_URL`).
- **Allowlisted Payload Filtering**: The proxy constructs minimal, constrained prompts containing strictly allowlisted contextual facts (such as departure time windows, rain/clear weather tags, and candidate venue titles).
- **Zero Coordinate Policy**: Geographic coordinates and raw GPS data are **never** forwarded to the Meta Model API.
- **Strict Hallucination Guards**: Model responses are restricted to phrasing refinement and candidate ranking. If a model response introduces unlisted times, places, or unverifiable claims, it is discarded in favor of deterministic domain templates.

### B. Long-Term Memory Vault (`MemoryPort` / XMemo)
- **Integration Boundary**: Operates behind server-side OAuth 2.0 PKCE and Model Context Protocol (MCP) at `https://xmemo.dev/mcp`.
- **Confirm-Only Write-Back (INV-107)**: The proxy validates every outgoing write request; non-confirmed facts are rejected with HTTP 400.
- **Origin Allowlist**: Enforces RFC 8414 §3.3 issuer exact-match and HTTPS same-origin allowlists. No tokens, credentials, or facts are dispatched to foreign or untrusted endpoints.
- **Fallback Resilience**: When XMemo is disconnected or disabled, Yori seamlessly degrades to in-browser storage (`LocalMemoryAdapter`) with zero data loss or UI interruption.

### C. Zero External CDN Dependencies (Self-Hosted Typography)
- **Local Font Serving**: All typography assets (`Inter` and `Newsreader` in WOFF2 format) are self-hosted directly within the application bundle under `/fonts/` with `font-display: swap`.
- **Zero Third-Party Network Calls**: Yori contains zero runtime connections to external font delivery networks (such as Google Fonts / `fonts.googleapis.com` or `fonts.gstatic.com`). Page views transmit no IP addresses or client metadata to third-party font CDNs, ensuring strict viewer privacy and offline/air-gapped demo resilience.

---

## 4. Data Retention, Storage & Deletion Controls

You retain full, unencumbered ownership and control over your personal context:

1. **Local Storage Erasure**:
   - You can wipe all locally stored preferences, proposals, and contextual state at any time by triggering **Reset Storage** in the **Me** view.
2. **Remote Vault Deletion & Disconnection**:
   - Confirmed facts synchronized to the XMemo remote vault reside within your external XMemo account and can be managed or deleted directly through XMemo itself. While the dev server proxy exposes a programmatic REST endpoint (`DELETE /api/xmemo/confirmed-facts` utilizing the MCP `forget` tool), the current demo UI release does not expose an in-app individual fact deletion control.
   - Tapping **Disconnect** revokes the active OAuth token and terminates the local dev-server proxy session memory, but does not wipe remote facts previously written to XMemo.
3. **Volatile Process Memory**:
   - OAuth access tokens, refresh tokens, and PKCE verifiers reside strictly in volatile dev-server process memory. They are never written to browser `localStorage`, `sessionStorage`, cookies, or repository files.
4. **Export & Portability**:
   - Confirmed preferences can be exported directly from the **Me** view as structured JSON records.

---

## 5. Age Requirement & Target Audience (18+)

In accordance with **Meta Model API Terms of Service Section 10.1** and platform age guidelines:
- **Minimum Age**: Yori and its integrated AI services are strictly intended for individuals who are at least **18 years of age** (or the age of majority in their legal jurisdiction).
- **Not Directed to Minors**: Yori is not directed to, marketed to, or intentionally collecting personal information from children or individuals under the age of 18.
- **Parental & Caregiver Scenarios**: Pre-configured demonstration fixtures that reference youth activities (such as *"Piano lesson at 3:00 PM"*) represent adult guardian calendar coordination and do not solicit, collect, or process children's personal data.

---

## 6. AI Output Limitations & Disclosures

Pursuant to the **Meta Model API Acceptable Use Policy (AUP)** and platform disclosures:
- **Assistive Nature**: Natural language summaries, proactive suggestions, and ranking orders produced with the assistance of Meta Muse Spark are assistive recommendations.
- **Probabilistic Output**: AI-generated responses may occasionally contain omissions, stylistic imperfections, or latency.
- **Human In The Loop**: Yori never takes autonomous, irreversible real-world actions (such as booking reservations, executing payments, or sending communications) without explicit human confirmation.
- **Verifiable Transparency ("Why" Sheet)**: Every card surfaced by Yori includes an explainable **Why** sheet that details the precise deterministic rules, schedule constraints, and confirmed preferences that motivated the recommendation.

---

## 7. Governing Terms & Inquiries

- **Meta Model API Terms of Service**: [https://dev.meta.ai/legal/terms-of-service](https://dev.meta.ai/legal/terms-of-service)
- **Meta Model API Acceptable Use Policy**: [https://dev.meta.ai/legal/acceptable-use-policy](https://dev.meta.ai/legal/acceptable-use-policy)
- **Open-Meteo Weather Attribution**: Weather forecasts provided under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) terms.
- **Inquiries**: For questions regarding this privacy disclosure, please file an issue or contact the project maintainers via the project repository.
