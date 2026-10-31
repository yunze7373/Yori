# S2-CONNECTORS Evidence Summary: Settings > Connectors Screen

Governed by Architecture Rev3 Section 6, TID: `INBOX-20261031-3B6B8B`, and Acceptance Criteria AC-211-1, AC-203-2, AC-204-2, AC-205-1.

---

## 1. Visual Target & Comparison

- **Design Reference**: The RIGHT phone of owner reference mockup `yori_proactive_life_assistant_mockup.png` (sha256 `ef4cf701e3fb6bf96325a7c9a6609f3f396f6db439ce972f562e2d63d887c70d`).
- **Implementation**: `src/ui/connectors/connectors-view.ts` rendered via `src/ui/living-context/app.ts` with dedicated styles in `src/ui/living-context/styles.css`.
- **Target Viewports**:
  - Mobile: 390x844 (primary target matching the reference mockup layout).
  - Desktop: 1280x800 (centered readable column with `max-width: 720px; margin: 0 auto;` preventing stretched cards).

### Layout & Component Fidelity
1. **Top Nav Bar**: Back chevron button (`<`, accessible touch target 44x44px) + "Settings" section label.
2. **Hero Header**: Newsreader serif headline "Connectors" + subtitle "Give Yori the right context to be proactively helpful."
3. **Privacy & Control Banner**: Lock icon with bold "You control what Yori can access." and reassurance "Your data stays private and is only used to help you."
4. **Connector Cards**:
   - Location (GPS): Pin icon tile, 2-line description, dynamic status pill, and consented action controls.
   - Calendar: Calendar icon tile, 2-line description, and truthful unavailable status.
   - Weather: Sun icon tile, 2-line description, and dynamic demo city attribution.
   - XMemo: Document icon tile, 2-line description, OAuth connection status, and PKCE connect / disconnect actions.
   - Notifications: Bell icon tile, 2-line description, permission status pill, and action control.
   - More Coming Soon: Sparkle icon tile, encouraging future capability expansion.

---

## 2. Intentional Truth Deviations from Reference Mockup

The reference mockup depicts a static, aspirational design where all connectors show green "Connected" pills and Notifications displays an ungrounded toggle. In Yori, every single visual element reflects truthful runtime state read live in the active session:

1. **Zero Optimistic Claims (No Phantom "Connected")**:
   - Mockup shows green "Connected" for Location, Calendar, and Weather simultaneously.
   - Yori requires live runtime verification: rows start in their honest baseline states (`permission_needed`, `owner_gated`, or `unavailable`). No connector ever claims "Connected" unless verified live in that specific session.

2. **Location (GPS) Consented Lifecycle (INV-106)**:
   - Queries `navigator.permissions.query({ name: 'geolocation' })` without starting continuous tracking.
   - `prompt` maps to "Permission needed" with a user-initiated "Connect" button.
   - `granted` without an active session fix maps to "Allowed · not used yet" with "Acquire fix".
   - Consented acquisition triggers a single one-shot `getCurrentPosition` fix, transitioning to "Connected" ("Shared this session").
   - Revocation clears the in-session fix immediately, returns to "Allowed · not used yet", and clearly informs the user that browser/OS permissions must be revoked in site settings.
   - Coordinates are strictly forbidden from DOM rendering repo-wide (`/\d+\.\d+°/` invariant).

3. **Calendar Honest Unavailability (AC-204-2)**:
   - Mockup displays Calendar as "Connected".
   - Yori truthfully displays "Unavailable" / "Not available yet" with zero phantom toggle or mock connect button, honoring the contract that no calendar provider code exists in the client.

4. **Weather Owner Gating (AC-205-1)**:
   - Mockup displays Weather with a green "Connected" pill.
   - Yori maps weather to runtime state via `GET /api/weather/status`. When disabled by owner flag, it truthfully displays "Owner setting" ("Live weather is off (owner setting)") with zero toggle. When enabled, it displays "Connected" with the dynamic demo city name (e.g. "Open-Meteo · San Francisco, CA · fixed demo city (not your location)").

5. **XMemo Sovereign OAuth & Disconnect (AC-203-2)**:
   - Queries `GET /api/xmemo/status`. When enabled, allows connecting via PKCE flow.
   - When connected, "Disconnect" calls `POST /api/xmemo/disconnect` and re-reads status live before updating the UI. No optimistic toggle or phantom sync.

6. **Notifications Status Pill vs Toggle**:
   - Mockup renders a toggle switch.
   - Yori uses a truthful status pill (`permission_needed` / `denied` / `connected`) and explicit "Connect" gesture (`Notification.requestPermission()`). No notifications are ever dispatched from this screen, ensuring the proactive prompt budget (INV-105) remains strictly untouched.

---

## 3. Evidence Screenshots & Verification Manifest

All screenshots were captured at both viewports (Mobile 390x844 and Desktop 1280x800) using Playwright full-page rendering and are tracked in `MANIFEST.sha256`:

| Filename | Viewport | State Description |
|---|---|---|
| `01-settings-menu-mobile.png` | 390x844 | Settings modal sheet opened from header avatar button |
| `02-connectors-default-mobile.png` | 390x844 | Default truthful state (all off/permission needed, zero phantom connected) |
| `02-connectors-default-desktop.png` | 1280x800 | Default truthful state at desktop (centered <= 720px container) |
| `03-connectors-weather-live-mobile.png` | 390x844 | Live weather connected with dynamic demo city name |
| `03-connectors-weather-live-desktop.png` | 1280x800 | Live weather connected with dynamic demo city name at desktop |
| `04-connectors-location-connected-mobile.png` | 390x844 | Location granted and one-shot session fix acquired ("Shared this session") |
| `04-connectors-location-connected-desktop.png` | 1280x800 | Location granted and session fix acquired at desktop |
| `05-connectors-location-revoked-mobile.png` | 390x844 | Location session fix revoked ("Allowed · not used yet") |
| `05-connectors-location-revoked-desktop.png` | 1280x800 | Location session fix revoked at desktop |
| `06-connectors-location-denied-mobile.png` | 390x844 | Location permission denied with browser settings instructions |
| `06-connectors-location-denied-desktop.png` | 1280x800 | Location permission denied with browser settings instructions at desktop |
| `07-connectors-notifications-granted-mobile.png` | 390x844 | Notifications permission granted ("Allowed · Yori sends nothing from this screen") |
| `07-connectors-notifications-granted-desktop.png` | 1280x800 | Notifications permission granted at desktop |
| `08-connectors-xmemo-connected-mobile.png` | 390x844 | XMemo connected to remote vault with live Disconnect action |
| `08-connectors-xmemo-connected-desktop.png` | 1280x800 | XMemo connected to remote vault at desktop |

---

## 4. Quality & Compliance Verifications

- **TypeScript Compilation**: `npm run typecheck` passes with 0 errors.
- **Unit & Security Tests**: `npm test` passes 837/837 tests across 35 test files (including static security checks forbidding unauthorized GPS access or continuous tracking).
- **Golden Scenarios**: `npm run test:golden` passes 18/18 tests.
- **Integration Drills**: `npm run test:drills` passes 56/56 tests.
- **E2E Tests**: `npx playwright test tests/e2e/s2-connectors.spec.ts` passes 18/18 tests.
- **Accessibility**: Axe DevTools reports 0 critical or serious violations (WCAG 2.1 AA compliant, all contrast ratios >= 4.5:1).
- **Touch Targets**: All action buttons and icons meet or exceed 44x44px.
- **Zero Horizontal Overflow**: Verified at both 390px and 1280px widths.
- **Core Immutability**: `git diff --stat f43c6c1d HEAD -- src/core` reports 0 lines changed.
