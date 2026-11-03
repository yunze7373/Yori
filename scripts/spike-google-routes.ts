/**
 * D6-MULTIMODAL-TRANSIT STEP 0: Google Routes TRANSIT coverage spike (DEMO_RESCUE rev12).
 * Two PUBLIC Tokyo station pairs, TRANSIT, tomorrow 10:00 JST. Never the owner's location.
 * - Budget: at most 8 billed calls for the spike, AND the code-enforced Routes ledger (60/day,
 *   refused before the call). This script makes 2 calls unless one is refused or the key fails.
 * - The key is loaded from .env.local into the process only; it is never printed, logged or
 *   written. Responses use the summary field mask (no polyline, no coordinates) and are checked
 *   for key material before they are saved as recorded fixtures.
 * - Stops at once on key_not_enabled (403 PERMISSION_DENIED / SERVICE_DISABLED / API_KEY_INVALID).
 * Usage: npx vite-node scripts/spike-google-routes.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadEnvLocal } from '../src/adapters/model/server-proxy.js';
import { GoogleRoutesAdapter, type GoogleRouteResult } from '../src/adapters/providers/google-routes-adapter.js';
import { FileGoogleRoutesLedger, MemoryGoogleRoutesLedger, type GoogleRoutesLedger } from '../src/adapters/providers/google-routes-ledger.js';

const SPIKE_BUDGET = 8;
const DEPARTURE = '2026-11-04T01:00:00Z'; // 10:00 JST tomorrow
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const PAIRS = [
  { id: 'ikebukuro-shibuya', from: 'Ikebukuro Station', to: 'Shibuya Station', o: { lat: 35.7295, lng: 139.7109 }, d: { lat: 35.658, lng: 139.7016 } },
  { id: 'shinjuku-roppongi-hills', from: 'Shinjuku Station', to: 'Roppongi Hills', o: { lat: 35.6896, lng: 139.7006 }, d: { lat: 35.6605, lng: 139.7292 } },
];

async function main() {
  loadEnvLocal(process.cwd());
  const apiKey = process.env['GOOGLE_MAPS_API_KEY']?.trim();
  if (!apiKey) {
    console.log(JSON.stringify({ stopped: 'GOOGLE_MAPS_API_KEY is not set (owner action)' }));
    return;
  }
  const fileLedger = new FileGoogleRoutesLedger();
  const before = fileLedger.read();
  const spikeBudget = new MemoryGoogleRoutesLedger(SPIKE_BUDGET);
  const both: GoogleRoutesLedger = { tryReserve: m => spikeBudget.tryReserve(m) && fileLedger.tryReserve(m) };
  const adapter = new GoogleRoutesAdapter({ apiKey, ledger: both });
  const outDir = path.resolve('tests/fixtures/google-routes');
  fs.mkdirSync(outDir, { recursive: true });

  const results: unknown[] = [];
  for (const p of PAIRS) {
    const r: GoogleRouteResult = await adapter.computeRoute({
      origin: { lat: round3(p.o.lat), lng: round3(p.o.lng) },
      destination: { lat: round3(p.d.lat), lng: round3(p.d.lng) },
      mode: 'TRANSIT',
      departureTime: DEPARTURE,
    });
    if (r.ok) {
      const rawText = JSON.stringify(r.raw, null, 2);
      if (rawText.includes(apiKey) || /AIza[0-9A-Za-z_-]{20,}/.test(rawText)) throw new Error('key material in response; not saved');
      fs.writeFileSync(
        path.join(outDir, `${p.id}-transit.json`),
        JSON.stringify({ recorded: { pair: `${p.from} -> ${p.to}`, mode: 'TRANSIT', departureTime: DEPARTURE, fetchedAt: r.fetchedAt, fieldMask: 'summary (no polyline, no coordinates)' }, response: r.raw }, null, 2) + '\n'
      );
      results.push({ pair: p.id, ok: true, durationMin: Math.round(r.durationSeconds / 60), distanceM: r.distanceMeters, transitLegs: r.transit });
    } else {
      if (r.reason === 'no_routes' && r.raw !== undefined) {
        const rawText = JSON.stringify(r.raw, null, 2);
        if (!rawText.includes(apiKey)) {
          fs.writeFileSync(path.join(outDir, `${p.id}-transit.json`), JSON.stringify({ recorded: { pair: `${p.from} -> ${p.to}`, mode: 'TRANSIT', departureTime: DEPARTURE, result: 'no_routes' }, response: r.raw }, null, 2) + '\n');
        }
      }
      results.push({ pair: p.id, ok: false, reason: r.reason, httpStatus: r.httpStatus, codes: r.codes });
      if (r.reason === 'key_not_enabled' || r.reason === 'ledger_stop' || r.reason === 'quota_exceeded') break;
    }
  }
  const after = fileLedger.read();
  console.log(JSON.stringify({ ledgerBefore: before.total, ledgerAfter: after.total, spikeCalls: spikeBudget.total, results }, null, 1));
}

main().catch(e => {
  console.log(JSON.stringify({ error: String(e?.message ?? e).slice(0, 200) }));
  process.exit(1);
});
