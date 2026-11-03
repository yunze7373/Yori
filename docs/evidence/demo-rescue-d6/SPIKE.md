# D6-MULTIMODAL-TRANSIT · Step 0 coverage spike: result CUT

Run: 2026-11-03 ~15:45 JST, `npx vite-node scripts/spike-google-routes.ts`, from the Mac.

**Setup:**
- **Calls:** server-side Google Routes `computeRoutes`, `travelMode: TRANSIT`, departure 2026-11-04 10:00
  JST (tomorrow, daytime).
- **Key:** the owner's existing `GOOGLE_MAPS_API_KEY`, loaded into the process from `.env.local`. It
  was never read, printed or written by the agent, and it travels only in the `X-Goog-Api-Key` header.
- **Field mask (summary only, no polyline, no coordinates):** `routes.duration`,
  `routes.distanceMeters`, `routes.legs.steps.travelMode`, and the transit line, vehicle, stop names,
  stop count and headsign.
- **Coordinates:** public stations only, rounded to 3 decimals. Never the owner's location.

| Pair (public) | Result |
|---|---|
| Ikebukuro Station → Shibuya Station | HTTP **200**, **no route** (no `routes[0].duration`) |
| Shinjuku Station → Roppongi Hills | HTTP **200**, **no route** (no `routes[0].duration`) |

## Budget and ledger

- **Calls used:** 2 billed calls (spike budget ≤ 8).
- **Routes ledger:** `.yori-runtime/google-routes-ledger.json` went from 0 to 2 (`byMode.TRANSIT: 2`).
  It is code-enforced at 60/day, refused before the call, lowering-only (tested).
- **After the result:** no further transit spend, as instructed.

## Interpretation

- **No error:** both requests were accepted (HTTP 200, no `PERMISSION_DENIED`, `SERVICE_DISABLED` or
  `API_KEY_INVALID`), so the key has Routes API access.
- **No itinerary:** neither Japan pair returned a TRANSIT route. This matches Google's
  long-standing gap in public-transit coverage for Japan. **UNVERIFIED:** I did not re-check
  Google's documentation for this note, and I did not spend a control call outside Japan.

## Limitation of this record

The spike harness saved response bodies only for successful routes, so **the two empty response
bodies were not retained as fixtures**. Only the status and the absence of a route were recorded.
The adapter now returns the masked body for `no_routes` as well, and the script would save it. I did
not spend further calls to re-record; that is the Reviewer's decision (≤ 2 calls, within the ≤ 8
spike budget).

## Decision (per the D6 dispatch)

TRANSIT returns no routes for Japan, so **D6 closes as CUT**:
- No multimodal Build.
- No `/api/route` mode options.
- No further Routes spend.
- The earlier-leave-by path stays the D5 / S4c user-confirmed rain buffer.

What stays in the tree (unused by the app) for reproducibility:
- `src/adapters/providers/google-routes-adapter.ts` and `google-routes-ledger.ts`, with boundary
  tests: key only in the header; exact mask; refused before the call; disabled key, quota and timeout
  fail closed with codes only.
- `scripts/spike-google-routes.ts`.
