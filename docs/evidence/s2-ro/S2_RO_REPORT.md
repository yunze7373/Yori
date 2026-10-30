# XMemo Read-Only Owner-Key Connectivity Verification Report

- **Run Mode**: `offline_mock`
- **Timestamp (UTC)**: `2026-10-30T20:05:06.349Z`
- **Timestamp (JST)**: `2026/10/31 05:05:06 JST`
- **Target Host**: `127.0.0.1:52075`
- **Execution Status**: `success`
- **Total Requests Dispatched**: 2 (max cap: 3)

## 📡 Upstream Request Metadata (Names & Counts Only — Zero Content)

| # | Query | Status | Latency | Envelope Shape | Item Count | Yori Managed Keys | Yori Tagged | Field Names |
|---|---|---|---|---|---|---|---|---|
| 1 | `preferences` | 200 | 15ms | `result.memories[]` | 3 | 2 | 2 | `key, provenance, status, tag, updatedAt, value` |
| 2 | `prep_buffer_minutes` | 200 | 2ms | `result.memories[]` | 1 | 1 | 1 | `key, provenance, status, tag, updatedAt, value` |

## 🔄 MemoryPort Roundtrip (Read Side)

- **Executed**: Yes
- **Success**: Yes
- **Loaded Facts Count**: 3
- **Mapped Shape**: `MemoryFact[]`

## 🛡️ Privacy & Secret Hygiene Audit

- **Raw Body Persisted**: `false` (0 bytes stored)
- **PII / Content Leak Detected**: `false` (0 content strings)
- **Token Leak Detected**: `false` (0 credentials in report or logs)
