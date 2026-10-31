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

> [!CAUTION]
> **CRITICAL ROLLBACK BOUNDARY (POINT OF NO RETURN)**  
> Local rollback procedures can only recover the repository **BEFORE Step 5 (`git push`)**. Once commits, tags, and blobs are pushed to a public GitHub repository, history cannot be silently unpublished or revoked. **All verification gates in Step 3 MUST be 100% green before proceeding to Step 4 or Step 5.**

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
   # Must be completely empty
   ```

---

## Ordered Execution Steps

### Step 1: Record Baseline & Create Pre-Rewrite Backup Bundle
Capture initial baseline counts, persist state for cross-shell recovery, and create a complete standalone backup bundle containing all refs, branches, and tags.

```bash
# 1. Define persistent state file outside repository for reliable cross-shell recovery
export REWRITE_STATE_FILE="$HOME/Desktop/yori-rewrite-state.env"

# 2. Define backup bundle path once and export (e.g. Yori-pre-rewrite-backup-20261031.bundle)
export BUNDLE="$HOME/Desktop/Yori-pre-rewrite-backup-$(date +%Y%m%d).bundle"

# 3. Record pre-rewrite commit count and email distribution
export BEFORE_COUNT="$(git rev-list --count HEAD)"
echo "Pre-rewrite commit count: $BEFORE_COUNT"

# 4. Create full standalone backup bundle outside the repository
git bundle create "$BUNDLE" --all

# 5. Verify bundle integrity
git bundle verify "$BUNDLE"

# 6. Persist state variables to external state file for reliable recovery across shell sessions
cat << EOF > "$REWRITE_STATE_FILE"
export BUNDLE="$BUNDLE"
export BEFORE_COUNT="$BEFORE_COUNT"
EOF
chmod 600 "$REWRITE_STATE_FILE"
echo "Backup state saved to: $REWRITE_STATE_FILE"
```

> [!IMPORTANT]
> Keep `$BUNDLE` and `$REWRITE_STATE_FILE` intact. If any test fails in Step 3 or a new terminal window is opened, the rollback procedures source `$REWRITE_STATE_FILE` for instant, 100% restoration of the entire repository.

---

### Step 2: Execute Production History Rewrite
Run `git-filter-repo` with the tested mailmap and text replacement rules.

```bash
# 1. Prepare temporary rewrite rule files
LOCAL_USER="$(whoami)"

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

### Step 3: Comprehensive Local Verification on Rewritten HEAD
Verify that the rewritten tree is completely sound, all tests pass, privacy rules hold, and architectural baselines re-bind cleanly.

```bash
# 1. Verify author and committer emails (must show all commits on han@yonro.co.jp, 0 on han315)
git log --format="%ae" | sort | uniq -c
git log --format="%ce" | sort | uniq -c

# 2. Verify annotated tag tagger email (must show 0 legacy emails)
git for-each-ref --format='%(taggeremail)' refs/tags | grep -c "han315@example.com"
# Must output: 0

# 3. Verify total commit count (must match exactly the pre-rewrite count captured in Step 1)
REWRITE_STATE_FILE="${REWRITE_STATE_FILE:-$HOME/Desktop/yori-rewrite-state.env}"
if [[ -z "${BEFORE_COUNT:-}" && -f "$REWRITE_STATE_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$REWRITE_STATE_FILE"
fi

AFTER_COUNT="$(git rev-list --count HEAD)"
echo "Commit count: before=$BEFORE_COUNT, after=$AFTER_COUNT"
if [[ "$BEFORE_COUNT" -ne "$AFTER_COUNT" ]]; then
  echo "🛑 STOP: Commit count mismatch (before=$BEFORE_COUNT, after=$AFTER_COUNT)!"
  echo "DO NOT proceed to push. Roll back using the instructions in the Rollback Procedures section below."
fi

# 4. Full-history blob scan: audit every blob in all revisions for local machine paths
git grep -F "/Users/$(whoami)" $(git rev-list --all)
# Must return exit code 1 with 0 matches

# 5. Core Invariant Re-Binding: verify Zero-Core-Diff against rewritten PH-001 baseline
# Look up new SHA of original baseline f43c6c1d74c4bc1159300fed9d62aec9447b886e
NEW_F43C="$(grep '^f43c6c1d74c4bc1159300fed9d62aec9447b886e' .git/filter-repo/commit-map | awk '{print $2}')"
echo "Rewritten PH-001 Baseline: $NEW_F43C"
# Zero-Core-Diff check (must output 0 files changed)
git diff "$NEW_F43C" HEAD -- src/core

# 6. Run full automated test suites
npm test                                   # 756/756 unit tests
npm run test:golden                        # 18/18 golden tests
npm run test:drills                        # 56/56 integration drills
npx vitest run src/plugins/grocery-stub    # AC-EXT-1 extensibility verification
npm run verify:production                  # Gating production build verification

# 7. Run privacy and secret scanner
node scripts/publish/privacy-scan.ts       # 6/6 categories PASS (0 leaks, 0 real keys)
```

---

### Step 4: Create Remote GitHub Repository (Explicit Owner Gate)
Create the public GitHub repository under account `yunze7373`.

> [!NOTE]
> Execute this step **only** when ready for public visibility.

```bash
# Create public repository on GitHub and link remote
gh repo create yunze7373/Yori --public --source=. --remote=origin --description "Living Context Assistant: proactive, grounded daily orchestration that adapts without distraction."
```

If the repository already exists or was pre-created:
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

If any verification fails in Step 3 or any error occurs **prior to Step 5 (`git push`)**, restore the repository from the backup bundle `$BUNDLE`:

### Primary Option (Recommended): Fresh Clone from Bundle
The cleanest and safest rollback method creates a pristine checkout directly from the backup bundle.

```bash
# 1. Source persistent state file if variables are not set in current shell
REWRITE_STATE_FILE="${REWRITE_STATE_FILE:-$HOME/Desktop/yori-rewrite-state.env}"
if [[ -f "$REWRITE_STATE_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$REWRITE_STATE_FILE"
fi

# 2. Guard against missing or empty bundle (fails loudly without closing interactive shell)
if [[ -z "${BUNDLE:-}" || ! -s "$BUNDLE" ]]; then
  echo "❌ ERROR: Backup bundle '$BUNDLE' is missing, empty, or unset!"
  echo "Ensure $REWRITE_STATE_FILE exists or set 'export BUNDLE=/path/to/bundle' manually."
else
  # 3. Clone fresh checkout from bundle
  git clone "$BUNDLE" Yori-recovered

  # 4. Inspect restored repository
  cd Yori-recovered
  git status
  git log --oneline -n 5
fi
```

### Secondary Option: In-Place Restoration into Existing Checkout
If you wish to restore the current working directory in-place:

```bash
# 1. Source persistent state file if variables are not set in current shell
REWRITE_STATE_FILE="${REWRITE_STATE_FILE:-$HOME/Desktop/yori-rewrite-state.env}"
if [[ -f "$REWRITE_STATE_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$REWRITE_STATE_FILE"
fi

# 2. Guard against missing or empty bundle (fails loudly without closing interactive shell)
if [[ -z "${BUNDLE:-}" || ! -s "$BUNDLE" ]]; then
  echo "❌ ERROR: Backup bundle '$BUNDLE' is missing, empty, or unset!"
  echo "Ensure $REWRITE_STATE_FILE exists or set 'export BUNDLE=/path/to/bundle' manually."
else
  # 3. Detach HEAD so refs/heads/main is not locked
  git checkout --detach

  # 4. Fetch all refs with force (+) and --update-head-ok
  git fetch --update-head-ok "$BUNDLE" '+refs/*:refs/*'

  # 5. Re-attach to restored main branch and hard reset
  git checkout main
  git reset --hard

  # 6. Non-destructive clean check: list untracked files without deleting
  echo "Review untracked files (dry-run):"
  git clean -nd
  echo "Note: If you wish to discard specific rewrite artifacts, inspect the list above and remove them manually with 'rm'."
fi
```

---

## Remaining Owner Decision Gates

| Gate ID | Decision Topic | Current State | Owner Action Required |
| :--- | :--- | :--- | :--- |
| **OWNER-DEC-1** | **LICENSE Holder Text** | `Copyright (c) 2026 Han [OWNER TO CONFIRM]` in `LICENSE` | Owner confirms legal copyright entity (e.g. `Han`, `Yunze Han`, or corporate entity). |
| **OWNER-DEC-2** | **Repo Visibility Timing** | Local only | Decide whether to create as `--public` immediately or create as `--private` until demo video is uploaded. |
| **OWNER-DEC-3** | **Demo Video Link** | Submission template has placeholder | Upload video walkthrough to YouTube/Loom and populate public URL in submission docs. |
