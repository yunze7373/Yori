# Recording the demo video without XMemo

Owner directive (2026-11-03 15:52 JST): **XMemo must not appear in the demo video.** The recording
build hides every XMemo surface and makes no XMemo request. Memory stays fully functional and honest:
facts you confirm are saved on this device and labelled that way.

## One command (on the Mac, in the repo folder)

```bash
npm run demo:record
```

This builds the app and serves it at **http://localhost:4173** with `YORI_DEMO_HIDE_XMEMO=1`. Open
that URL and record. Stop it with Ctrl+C.

- **Port 4173 busy?** Stop whatever is using it first. `--strictPort` refuses to start on another
  port, because the first-party `/api` proxies accept only localhost on 4173, 4174 or 5173.
- **Phone through surface E:** run `YORI_DEMO_HIDE_XMEMO=1 npm run preview -- --port 4174`, then
  `ssh -N -R 4174:localhost:4174 op8t`, and open `http://localhost:4174` on the phone
  (`docs/demo/DEMO_HTTPS.md`).
- **Phone over LAN HTTPS:** `YORI_DEMO_HIDE_XMEMO=1 npm run demo:https`.

## What the switch does

- **Server:** `/api/weather/status` adds `demo: { hideXmemo: true }`. Every `/api/xmemo/*` route
  answers disabled (status `{ enabled: false, connected: false }`, all others `403`).
- **Client:** the app waits for that flag before any memory sync, so it sends **no** `/api/xmemo`
  request. It hides the XMemo connector chip, the Connectors card, the Me-page sync section and its
  copy, and the Sources-sheet wording. The memory source reads *Local only · saved on this device*.
- **Default off:** without the variable, every build behaves exactly as before.

## Verified

`tests/e2e-live/demo-xmemo-free.spec.ts` runs a server with the switch on, at 390×844 and
1280×800. It visits 13 screens:

- Live consent and the lunch card
- the Sources sheet and the Why sheet
- the Ask panel
- Plans, For You and Me & Memory
- Connectors
- Demo home, the Demo rain and lunch scenes
- the decision log

On each screen it asserts that **neither the page text nor any attribute value** contains "xmemo",
and that the page made **zero** `/api/xmemo` requests. Screenshots are in
`docs/evidence/demo-xmemo-free/`.

Paid model calls during the actual recording are allowed by the owner (always ledgered). The tests
make none.
