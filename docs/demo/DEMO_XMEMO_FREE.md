# Recording the demo video without XMemo

Owner directive (2026-11-03 15:52 JST): **XMemo must not appear in the demo video.** The recording
build hides every XMemo surface and makes no XMemo request. Memory stays fully functional and honest:
facts you confirm are saved on this device and labelled that way.

## One command (on the Mac, in the repo folder)

```bash
npm run demo:record
```

This builds the app with the recording marker `VITE_YORI_DEMO_HIDE_XMEMO=1` and serves it at
**http://localhost:4173** with the server switch `YORI_DEMO_HIDE_XMEMO=1`. Open that URL and record.
Stop it with Ctrl+C.

- **Fail-closed build:** the build itself hides XMemo, so it stays XMemo-free even if a server answer
  fails, is blocked or is slow.
- **Port 4173 busy?** Stop whatever is using it first. `--strictPort` refuses to start on another
  port, because the first-party `/api` proxies accept only localhost on 4173, 4174 or 5173.

### Phone through surface E (the D7 pattern)

Serve on a free Mac port and forward the phone's `localhost:4174` to it. Mac port 4174 is taken on
this Mac.

```bash
VITE_YORI_DEMO_HIDE_XMEMO=1 npm run build && YORI_DEMO_HIDE_XMEMO=1 npx vite preview --port 4294 --strictPort
```

```bash
ssh -N -R 4174:localhost:4294 op8t
```

Open `http://localhost:4174` on the phone (`docs/demo/DEMO_HTTPS.md`, surface E).

### Phone over LAN HTTPS

```bash
VITE_YORI_DEMO_HIDE_XMEMO=1 YORI_DEMO_HIDE_XMEMO=1 npm run demo:https
```

`demo:https` runs its own build, which picks up the marker from the environment.

**After recording:** the marker is baked into `dist/`. Run a plain `npm run build` before serving a
normal build again.

## What the switch does

- **Server:** `/api/weather/status` adds `demo: { hideXmemo: true }`. Every `/api/xmemo/*` route
  answers disabled (status `{ enabled: false, connected: false }`, all others `403`).
- **Client:** a build made with `VITE_YORI_DEMO_HIDE_XMEMO=1` hides XMemo from the first instant
  and never calls `/api/xmemo`, whatever the server answers. That marker is non-secret and baked in
  at build time; it **fails closed**. A build without the marker waits for the server flag, so it
  also sends **no** `/api/xmemo` request when the server switch is on and answers. It hides the XMemo connector chip, the Connectors card, the Me-page sync section and its
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

It also re-runs the check with `/api/weather/status` failing (HTTP 500), aborted, and delayed by 6 s
(past the 5 s flag timeout): still no XMemo and zero `/api/xmemo` requests. A mutation check builds
without the marker, and those three tests then fail, which is the Reviewer's probe.

Paid model calls during the actual recording are allowed by the owner (always ledgered). The tests
make none.
