# Yori Public Release & Owner Push Checklist

> **Authority:** Project Owner (`Han`)  
> **Status:** 🔒 **OWNER GATE PENDING** (To be executed only by Han after formal authorization)  
> **Governed by:** `INBOX-20261030-7E07D1` (`PUBLISH-PREP-REHEARSAL`)  
> **Verified Rehearsal Reference:** [`docs/publish/HISTORY_REWRITE_REHEARSAL.md`](./HISTORY_REWRITE_REHEARSAL.md)

---

## Overview

This checklist contains the **exact, ordered commands** required to perform the production history rewrite and initial public push to GitHub. 

> [!WARNING]
> **DO NOT RUN THESE COMMANDS AS AN AGENT OR EXECUTOR.**  
> These commands alter the canonical git repository and push to GitHub. Only the project owner (`Han`) has the legal authority and credentials to execute this procedure.

---

## Pre-Flight Requirements

Before beginning, ensure the following tools are available in your terminal:
1. `git` (v2.30+)
2. `git-filter-repo` (v2.47.0):
   ```bash
   pip3 install --user --break-system-packages git-filter-repo==2.47.0
   # or: brew install git-filter-repo
   export PATH="$HOME/Library/Python/3.14/bin:$PATH"
   ```
3. `gh` (GitHub CLI, authenticated with account `yunze7373`):
   ```bash
   gh auth status
   ```
4. Clean working tree:
   ```bash
   git status --porcelain
   # Must be empty
   ```

---

## Ordered Execution Steps

### Step 1: Create Complete Pre-Rewrite Backup Bundle
Create a full standalone git bundle containing all refs, branches, and tags before making any changes.

```bash
# 1. Create full backup bundle outside the repository
git bundle create "$HOME/Desktop/Yori-pre-rewrite-backup-$(date +%Y%m%d).bundle" --all

# 2. Verify bundle integrity
git bundle verify "$HOME/Desktop/Yori-pre-rewrite-backup-$(date +%Y%m%d).bundle"
```

> [!IMPORTANT]
> Keep this `.bundle` file safe. If anything unexpected occurs during the rewrite, it guarantees 100% instant recovery of the entire repository.

---

### Step 2: Execute Production History Rewrite
Run `git-filter-repo` with the tested mailmap and text replacement rules.

```bash
# 1. Prepare temporary rewrite rule files
LOCAL_USER="$(whoami)"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"

cat << 'EOF' > /tmp/yori-prod-mailmap.txt
Han <han@yonro.co.jp> <han315@example.com>
EOF

cat << EOF > /tmp/yori-prod-replace.txt
literal:/Users/${LOCAL_USER}/repos/Yori==><repo-root>
literal:/Users/${LOCAL_USER}==><repo-root>
EOF

# 2. Execute git-filter-repo on the repository
git filter-repo \
  --mailmap /tmp/yori-prod-mailmap.txt \
  --replace-text /tmp/yori-prod-replace.txt \
  --force

# 3. Clean up temporary rule files
rm -f /tmp/yori-prod-mailmap.txt /tmp/yori-prod-replace.txt
```

---

### Step 3: Local Verification on Rewritten HEAD
Verify that the rewritten tree is completely sound, all tests pass, and privacy rules hold.

```bash
# 1. Verify author and committer emails (must show 138 han@yonro.co.jp, 0 han315)
git log --format="%ae" | sort | uniq -c
git log --format="%ce" | sort | uniq -c

# 2. Verify zero occurrences of local machine paths
git log -S "/Users/$(whoami)" --oneline
# Must output 0 commits

# 3. Verify total commit count (must remain exactly 138)
git rev-list --count HEAD

# 4. Run test suites
npm run test:golden      # 18/18 golden tests
npm run test:drills      # 56/56 integration drills
npm run verify:production

# 5. Run privacy and secret scanner
node scripts/publish/privacy-scan.ts
```

---

### Step 4: Create Remote GitHub Repository (Owner Gate)
Create the public GitHub repository under account `yunze7373`.

> [!NOTE]
> Execute this step **only** when ready for public visibility.

```bash
# Create public repository on GitHub and link remote
gh repo create yunze7373/Yori --public --source=. --remote=origin --description "Living Context Assistant: proactive, grounded daily orchestration that adapts without distraction."
```

If the repository already exists or was created privately:
```bash
git remote add origin https://github.com/yunze7373/Yori.git
```

---

### Step 5: Push Rewritten Commits and Tags
Push the canonical rewritten `main` branch and all tags (`yori-approved-ui`).

```bash
# Push branch and tags
git push -u origin main --tags
```

---

## Rollback Procedures

If any failure occurs before or during Step 5, restore the exact original repository state from the backup bundle created in Step 1:

```bash
# Option A: In-place ref restoration from bundle
git fetch "$HOME/Desktop/Yori-pre-rewrite-backup-$(date +%Y%m%d).bundle" 'refs/*:refs/*'

# Option B: Fresh clone from bundle
git clone "$HOME/Desktop/Yori-pre-rewrite-backup-$(date +%Y%m%d).bundle" Yori-restored
cd Yori-restored
```

---

## Remaining Owner Decision Gates

| Gate ID | Decision Topic | Current State | Owner Action Required |
| :--- | :--- | :--- | :--- |
| **OWNER-DEC-1** | **LICENSE Holder Text** | `Copyright (c) 2026 Han [OWNER TO CONFIRM]` in `LICENSE` | Owner confirms legal copyright entity (e.g. `Han`, `Yunze Han`, or corporate entity). |
| **OWNER-DEC-2** | **Repo Visibility Timing** | Local only | Decide whether to create as `--public` immediately or create as `--private` until demo video is uploaded. |
| **OWNER-DEC-3** | **Demo Video Link** | Submission template has placeholder | Upload video walkthrough to YouTube/Loom and populate public URL in submission docs. |
