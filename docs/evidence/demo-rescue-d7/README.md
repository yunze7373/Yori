# D7-LICENSED-PLACES evidence (DEMO_RESCUE rev12)

## Recorded-provider screenshots (`tests/e2e-live/live-google-places.spec.ts`, `UPDATE_EVIDENCE=1`)
Recorded data in the exact shape the D7 `/api/places` proxy emits; the photo URI is served locally
so the test stays offline. Tokyo-Shinjuku fixture fix, local time ≈ 18:00, cold user.

| File | What it shows (gate A functional / B experience) |
|---|---|
| `d7-google-lunch-390x844.png`, `d7-google-lunch-1280x800.png` | Google path: photo thumb, `★ 4.6 (1,204)`, `$$`, `Open now`, reason `Open now · from Google opening hours`, credits `Powered by Google · Photo: Ann`, attribution line `Powered by Google · nearby places` |
| `d7-google-detail-390x844.png`, `d7-google-detail-1280x800.png` | Restaurant detail with rating/price chips and Google attribution; no Leaflet map |
| `d7-failover-osm-390x844.png`, `d7-failover-osm-1280x800.png` | Google failed → OpenStreetMap answer, labelled `Google did not answer · showing OpenStreetMap via Overpass (ODbL)`; no Google strings, photos or credits |

Asserted beyond the pictures: no request URL contains `key=` or the key; no DOM attribute or markup
contains either; `.leaflet-container` count is 0 on every view with Google fields; the failover view
contains no `googleusercontent` URI and no `Powered by Google`.

## Device proof
See `DEVICE_LOG.md` (counts only; no venue names, photos or coordinates committed).
