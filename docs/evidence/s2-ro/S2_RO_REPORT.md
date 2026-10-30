# XMemo Read-Only Owner-Key Connectivity Verification Report

- **Run Mode**: `offline_mock`
- **Timestamp (UTC)**: `2026-10-30T20:16:21.008Z`
- **Timestamp (JST)**: `2026/10/31 05:16:21 JST`
- **Target Host**: `127.0.0.1:52607`
- **Execution Status**: `success`
- **Total Requests Dispatched**: 3 (max cap: 3)

## 📡 Upstream Request Metadata (Names & Counts Only — Zero Content)

| # | Query | Status | Latency | Envelope Shape | Item Count | Yori Managed Keys | Yori Tagged | Field Names |
|---|---|---|---|---|---|---|---|---|
| 1 | `preferences` | 200 | 10ms | `result.memories[]` | 3 | 2 | 2 | `key, provenance, status, tag, updatedAt, value` |
| 2 | `prep_buffer_minutes` | 200 | 2ms | `result.memories[]` | 1 | 1 | 1 | `key, provenance, status, tag, updatedAt, value` |
| 3 | `roundtrip:preferences` | 200 | 1ms | `result.memories[]` | 3 | 2 | 2 | `key, provenance, status, tag, updatedAt, value` |

## 🔄 MemoryPort Roundtrip (Read Side)

- **Executed**: Yes
- **Success**: Yes
- **Loaded Facts Count**: 3
- **Mapped Shape**: `MemoryFact[]`

## 🛡️ Privacy & Secret Hygiene Audit

- **Report Contains Values**: `structurally_excluded` (field names and counts only)
- **Raw Body Persisted**: `false` (0 bytes stored)
- **PII / Content Leak Detected**: `false` (zero forbidden values in report)
- **Token Leak Detected**: `false` (zero credentials in report or logs)
