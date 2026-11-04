/**
 * Live Smoke Script: LLM-REPLY-GROUNDED (TID: INBOX-20261104-FA2315)
 *
 * Demonstrates live model-written replies via the server proxy for:
 * 1. Lunch: "somewhere quieter"
 * 2. Depart: "leave 15 minutes later"
 * 3. Free question: "is it far?"
 *
 * Enforces:
 * - Real live model dispatch (authorized by owner steering addendum 2026-11-04 23:28 JST)
 * - Strict Invariant INV-103 fact-checking
 * - Ledger reservation before dispatch, real token/cost tracking
 * - Reports ledger delta (calls, tokens, USD)
 * - Never prints secrets or keys
 */

import {
  ModelDevProxy,
  readLedgerState,
  resolveModelConfig,
} from '../src/adapters/model/server-proxy.js';
import { validateAssistantReply } from '../src/adapters/model/fact-checker.js';

async function main() {
  console.log('======================================================================');
  console.log('🚀 YORI LLM-REPLY-GROUNDED — LIVE MODEL SMOKE TEST');
  console.log('======================================================================\n');

  const config = resolveModelConfig((msg) => console.log(`[Config] ${msg}`));
  const ledgerBefore = readLedgerState(config.ledgerPath);

  console.log('📊 Ledger Before:');
  console.log(`   Calls:      ${ledgerBefore.callCount}`);
  console.log(`   Tokens In:  ${ledgerBefore.tokensIn ?? 0}`);
  console.log(`   Tokens Out: ${ledgerBefore.tokensOut ?? 0}`);
  console.log(`   USD Est:    $${(ledgerBefore.usdEstimate ?? 0).toFixed(6)}\n`);

  if (!config.apiKey) {
    console.error('❌ Error: MODEL_API_KEY / META_API_KEY not configured in .env.local');
    process.exit(1);
  }

  const proxy = new ModelDevProxy(
    {
      ...config,
      liveEnabled: true,
      timeoutMs: 30000,
      allowExtendedVerificationTimeout: true,
    },
    (msg) => console.log(`   [ProxyLog] ${msg}`)
  );

  // Scenario 1: Lunch ("somewhere quieter")
  console.log('--- Scenario 1: Lunch ("somewhere quieter") ---');
  const lunchFacts = {
    utterance: 'somewhere quieter',
    knownFactKeys: ['lunch_preference', 'work_location'],
    validPlaces: ['Midori Soba', 'Sakura Bento', 'Ramen House'],
    validTimes: ['12:30 PM', '1:00 PM'],
    suppliedDistances: ['350m', '500m', '800m'],
    suppliedRatings: ['4.7', '4.3', '4.1'],
  };
  const t0 = Date.now();
  const lunchRes = await proxy.handleCommand(lunchFacts);
  const lunchDuration = Date.now() - t0;

  console.log(`   Status:       ${lunchRes.engineStatus}`);
  console.log(`   Used Fallback:${lunchRes.usedFallback} ${lunchRes.fallbackReason ? `(${lunchRes.fallbackReason})` : ''}`);
  console.log(`   Intent:       ${lunchRes.result?.intent ?? 'none'}`);
  console.log(`   Reply:        "${lunchRes.result?.reply ?? ''}"`);
  console.log(`   Duration:     ${lunchDuration}ms`);

  if (lunchRes.result?.reply) {
    const check = validateAssistantReply(
      lunchRes.result.reply,
      {
        places: lunchFacts.validPlaces,
        times: lunchFacts.validTimes,
        distances: lunchFacts.suppliedDistances,
        ratings: lunchFacts.suppliedRatings,
        prices: [],
      },
      lunchRes.result.intent
    );
    console.log(`   Grounding:    ${check.valid ? 'VALID (INV-103 satisfied)' : `FAILED (${check.reason}: ${check.error})`}`);
  }
  console.log('');

  // Scenario 2: Depart ("leave 15 minutes later")
  console.log('--- Scenario 2: Depart ("leave 15 minutes later") ---');
  const departFacts = {
    utterance: 'leave 15 minutes later',
    knownFactKeys: ['prep_duration', 'commute_habit'],
    validPlaces: ['Piano Studio', 'Downtown Office'],
    validTimes: ['2:15 PM', '2:30 PM', '2:45 PM'],
    availableModes: ['drive', 'bus'],
  };
  const t1 = Date.now();
  const departRes = await proxy.handleCommand(departFacts);
  const departDuration = Date.now() - t1;

  console.log(`   Status:       ${departRes.engineStatus}`);
  console.log(`   Used Fallback:${departRes.usedFallback} ${departRes.fallbackReason ? `(${departRes.fallbackReason})` : ''}`);
  console.log(`   Intent:       ${departRes.result?.intent ?? 'none'}`);
  console.log(`   Reply:        "${departRes.result?.reply ?? ''}"`);
  console.log(`   Duration:     ${departDuration}ms`);

  if (departRes.result?.reply) {
    const check = validateAssistantReply(
      departRes.result.reply,
      {
        places: departFacts.validPlaces,
        times: departFacts.validTimes,
        distances: [],
        ratings: [],
        prices: [],
      },
      departRes.result.intent
    );
    console.log(`   Grounding:    ${check.valid ? 'VALID (INV-103 satisfied)' : `FAILED (${check.reason}: ${check.error})`}`);
  }
  console.log('');

  // Scenario 3: Free question ("is it far?")
  console.log('--- Scenario 3: Free question ("is it far?") ---');
  const freeFacts = {
    utterance: 'is it far?',
    knownFactKeys: ['current_location'],
    validPlaces: ['Midori Soba'],
    validTimes: [],
    suppliedDistances: ['350m'],
  };
  const t2 = Date.now();
  const freeRes = await proxy.handleCommand(freeFacts);
  const freeDuration = Date.now() - t2;

  console.log(`   Status:       ${freeRes.engineStatus}`);
  console.log(`   Used Fallback:${freeRes.usedFallback} ${freeRes.fallbackReason ? `(${freeRes.fallbackReason})` : ''}`);
  console.log(`   Intent:       ${freeRes.result?.intent ?? 'none'}`);
  console.log(`   Reply:        "${freeRes.result?.reply ?? ''}"`);
  console.log(`   Duration:     ${freeDuration}ms`);

  if (freeRes.result?.reply) {
    const check = validateAssistantReply(
      freeRes.result.reply,
      {
        places: freeFacts.validPlaces,
        times: freeFacts.validTimes,
        distances: freeFacts.suppliedDistances,
        ratings: [],
        prices: [],
      },
      freeRes.result.intent
    );
    console.log(`   Grounding:    ${check.valid ? 'VALID (INV-103 satisfied)' : `FAILED (${check.reason}: ${check.error})`}`);
  }
  console.log('');

  // Ledger Delta Report
  const ledgerAfter = readLedgerState(config.ledgerPath);
  const deltaCalls = ledgerAfter.callCount - ledgerBefore.callCount;
  const deltaTokensIn = (ledgerAfter.tokensIn ?? 0) - (ledgerBefore.tokensIn ?? 0);
  const deltaTokensOut = (ledgerAfter.tokensOut ?? 0) - (ledgerBefore.tokensOut ?? 0);
  const deltaUsd = (ledgerAfter.usdEstimate ?? 0) - (ledgerBefore.usdEstimate ?? 0);

  console.log('======================================================================');
  console.log('📈 LEDGER DELTA REPORT:');
  console.log('======================================================================');
  console.log(`   Calls Made:       ${deltaCalls}`);
  console.log(`   Tokens In:        +${deltaTokensIn}`);
  console.log(`   Tokens Out:       +${deltaTokensOut}`);
  console.log(`   USD Delta:        +$${deltaUsd.toFixed(6)}`);
  console.log(`   New Ledger Total: ${ledgerAfter.callCount} calls ($${(ledgerAfter.usdEstimate ?? 0).toFixed(6)})`);
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error running live smoke:', err);
  process.exit(1);
});
