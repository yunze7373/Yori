# Demo serve: phone over trusted LAN HTTPS (DEMO_RESCUE D1)

Phone browsers only allow geolocation in a **secure context**. Over plain LAN HTTP
(`http://192.168.x.x:4174`) the location request is silently denied, so the weather near you never
appears. This page lists the exact owner steps for the three supported demo surfaces. There is no
production URL, no tunnel and no public exposure: everything runs on the owner's Mac for the length
of the demo.

| Surface | Secure context | When to use |
|---|---|---|
| A. Phone over trusted LAN HTTPS (`npm run demo:https`) | Yes, after a one-time mkcert root CA install on the phone | Primary phone demo |
| B. Android over USB (`chrome://inspect` port forwarding) | Yes (`localhost` on the phone) | Android, if installing a CA is unwanted |
| C. Mac browser at `http://localhost:4174` | Yes (`localhost`) | Guaranteed fallback. It leads the demo script if A/B is not verified before the run |

Never tap through a certificate warning ("Show details → visit this website", "Advanced →
Proceed"). Geolocation after a certificate-error bypass is not reliable on iOS Safari or Android
Chrome. If you see a warning, the CA step below is missing, so fix that or use surface C.

Provider flags are unchanged by any of these commands. Since the owner's §9 confirmation (D2), the
keyless trio (nearby places, routes, weather) is on by default. Start a serve with
`WEATHER_LIVE_ENABLED=false` (or `PLACES_LIVE_ENABLED=false`, `ROUTE_LIVE_ENABLED=false`) to switch
one off; the app then shows it as `Off (owner setting)`. Browser location consent is still asked
every session.

## A. Phone over trusted LAN HTTPS

One-time setup on the Mac (Terminal, in the repo folder):

```bash
brew install mkcert
mkcert -install
mkdir -p .yori-runtime/demo-https
mkcert -cert-file .yori-runtime/demo-https/cert.pem -key-file .yori-runtime/demo-https/key.pem <mac-lan-ip> localhost 127.0.0.1
```

- `npm run demo:https -- --check` prints the detected `<mac-lan-ip>` (and the exact `mkcert` line
  to copy) when no certificate exists yet.
- `.yori-runtime/` is gitignored, as are `*.pem` and `*.key`. The certificate and key never enter git.
- `mkcert -CAROOT` prints the folder holding `rootCA.pem`. Only `rootCA.pem` goes to the phone.
  **Never share `rootCA-key.pem`.**
- If the Mac's LAN address changes (new Wi-Fi), re-run the last `mkcert` line with the new address.

Install the root CA on the phone (one time):

**iPhone / iPad (iOS 16+)**
1. Send `rootCA.pem` to the phone (AirDrop, or Mail it to yourself and open the attachment).
2. iOS says "Profile Downloaded". Open **Settings → General → VPN & Device Management**, tap the
   mkcert profile, then **Install**.
3. Open **Settings → General → About → Certificate Trust Settings** and switch on full trust for the
   mkcert root certificate.

**Android (Chrome)**
1. Copy `rootCA.pem` to the phone (USB, Drive, or email).
2. **Settings → Security & privacy → More security settings → Encryption & credentials → Install a
   certificate → CA certificate**, accept the warning, pick `rootCA.pem`. The menu names differ by
   vendor; search Settings for "CA certificate".
3. Chrome trusts user-installed CAs. If a warning still appears, use surface B instead.

Each demo run (Mac and phone on the same Wi-Fi):

```bash
npm run demo:https
```

1. The script builds the shipping bundle and prints `open https://<mac-lan-ip>:4443/`.
2. On the phone, open that exact URL. The padlock shows and there is no warning.
3. Tap **Use My Location**, then **Allow** in the browser prompt.
4. The weather tile shows the current conditions at your fix with `Open-Meteo · near you · as of <time>`.
5. Press Ctrl+C on the Mac to stop the LAN serve when the demo ends.

macOS may ask whether `node` may accept incoming connections. Allow it for the demo. Without it the
phone cannot reach the Mac.

## B. Android over USB (no CA install)

1. On the phone: **Settings → About phone**, tap **Build number** seven times, then turn on
   **Developer options → USB debugging**.
2. On the Mac: `npm run build && npm run preview -- --port 4174`.
3. Connect the phone by USB and accept the "Allow USB debugging" prompt.
4. In desktop Chrome open `chrome://inspect/#devices`, click **Port forwarding…**, add
   `4174` → `localhost:4174`, tick **Enable port forwarding**, then **Done**.
5. On the phone, open `http://localhost:4174` in Chrome. `localhost` is a secure context, so the
   location prompt works.

## C. Mac fallback: `http://localhost:4174`

```bash
npm run build && npm run preview -- --port 4174
```

Open `http://localhost:4174` in Safari or Chrome on the Mac, click **Use My Location**, then
**Allow**. Weather follows the Mac's location fix. Deny path: click **Deny** on the location card
(or use a second browser profile). The guided location card stays and no weather is rendered.

## Privacy

- The page sends the fix to the first-party proxy rounded to 3 decimals (about 100 m), as
  `/api/weather/current?coords=lat,lng`. The proxy re-rounds and validates it (a malformed value
  gives 400) before it queries Open-Meteo.
- The proxy never logs coordinates. Error responses never echo the submitted value.
- No fix or no consent: Live sends no weather request at all and shows the guided location card. The
  fixed demo city is only used in dev (`?dev=1`) and recorded tests.
- Weather data by Open-Meteo.com, CC BY 4.0.
