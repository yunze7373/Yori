# Pre-Push History Rewrite Rehearsal Verification Report

> **Task ID:** `INBOX-20261030-7E07D1` (`PUBLISH-PREP-REHEARSAL`)  
> **Rehearsal Date:** 2026-10-30T23:30:57Z  
> **Filter-Repo Version:** `git-filter-repo a40bce548d2c`  
> **Method:** Fully isolated throwaway clone (`git clone --no-local`)  
> **Source Repository Invariant:** 100% UNTOUCHED  
> **Overall Result:** ✅ **ALL INTEGRITY AND PRIVACY GATES PASSED**

---

## 1. Commit and Timestamp Provenance Preservation

Commit counts, author dates, and committer dates were dynamically measured and verified 1:1 against the original repository. No squashing occurred; all chronological timestamps remain authentic event-period provenance.

| Metric | Source Repository (Before) | Rehearsal Clone (After) | Status |
| :--- | :--- | :--- | :--- |
| **Commit Count** | `139` | `139` | ✅ IDENTICAL (1:1) |
| **Timestamp Pairs (`%at %ct`)** | `139` | `139` | ✅ IDENTICAL (1:1) |
| **Commit Sequence Order** | Chronological | Chronological | ✅ PRESERVED |
| **Author Name** | `Han` (139) | `Han` (139) | ✅ IDENTICAL |

---

## 2. Email Sanitization Audit (Author, Committer, and Tagger)

Legacy personal email addresses were permanently mapped to the approved organization address across all commit authors, committers, and annotated tag taggers.

| Role | Legacy (`han315@example.com`) Before | Legacy (`han315@example.com`) After | Canonical (`han@yonro.co.jp`) After | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Commit Author** | `115` | **`0`** | `139` | ✅ SANITIZED |
| **Commit Committer** | `115` | **`0`** | `139` | ✅ SANITIZED |
| **Tag Tagger** | `1` | **`0`** | `1` | ✅ SANITIZED |

---

## 3. Local Machine Path Scrubbing (Full-History Object Scan)

All historical blobs across all revisions (`git rev-list --all`) and commit diffs were audited for local machine username paths.

| Target Pattern | Historical Commits with Diffs (Before) | Blobs in Entire Rewritten History (After) | Status |
| :--- | :--- | :--- | :--- |
| Local user path (`/Users/...`) | `6` | **`0`** | ✅ SANITIZED |
| Local workspace path (`.../repos/Yori`) | `6` | **`0`** | ✅ REPLACED WITH `<repo-root>` |

---

## 4. HEAD Tree Integrity

The working tree of the rewritten repository was compared to the original repository's HEAD tree:

- **Original Tree SHA:** `e9a6d8d8eb87e40f4e202c83e2126851076d2a2b`
- **Rewritten Tree SHA:** `e9a6d8d8eb87e40f4e202c83e2126851076d2a2b`
- **Tree Difference:** **0 bytes / 0 files changed** (`true` Byte-Identical)

All current working files, fixtures, tests, and documentation remain byte-for-byte identical to the approved pre-rehearsal tree.

---

## 5. Branch and Tag Reference Updates

All branches and tags were preserved and updated to point to their corresponding rewritten commits and tag objects.

| Reference | Type | Original SHA | Rewritten SHA |
| :--- | :--- | :--- | :--- |
| `main` | Branch | `9f7b8c9895fe531b400aa41641d57be8dd066072` | `dacca4132ea047cbad510a4d11c0fc3018a26786` |
| `yori-approved-ui` | Tag Object | `d68acc2a8c8f8de4cd77cff6829ea527ee896ada` | `8203e8f410a9ab9a836b8ffc18417169e49be824` |
| `yori-approved-ui` | Tag Commit | `908abee8822d71a34ace358a3a1f995788d66e51` | `5719f9d9ae09eb5a64c426670c4c62fe30eeec0a` |

---

## 6. Historical Review Baseline Commit Mapping & Core Diff Invariant

The table below maps critical review and verification anchors from original commits to rewritten commits. Zero-core-diff against the rewritten PH-001 baseline (`src/core` freeze) was verified with 0 diffs.

| Baseline Anchor | Purpose / Context | Original SHA | Rewritten SHA | Rewritten Core Diff |
| :--- | :--- | :--- | :--- | :--- |
| `f43c6c1d` | PH-001 Invariant Baseline (`src/core` freeze) | `f43c6c1d74c4bc1159300fed9d62aec9447b886e` | `123a1972bc1d5beda466e34887104b82c3afa844` | **0 diff lines** (`git diff 123a1972bc1d5beda466e34887104b82c3afa844 HEAD -- src/core`) |
| `f3f2175f` | Chapter Closeout Baseline | `f3f2175f099b5c76832ecff8e7657356f0bb89e5` | `b60c1e9cba7befbb9b2f18bed0ec1b08c0fe28bf` | Verified |
| `908abee8` | UI Approved Tag Commit Anchor | `908abee8822d71a34ace358a3a1f995788d66e51` | `5719f9d9ae09eb5a64c426670c4c62fe30eeec0a` | Tag ref preserved |
| `9f7b8c9895fe531b400aa41641d57be8dd066072` | Pre-Rehearsal HEAD | `9f7b8c9895fe531b400aa41641d57be8dd066072` | `dacca4132ea047cbad510a4d11c0fc3018a26786` | HEAD tree identical |

---

## 7. Rehearsal Conclusion & Safety Proof

The pre-push history rewrite procedure has been rehearsed end-to-end in an isolated clone and verified against all criteria:
1. **Zero Data Loss:** 139 of 139 commits preserved with identical timestamps and tree contents.
2. **Zero Information Leakage:** 0 legacy emails in authors/committers/taggers; 0 local user paths in any historical commit or blob.
3. **Core Invariant Preserved:** Zero diff lines in `src/core` between rewritten baseline `123a1972bc1d5beda466e34887104b82c3afa844` and rewritten HEAD.
4. **Zero Impact on Source Repo:** The original working repository was never touched.
