# D7 device log: real Google candidates on op8t (surface E, port 4174)

Run: 2026-11-03 07:02–07:07 JST, OnePlus 8T, Chrome, `http://localhost:4174` forwarded with
`ssh -N -R 4174:localhost:4294 op8t` (Mac port 4174 is held by an unrelated older preview). Shipping
build, keyless trio at its default (ON), owner key loaded server-side from `.env.local` (never read,
printed or sent to the device). Raw captures stay in gitignored `.yori-runtime/device-evidence/`.

| Check | Result |
|---|---|
| `/api/places/status` (Mac, Host localhost:4174) | `enabled=true`, `discovery=google`, hosts `places.googleapis.com`, `overpass-api.de/api/interpreter`, `maps.mail.ru/osm/tools/overpass/api/interpreter`; no key material in the payload |
| Consent | `Use My Location` → Chrome prompt → **Only this time** |
| After consent | `Weather near you` (Open-Meteo) rendered |
| **Nearby now** | a Google candidate card rendered on the phone: 1 hero card with a Google photo, `Powered by Google` and a photo-author credit; attribution line `Powered by Google · nearby places`. The first tap landed while the page was still settling; the second tap produced the card. |
| Stop | forward and preview stopped; phone screen put back to sleep |

## Billed Google calls (first billed Google use; `.yori-runtime/google-places-ledger.json`)
| SKU | Calls |
|---|---|
| `places.searchNearby` (Nearby Search Enterprise: rating / priceLevel / openingHours in the mask) | 5 |
| `places.photos.media` (Place Details Photos, `skipHttpRedirect=true`, server-side) | 15 |
| **Total** | **20** (≈ USD 0.28 at list price; daily hard stop 150) |

Why 5 searches for 2 taps: the grant and Live's automatic focus/60 s refreshes also queried Google,
and each search resolved photos again. Fixed in the same slice: Google results are now reused for
5 minutes for automatic refreshes (only an explicit Nearby now sends `fresh=1`), and photo URIs are
cached for 10 minutes. Covered by the cost-guard boundary test.
