# Yori (ヨリ) — Hackathon Submission Checklist

> **Governed by Plan:** `yori_ph002_001` (Slice PH-002 E2, AC-205-2)  
> **Submission Deadline:** 2026-11-05 11:00 JST  
> **Status:** READY FOR OWNER REVIEW — OWNER GATED  

---

## ⚠️ Important Governance Notice

> [!IMPORTANT]
> **All submission actions listed below are strictly OWNER-GATED.**
> 
> The AI agent has **NOT** performed any of these actions:
> - No repository visibility changes (remains private).
> - No external forms or registrations submitted.
> - No video recorded or uploaded.
> - No licenses applied without owner approval.
> - No new paid cloud resources created.
>
> Every step below requires explicit human action by the project owner (Han).

---

## 📋 Owner Action Items

### 1. License Selection
- [ ] **Review Proposed License**: Inspect [`LICENSE`](../../LICENSE). The default proposed license is the **MIT License**.
- [ ] **Owner Action**: Confirm MIT or replace with your preferred open source or proprietary license prior to public release.

### 2. Narrative & Description Review
- [ ] **Review Project Description**: Inspect [`PROJECT_DESCRIPTION.md`](PROJECT_DESCRIPTION.md).
- [ ] **Confirm Hackathon Track**: Verify track name (e.g. *Meta Muse Spark AI Application Track*) marked `[OWNER TO CONFIRM]`.
- [ ] **Approve Public Copy**: Ensure all claims align with personal vision and branding.

### 3. Video Recording & Editing
- [ ] **Review Video Script**: Inspect [`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md).
- [ ] **Record Walkthrough (~3 minutes)**:
  - Start local dev server (`npm run dev`) or preview (`npm run preview`).
  - Record desktop (1280×800) or mobile (390×844) viewport following the timed timestamps in `VIDEO_SCRIPT.md`.
  - Capture scenes D1, D2, D3, D4, the Why sheet, Adjust dialog, Me tab (budget & confirm proposal), and terminal verification tests.
- [ ] **Upload Video**: Upload to YouTube (Unlisted or Public) or Loom as required by the hackathon platform.

### 4. Repository Hygiene & Secret Audit
- [ ] **Verify Secret Scan Cleanliness**: Re-run the automated secret scan command before publishing:
  ```bash
  # Check working tree and git log for accidental secret tokens
  git grep -i -E '(sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{30,}|MODEL_API_KEY\s*[:=]\s*["\x27][a-zA-Z0-9_-]{10,}["\x27]|XMEMO_API_KEY)'
  git log -p | grep -E '(sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{30,})'
  ```
  *(Output must be 100% clean)*.
- [ ] **Verify Clean Clone**: Ensure a fresh clone builds and tests cleanly:
  ```bash
  git clone <repo-url> /tmp/yori-clone
  cd /tmp/yori-clone
  npm install
  npm test
  npm run test:golden
  ```

### 5. Repository Visibility
- [ ] **Make Repository Public**: In GitHub repository settings, change visibility from **Private** to **Public**.

### 6. Hackathon Submission Form
- [ ] **Fill Submission Form**: Complete required fields on the hackathon submission portal:
  - Project Title: `Yori`
  - Short Tagline: `A calm, proactive context-aware assistant. A little ahead. By your side.`
  - Video Demonstration Link: *(Insert recorded 3-minute video URL)*
  - Public GitHub Repository URL: `https://github.com/Yonro/Yori`
  - Description: *(Copy approved copy from `PROJECT_DESCRIPTION.md`)*
- [ ] **Submit Form**: Submit before the official deadline: **2026-11-05 11:00 JST**.

### 7. Provider Commercial Terms & Non-Commercial Qualification (AC-204-2)
- [ ] **Review Open-Meteo API Terms**: Inspect [`PROVIDERS.md`](../architecture/PROVIDERS.md).
- [ ] **Owner Action**: Confirm that the hackathon demo and submission qualify under Open-Meteo's non-commercial use terms (<10,000 calls/day, <5,000/hour, <600/minute). If deploying commercially or exceeding rate limits, acquire a commercial API plan or switch to a commercial provider (e.g. Apple WeatherKit).
- [ ] **Verify Default Off**: Ensure `WEATHER_LIVE_ENABLED` remains `false` by default.

---

## 🛡️ Architectural Acceptance Verification (AI Certified)

The underlying codebase has passed all required automated verification suites for Phase Closeout:
- ✅ **AC-EXT-1 Core Diff Invariant**: `src/core/` diff vs baseline `f43c6c1d74c4bc1159300fed9d62aec9447b886e` is **100% EMPTY** (0 files, 0 lines changed).
- ✅ **TypeScript Strict Mode**: `tsc --noEmit` exits 0 with zero errors.
- ✅ **Unit & Mock Integration**: 255/255 tests passing (`npm test`).
- ✅ **Golden Scenario Harness**: 10/10 scenarios passing byte-identically (`npm run test:golden`).
- ✅ **Degradation Drills**: 21/21 fault injection invariance tests passing (`npm run test:drills`).
- ✅ **Playwright E2E**: 42/42 end-to-end tests passing (`npm run test:e2e`).
- ✅ **Static Secret Scan**: Zero tokens or keys in `src/`, `dist/`, or browser storage APIs.
