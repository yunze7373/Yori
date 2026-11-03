/**
 * D5-LIVE-FORECAST: the user's confirmed rain buffer, as APPLIED to a plan.
 * The depart preparer cites `rain_buffer_minutes` in why.memoryFactsUsed only when it actually
 * moved the leave-by (rain expected + a user-confirmed fact), so every view model that works back
 * from leave-by to travel time adds it to `prep_buffer_minutes`; otherwise it is 0.
 */
export function appliedRainBufferMinutes(plan: { why?: { memoryFactsUsed?: readonly { key: string; value: unknown }[] } } | null | undefined): number {
  const fact = plan?.why?.memoryFactsUsed?.find(f => f.key === 'rain_buffer_minutes');
  return typeof fact?.value === 'number' && Number.isFinite(fact.value) && fact.value > 0 ? fact.value : 0;
}

/** D5: the depart plan's forecast citation (set by the preparer when a forecast drove the plan). */
export interface ForecastCitationInfo {
  readonly rainExpected: boolean;
  /** "2:00 PM–3:00 PM" in the plan's time zone, when rain is expected. */
  readonly rainSpan: string | null;
}

export function forecastCitation(plan: { why?: { evidenceSignals?: readonly unknown[] } } | null | undefined): ForecastCitationInfo | null {
  const cite = plan?.why?.evidenceSignals?.find(
    s => (s as { kind?: string }).kind === 'weather' && (s as { value?: { forecast?: unknown } }).value?.forecast === true
  ) as { value: { rainExpected?: unknown; rainSpan?: unknown } } | undefined;
  if (!cite) return null;
  return {
    rainExpected: cite.value.rainExpected === true,
    rainSpan: typeof cite.value.rainSpan === 'string' ? cite.value.rainSpan : null,
  };
}

/**
 * D5: the ONE status line for a Live depart plan's weather basis (fits one line at 390 px; the
 * Open-Meteo attribution link stays visible in the header). 'unavailable' = the forecast was
 * requested but missing/stale, so current conditions are used.
 */
export function forecastStatusLine(
  plan: Parameters<typeof forecastCitation>[0] & Parameters<typeof appliedRainBufferMinutes>[0],
  forecastState: 'ok' | 'unavailable' | 'pending' | undefined
): string | undefined {
  const f = forecastCitation(plan);
  if (f) {
    if (!f.rainExpected) return 'Forecast · dry for your trip';
    const moved = appliedRainBufferMinutes(plan);
    return moved > 0 ? `Forecast · leaving ${moved} min earlier (your rain buffer)` : 'Forecast · leave-by unchanged, no rain buffer set';
  }
  if (forecastState === 'unavailable') return 'Forecast unavailable · using current conditions';
  return undefined;
}
