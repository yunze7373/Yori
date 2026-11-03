# DEMO-XMEMO-FREE UI review pack

All screenshots come from `tests/e2e-live/demo-xmemo-free.spec.ts`. That spec runs against the
demo-recording build (`YORI_DEMO_HIDE_XMEMO=1`, providers and model pinned off, places recorded), at
390×844 and 1280×800. On every screen the spec asserts:

- `document.body.innerText` and **every attribute value of every element** contain no
  case-insensitive "xmemo";
- the page made **zero** `/api/xmemo` requests over the whole run.

| Screen (file prefix) | Notes |
|---|---|
| `live-consent` | Live home before consent: the location consent sheet. The connector strip has no XMemo chip |
| `live-lunch` | Live lunch card after consent. **D3 floor:** at scroll top, name, distance, open state, basis and Directions end above the docked Ask bar |
| `sources-sheet` | The memory source reads **Local only · saved on this device** |
| `why-sheet` | The Why sheet: memory facts carry their real source (local / you confirmed) |
| `ask-panel` | The Ask panel |
| `plans`, `for-you` | Tabs |
| `me-memories` | Me & Memory: no sync section. The connector list reads "Location, Calendar, Weather, and Notifications". Reset copy reads "the preferences and history saved on this device" |
| `connectors` | Settings → Connectors: no XMemo card |
| `demo-home`, `demo-rain`, `demo-lunch` | Demo scenes (dev build) |
| `decision-log` | The Ask panel with the dev decision-log inspector open |

**Mutation check:** with the client flag forced off, the same spec fails at its first screen
(`live-consent`), so the scan does detect XMemo when it is present.

**Switch off (default):** the weather status carries no `demo` field and every XMemo surface and
test behaves as before (boundary test plus the unchanged suites).
