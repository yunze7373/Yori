# Yori Provider Architecture & Living Context Seams

> **Document Status:** Active Architecture Reference  
> **Governed by:** ADR-101, G-204, Acceptance Criteria AC-204-1, AC-204-2, Invariants INV-101, INV-102, INV-103, INV-106, INV-109.  
> **Phase Ref:** PH-002 Slice D1 (First Real Provider Increment: Real Clock + Keyless Weather).

---

## 1. Architectural Philosophy & Seam Isolation

Yori separates environmental perception from proactive decision-making. The deterministic core (`src/core/**`) never invokes ambient environment APIs (`Date.now()`, `fetch()`, `navigator.*`). Instead, all external temporal and environmental data enters the core strictly through typed **Provider Seams**:

```
                       ┌─────────────────────────┐
                       │   Deterministic Core    │
                       │   (runPipeline, Policy) │
                       └────────────▲────────────┘
                                    │ ContextSnapshot (frozen)
                       ┌────────────┴────────────┐
                       │     Provider Seams      │
                       │ (src/adapters/providers)│
                       └─────▲─────────────▲─────┘
                             │             │
              ┌──────────────┴──────┐ ┌────┴─────────────────┐
              │     Clock Seam      │ │    Weather Seam      │
              │  (Clock interface)  │ │   (WeatherAdapter)   │
              └──────▲───────▲──────┘ └──────▲────────▲──────┘
                     │       │               │        │
             [Simulated]   [Real]    [Simulated]    [Real]
             FixedClock  RealSystem  MockWeather  Open-Meteo
                           Clock       Adapter     Adapter
```

### Invariant Rules Enforced Across All Providers:
1. **Source Isolation (INV-102):** Signals produced by mock twins are statically and dynamically typed with `source: 'simulated'` and `label: 'simulated'`. Signals produced from live network services are typed with `source: 'real'` and `label: 'real'`.
2. **Immutable Runtime Integrity (INV-101):** All emitted signals and snapshots are deeply frozen (`deepFreeze`) before delivery to the pipeline.
3. **No Fabricated Real-World Data (INV-103):** If a real provider fails, times out, or returns invalid data, it fails closed by emitting an empty signal list. The core detects the missing signal and emits a human-first notice (`weatherMissing`). It **never** fabricates substitute data.
4. **Bounded Validity & Expiration (INV-106):** Every signal declares an `issuedAt` ISO 8601 timestamp and a positive finite `validFor` duration. Expired signals produce a stale notice (`weatherStale`) and are never cited as active evidence.

---

## 2. Provider Inventory

### 2.1 Clock Providers

| Property | `FixedClock` (Mock Twin) | `RealSystemClock` (Real Provider) |
| :--- | :--- | :--- |
| **Kind** | `fixed-clock` | `real-system-clock` |
| **Source** | `simulated` | `real` |
| **Contract** | `Clock { now(): string }` | `Clock { now(): string }` |
| **Mechanism** | Returns fixed anchored ISO string | Returns `new Date().toISOString()` |
| **Use Cases** | Deterministic scenario replay (D1–D6), golden tests, offline CI | Live real-time execution in production or live demo mode |
| **Failure Mode** | Throws if instantiated with non-ISO string | None (system clock always available) |

---

### 2.2 Weather Providers

| Property | `MockWeatherAdapter` (Mock Twin) | `OpenMeteoWeatherAdapter` (Real Provider) |
| :--- | :--- | :--- |
| **Kind** | `mock-weather-adapter` | `open-meteo-weather-adapter` |
| **Source** | `simulated` | `real` |
| **Label** | `simulated` | `real` |
| **Endpoint** | None (in-memory fixtures) | `https://api.open-meteo.com/v1/forecast` |
| **Cost** | Free (in-memory) | Free / Keyless (0 USD, no API keys or paid tiers required) |
| **License & ToS** | Repository License | [Open-Meteo Terms](https://open-meteo.com/en/terms) (accessed 2026-10-28) under **CC BY 4.0** (Non-commercial scope) |
| **Attribution** | None | Visible attribution: *"Weather data by Open-Meteo.com"* linking to `https://open-meteo.com/` |
| **Coordinates** | Static fixture coordinates | Strictly configured fixed demo-city coordinate (`DEMO_CITY_LAT`/`DEMO_CITY_LON`) |
| **Device Geolocation** | Forbidden (`navigator.geolocation` = 0 refs) | Forbidden (`navigator.geolocation` = 0 refs) |
| **Validity Window** | Scenario-defined (e.g. 10 hours) | Strictly bounded to 3,600,000 ms (1 hour) |
| **Consent Scope** | `device_only` | `device_only` |
| **Feature Flag** | Active by default in demo scenes | `WEATHER_LIVE_ENABLED` (boolean, default: `false`) |

---

## 3. Open-Meteo Integration Details (AC-204-1, AC-204-2)

### 3.1 Endpoint & Query Parameters
- **Base Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Request Parameters:**
  ```http
  GET /v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&hourly=precipitation_probability&timezone=America%2FLos_Angeles HTTP/1.1
  Host: api.open-meteo.com
  Accept: application/json
  ```

### 3.2 Terms of Service, Rate Limits, and Owner Decision Record (P2)
- **Source:** [Open-Meteo Terms of Service](https://open-meteo.com/en/terms) (Accessed: 2026-10-28).
- **Verbatim Free API Terms:**
  > *"Non-Commercial Use - By using the Free API for non-commercial use you agree to following terms:*
  > *Less than 10'000 API calls per day, 5'000 per hour and 600 per minute...*
  > *Attribution: Open-Meteo weather data is available under the Attribution 4.0 International (CC BY 4.0) license. Attribution is required. Please display 'Weather data by Open-Meteo.com' with a link to https://open-meteo.com/."*

> [!IMPORTANT] Owner Action Required: Commercial Scope Qualification
> 1. **Non-Commercial Scope:** The keyless public tier is legally restricted to non-commercial evaluation, personal use, and educational demonstrations.
> 2. **Owner Decision:** The project owner (Han) must confirm that the hackathon demo and submission qualify under Open-Meteo's non-commercial policy.
> 3. **Commercial Deployment:** Any subsequent commercialization, SaaS deployment, or volume exceeding 10,000 calls/day requires upgrading to an Open-Meteo Commercial subscription or integrating a commercial provider (e.g. Apple WeatherKit, Tomorrow.io).
> 4. **Default Setting:** `WEATHER_LIVE_ENABLED` defaults strictly to `false`. Out of the box, Yori runs 100% offline with zero external network calls.

### 3.2 Privacy & Data Minimization (AC-204-2)
1. **Configured Coordinate Only:** The adapter requests weather *only* for the configured demo-city coordinate. The default is San Francisco, CA (`37.7749`, `-122.4194`) with timezone `America/Los_Angeles`.
2. **Zero Geolocation:** Browser device geolocation APIs (`navigator.geolocation`, `getCurrentPosition`, `watchPosition`) are completely forbidden and verified by static code scan.
3. **Zero Identifiers:** Outgoing requests carry no user identifiers, account keys, cookies, or device fingerprinting tokens.

### 3.3 WMO Weather Code Mapping
Open-Meteo returns standard World Meteorological Organization (WMO) Weather Interpretation Codes (WW). The adapter translates these into domain conditions:

| WMO Code Range | Open-Meteo Description | Domain Condition | Precipitation Risk? |
| :--- | :--- | :--- | :--- |
| `0` | Clear sky | `'clear'` | No |
| `1, 2, 3` | Mainly clear, partly cloudy, overcast | `'cloudy'` | No |
| `45, 48` | Fog, depositing rime fog | `'fog'` | No |
| `51–55` | Drizzle (light, moderate, dense) | `'rain'` | Yes (precipProbability / rainfall) |
| `61–65` | Rain (slight, moderate, heavy) | `'rain'` | Yes (precipProbability / rainfall) |
| `66–67` | Freezing rain | `'rain'` | Yes |
| `71–77` | Snow fall, snow grains | `'snow'` | Yes |
| `80–82` | Rain showers (slight, moderate, violent)| `'rain'` | Yes |
| `85–86` | Snow showers | `'snow'` | Yes |
| `95–99` | Thunderstorm (slight, severe, hail) | `'rain'` | Yes |

### 3.4 Signal Output Format
When enabled and successful, the adapter emits a frozen `RealSignal<WeatherData>`:

```typescript
{
  kind: 'weather',
  value: {
    condition: 'rain',
    precipProbability: 0.85,
    temperatureC: 14.8,
    rainfall: 'moderate',
    weatherCode: 63,
    city: 'San Francisco, CA'
  },
  source: 'real',
  label: 'real',
  issuedAt: '2026-10-28T20:35:00.000Z',
  validFor: 3600000, // 1 hour bounded validity
  confidence: 1.0,
  consentScope: 'device_only'
}
```

---

## 4. Fail-Closed Degradation & Invariant Guarantees (INV-103, INV-106, D6)

1. **Flag Off (Default):** When `WEATHER_LIVE_ENABLED` is false (the default), `OpenMeteoWeatherAdapter` executes **zero network calls** and returns an empty signal array `[]`. Demo scenes continue to use their deterministic mock timeline snapshots.
2. **Network Offline / HTTP 5xx / 429 / Timeout:** The adapter catches all network and HTTP errors and returns `[]`. It never throws uncaught rejections.
3. **Core Missing Signal Notice:** When the core pipeline receives an environmental snapshot without weather data, policy emits a missing weather notice:
   ```
   "The weather forecast isn't available right now, so I won't guess."
   ```
4. **Stale Data Notice:** If cached or emitted weather has an `issuedAt` timestamp older than its `validFor` (1 hour) relative to evaluation time, policy emits a stale weather notice:
   ```
   "The weather forecast is out of date, so recommendations may be limited."
   ```

---

## 5. Security & Dev-Server Proxy

The dev-server middleware (`src/adapters/providers/server-proxy.ts`) exposes two endpoints:
- `GET /api/weather/status`: Returns current feature flag status, configured demo-city, and attribution metadata.
- `GET /api/weather/current`: Returns live weather signals when enabled; rejects with 403 Forbidden when disabled.

### Security Defenses:
- **Loopback Enforcement:** Binds only to `127.0.0.1` and `localhost`. External Host headers are rejected with HTTP 403 Forbidden.
- **Cross-Site Isolation:** Rejects `Sec-Fetch-Site: cross-site` requests with HTTP 403 Forbidden.
- **Referer Validation:** Validates local origin/referer before responding.
