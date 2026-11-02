# Feasibility Note: Sourced Target-Time Weather Forecast for S4 (ARCH-LIVE-FIRST-TARGET-TIME-FORECAST)

> Non-gating, no dispatch. S4 stays ACCEPTED-NARROWED; no plan change. S6 agent-prep proceeds independently.

## Verdict

Feasible, small, zero-fee — but a forecast alone does **not** honestly enable `rain moves leave-by earlier`. It enables truthful forward-looking rationale (`rain expected at 3 PM`) plus umbrella preparation. An earlier leave-by additionally needs a duration delta from an honest source: a second travel mode (unavailable — deferred) or the user-confirmed buffer (S4c).

## Provider and ToS

The existing adapter already calls the keyless Open-Meteo forecast endpoint (`/v1/forecast` with `current=...` plus `hourly=precipitation_probability`, `src/adapters/providers/open-meteo-adapter.ts:132-136`). Target-time use extends the same call: request `hourly=weather_code,temperature_2m` plus the `time` array and select the bins covering the `[depart, arrive]` window. Same terms as W1 (free non-commercial, CC BY 4.0 attribution, rate limits), negligible extra payload, no key, no new consent (uses the already-consented fix). **No new owner gate for the data** — W1 acknowledgement covers it.

## Provenance contract (adapters/UI only, core untouched)

A `weather-forecast` signal (or extended payload on the existing weather signal): `provider=open-meteo`, `issuedAt` = fetch time, `validFor` = 1h (same as current-conditions), `validAt` = the `[departIso, arriveIso]` window it speaks about, `confidence` capped below 1.0 (0.8: forecast uncertainty, never presented as observation), `provenance=live`, label `forecast` visually distinct from `current`. Fail-closed: missing or stale hourly bins yield no forecast signal and the current-conditions path stands unchanged (INV-103, INV-106).

## Feeding src/plugins/depart

Adapters-only extension plus one plugin precedence rule: forecast-at-window informs preparation and rationale; duration math is untouched — single-mode OSRM drive duration remains the only duration source. No core changes (AC-EXT-1).

## What it honestly unlocks

- Forecast alone: `Rain expected at 3 PM · take an umbrella; leave time unchanged` — better rationale, same leave-by.
- Forecast plus S4c (user-confirmed conditional rule, e.g. `if rain forecast at departure, apply my +15`): `Rain expected — moved leave-by earlier per your +15 rain buffer`, labelled `provenance=user`. This is the only honest route to an earlier leave-by without a second mode.

## Effort and gates

About 3–4h if ever scheduled: proxy parameter extension, window-bin selection, signal payload, plugin precedence rule, recorded e2e, static gates. Not scheduled by this note. Owner gates: none new; only the standing S4c explicit-confirmation condition.
