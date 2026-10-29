/**
 * Provider Adapters (PH-002 D1, AC-204-1, AC-204-2)
 *
 * Real provider increment + mock twins:
 * - RealSystemClock & FixedClock
 * - OpenMeteoWeatherAdapter (real keyless weather) & MockWeatherAdapter (mock twin)
 * - Demo city coordinate constants & Open-Meteo attribution
 */

export * from './clock.js';
export * from './weather-types.js';
export * from './real-signal.js';
export * from './mock-weather-adapter.js';
export * from './open-meteo-adapter.js';
export * from './location-port.js';
export * from './places-types.js';
export * from './simulated-places-provider.js';
export * from './overpass-places-adapter.js';
