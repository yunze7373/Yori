# Evidence: ASK-PROMPTS-PREMIUM (`[TID:INBOX-20261104-7911D3]`)

## 1. Overview & Vision Alignment
Governed by owner steering from Han via Telegram (2026-11-04 21:06 JST):
> *"所有的提示词都适用英语。另外所有的内容应该更加高级。这里纯文字的提示词太垃圾了。真的完全达不到我之前在xmemo记忆里保存的设想的要求。"*

This slice elevates the Ask Yori conversation entry experience from plain text command instructions into a distinctive, proactive living context companion:
1. **English Only**: Purged all non-English text (`'附近吃什么'`) from user-visible openers, prompts, and composer placeholders.
2. **Warm Opener in Yori's Voice**: Replaced plain command syntax lists with *"Here's what I can look into for you."*
3. **Contextual Suggestion Chips**: Tappable, pill-radius suggestion chips for each interaction context:
   - **Live idle**: `"Lunch nearby"`, `"Somewhere quiet"`, `"Closer to me"`
   - **Lunch scene**: `"Somewhere quieter"`, `"Vegetarian options"`, `"Closer to me"`
   - **Depart scene**: `"Leave 15 minutes later"`, `"Take the bus"`
   - **Fuel scene**: `"Find gas nearby"`
4. **Quiet Precision Tokens**: Hairline border (`var(--qp-line-strong)`), sage/forest palette (`var(--qp-forest)`, `var(--qp-sage)`, `var(--qp-sage-wash)`), $\ge 44$ px touch targets, 8-pt rhythm, responsive wrapping across mobile (390x844) and desktop (1280x800), and `prefers-reduced-motion` compliance.
5. **No Why & No Confirm/Undo Hints**: Zero "Why" suggestions (per Addendum 2) and zero confirm/undo instructional syntax.

---

## 2. Visual Proofs

### Live Idle
- **Mobile (390x844)**: `live-idle-390x844.png`
- **Desktop (1280x800)**: `live-idle-1280x800.png`
Shows warm opener *"Here's what I can look into for you."* with 3 pill suggestion chips (`"Lunch nearby"`, `"Somewhere quiet"`, `"Closer to me"`), clean wrap at 390, and placeholder `"Ask Yori anything"`.

### Lunch Scene
- **Mobile (390x844)**: `lunch-390x844.png`
- **Desktop (1280x800)**: `lunch-1280x800.png`
Shows context-aware refinement chips (`"Somewhere quieter"`, `"Vegetarian options"`, `"Closer to me"`).

---

## 3. Automated Verification Matrix
- **Unit Suite (`vitest`)**:
  - `src/ui/action-state/store.test.ts` (33/33 tests passing): verified all 4 scene openers, suggestions arrays, zero CJK characters, and zero Why/confirm hints.
  - `src/ui/conversation/grammar.test.ts` (41/41 tests passing): verified deterministic interpretation for all 8 suggestion chip phrases into valid intents (`FIND_LUNCH`, `LEAVE_LATER`, `CHANGE_ROUTE`, `FIND_FUEL`).
  - `npm test` (76/76 test files, 1366/1366 tests passing).
- **E2E Suite (`playwright`)**:
  - `tests/e2e/ask-prompts-premium.spec.ts` (5/5 tests passing): 390x844 & 1280x800 viewports, tap interaction, $\ge 44$ px touch targets, and zero CJK assertions.
  - Regression suite (`v2-smoke`, `v2a-interaction`, `v2b-lunch-loop` - 25/25 passing).
