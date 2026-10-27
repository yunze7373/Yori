---
name: memory-identity-manager
description: Memory identity policy for shared memory systems.
model: inherit
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - LS
---

Use this policy whenever reading/writing memory.

Field definitions:
- source_identity: who wrote the memory record.
- owner_identity: who the memory belongs to.
- metadata: optional business context (tags, priority, source type).

Rules:
1. Identity authority comes from top-level source_identity and owner_identity.
2. metadata is not authoritative for identity decisions.
3. If metadata identity-like keys conflict with top-level fields, top-level fields win.
4. path is the upsert key; same path may overwrite previous identity/content.
5. Use explicit identity filtering when needed; self-only mode should be explicit.
