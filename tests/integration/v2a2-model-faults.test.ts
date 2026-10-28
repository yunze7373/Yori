/**
 * V2a-2 Model Fault Injection, Decision Log & Provenance Tests
 * Governed by LIVING_CONTEXT_V2.md §9 R1 and conditions C6 & C7.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelCommandInterpreter,
} from '../../src/ui/conversation/model-interpreter.js';
import {
  globalDecisionLogger,
  DecisionLogger,
  ENGINE_STATUS_LABELS,
} from '../../src/adapters/model/decision-log.js';
import {
  DefaultActionStateStore,
} from '../../src/ui/action-state/store.js';
import {
  renderTranscriptItems,
} from '../../src/ui/conversation/conversation-view.js';
import { renderWhySheet } from '../../src/ui/review/why-sheet.js';
import {
  type ModelCommandDecisionOutput,
  FIXTURE_CMD_CHANGE_ROUTE_BUS,
  FIXTURE_CMD_CHANGE_ROUTE_DRIVE,
  FIXTURE_FAULT_OUT_OF_SET_INTENT,
  FIXTURE_FAULT_UNCITED_SIGNAL,
  FIXTURE_FAULT_UNCITED_FACT,
  FIXTURE_FAULT_INVALID_REASON_CODE,
  FIXTURE_FAULT_INVENTED_TIME,
  FIXTURE_FAULT_SCHEMA_INVALID,
} from '../fixtures/model-command-fixtures.js';
import { d2Scenario, d2MemoryFacts } from '../fixtures/index.js';
import { createFixedClock, createScenarioPlayer } from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import '../../src/plugins/registry.js';

describe('V2a-2: Muse Spark Constrained Decision Engine & Decision Log', () => {
  let rainPlan: any;
  let rainSnapshot: any;
  let departCandidate: any;

  beforeEach(() => {
    globalDecisionLogger.clear();

    const rainClock = createFixedClock('2026-10-28T20:35:00.000Z');
    const player = createScenarioPlayer(d2Scenario, rainClock);
    rainSnapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z')!;
    const rainResult = runPipeline({
      snapshot: rainSnapshot,
      memory: d2MemoryFacts,
      clock: '2026-10-28T20:35:00.000Z',
    });
    rainPlan = rainResult.livingContext.now!;

    departCandidate = {
      intent: 'depart',
      confidence: 1.0,
      evidence: rainSnapshot.signals.filter((s: any) => s.kind === 'calendar'),
    };
  });

  describe('Condition C6: Truth in Engine Status', () => {
    it('labels scripted fixture as "Scripted model fixture · not a live model call", never recorded or live', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({ mode: 'scripted_fixture', logger });

      const res = interpreter.interpret('Can I leave later?', {
        availableModes: ['drive', 'bus'],
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z', 'calendar:2026-10-28T17:00:00.000Z'],
        confirmedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
        validTimes: [rainPlan.leaveAt, rainPlan.prepareAt, rainPlan.apptAt],
        validPlaces: [rainPlan.subjectTitle],
      });

      expect(res.engineStatus).toBe('scripted_fixture');
      expect(logger.getEngineStatusLabel()).toBe('Scripted model fixture · not a live model call');
      expect(ENGINE_STATUS_LABELS.scripted_fixture).toBe('Scripted model fixture · not a live model call');
      expect(logger.getEngineStatusLabel()).not.toBe('Meta model · live');
      expect(logger.getEngineStatusLabel()).not.toBe('Recorded Meta model output · replay');
    });

    it('labels recorded replay as "Recorded Meta model output · replay"', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({ mode: 'recorded_replay', logger });

      const res = interpreter.interpret('Can I leave later?', {
        availableModes: ['drive', 'bus'],
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z', 'calendar:2026-10-28T17:00:00.000Z'],
        confirmedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
        validTimes: [rainPlan.leaveAt, rainPlan.prepareAt, rainPlan.apptAt],
        validPlaces: [rainPlan.subjectTitle],
      });

      expect(res.engineStatus).toBe('recorded_model_replay');
      expect(logger.getEngineStatusLabel()).toBe('Recorded Meta model output · replay');
      expect(ENGINE_STATUS_LABELS.recorded_model_replay).toBe('Recorded Meta model output · replay');
    });

    it('labels model-off or failed output as "Offline fallback · deterministic"', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({ mode: 'offline', logger });

      const res = interpreter.interpret('Can I leave later?');
      expect(res.engineStatus).toBe('offline_deterministic');
      expect(logger.getEngineStatusLabel()).toBe('Offline fallback · deterministic');
      expect(ENGINE_STATUS_LABELS.offline_deterministic).toBe('Offline fallback · deterministic');
    });

    it('labels live model call as "Meta model · live" only when proxy returns valid data', () => {
      expect(ENGINE_STATUS_LABELS.meta_model_live).toBe('Meta model · live');
    });

    it('guarantees 1:1 mapping between engine status and data provenance', () => {
      const statuses = ['meta_model_live', 'recorded_model_replay', 'scripted_fixture', 'offline_deterministic'] as const;
      const labels = new Set(statuses.map(s => ENGINE_STATUS_LABELS[s]));
      expect(labels.size).toBe(4);
      expect(ENGINE_STATUS_LABELS.scripted_fixture).toContain('not a live model call');
      expect(ENGINE_STATUS_LABELS.recorded_model_replay).toContain('Recorded Meta model output');
      expect(ENGINE_STATUS_LABELS.meta_model_live).toBe('Meta model · live');
      expect(ENGINE_STATUS_LABELS.offline_deterministic).toBe('Offline fallback · deterministic');
    });
  });

  describe('Condition C7: Redacted Decision Log', () => {
    it('records templateId, input ids, output reason codes, validation result, and zero secrets/PII', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({ mode: 'scripted_fixture', logger });

      interpreter.interpret('Can I leave later?', {
        availableModes: ['drive', 'bus'],
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z', 'calendar:2026-10-28T17:00:00.000Z'],
        confirmedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
        validTimes: [rainPlan.leaveAt, rainPlan.prepareAt, rainPlan.apptAt],
        validPlaces: [rainPlan.subjectTitle],
      });

      const entries = logger.getEntries();
      expect(entries).toHaveLength(1);
      const entry = entries[0]!;

      expect(entry.templateId).toBe('decision_command');
      expect(entry.inputSignalIds).toContain('weather:2026-10-28T20:35:00.000Z');
      expect(entry.inputFactKeys).toContain('rain_transport_preference');
      expect(entry.outputReasonCodes).toContain('weather_adjusted');
      expect(entry.outputIntent).toBe('LEAVE_LATER');
      expect(entry.validationResult.valid).toBe(true);
      expect(entry.engineStatus).toBe('scripted_fixture');
      expect(entry.timestamp).toBeDefined();

      // Invariant: JSON export has ZERO secrets, raw prompt text, or PII
      const jsonStr = logger.exportJson();
      expect(jsonStr).not.toContain('Bearer');
      expect(jsonStr).not.toContain('API_KEY');
      expect(jsonStr).not.toContain('systemPrompt');
      expect(jsonStr).not.toContain('You are Muse Spark');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('secret');
      expect(jsonStr).not.toContain('credential');
    });
  });

  describe('Fault Injection & Robustness', () => {
    it('discards out-of-set intent to deterministic fallback', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'book flight': FIXTURE_FAULT_OUT_OF_SET_INTENT },
        logger,
      });

      const result = interpreter.interpret('book flight');
      expect(result.intent).toBe('UNSUPPORTED');
      expect(result.engineStatus).toBe('offline_deterministic');
      expect(result.honestAnswer).toBeDefined();

      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('out_of_set_intent');
      expect(latest.engineStatus).toBe('offline_deterministic');
    });

    it('discards uncited signal ID to deterministic fallback', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'can i leave later': FIXTURE_FAULT_UNCITED_SIGNAL },
        logger,
      });

      const result = interpreter.interpret('can i leave later', {
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
      });

      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('unknown_signal_id');
      expect(latest.engineStatus).toBe('offline_deterministic');
    });

    it('discards uncited fact key to deterministic fallback', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'can i leave later': FIXTURE_FAULT_UNCITED_FACT },
        logger,
      });

      const result = interpreter.interpret('can i leave later', {
        availableSignalIds: ['weather:2026-10-28T20:35:00.000Z'],
        confirmedFactKeys: ['habit_rain_mode'],
      });

      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('unknown_fact_key');
    });

    it('(a) an invented citation with zero confirmed facts -> offline_deterministic', () => {
      const logger = new DecisionLogger();
      const fixtureWithInventedFact: ModelCommandDecisionOutput = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['quieter', 'vegetarian'] },
        situationAttribution: {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'free_window_fit',
          explanation: 'Prioritizing quiet atmosphere.',
        },
        citedSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        citedFactKeys: ['invented_allergy_peanut'],
        reasonCodes: ['free_window_fit'],
        explanation: 'Candidate places filtered by quiet atmosphere.',
      };
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'quieter vegetarian': fixtureWithInventedFact },
        logger,
      });

      const result = interpreter.interpret('quieter vegetarian', {
        availableSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        knownFactKeys: ['sample_taste_key'],
        confirmedFactKeys: [],
      });

      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('unknown_fact_key');
    });

    it('(b) a sample citation without the confirmed reason code -> accepted', () => {
      const logger = new DecisionLogger();
      const fixtureWithSampleFact: ModelCommandDecisionOutput = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['quieter', 'vegetarian'] },
        situationAttribution: {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'free_window_fit',
          explanation: 'Prioritizing quiet atmosphere.',
        },
        citedSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        citedFactKeys: ['sample_taste_key'],
        reasonCodes: ['free_window_fit'],
        explanation: 'Candidate places filtered by quiet atmosphere.',
      };
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'quieter vegetarian': fixtureWithSampleFact },
        logger,
      });

      const result = interpreter.interpret('quieter vegetarian', {
        availableSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        knownFactKeys: ['sample_taste_key'],
        confirmedFactKeys: [],
      });

      expect(result.engineStatus).toBe('scripted_fixture');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(true);
    });

    it('(c) matches_confirmed_preference citing a sample key while another fact is confirmed -> rejected', () => {
      const logger = new DecisionLogger();
      const fixtureWithConfirmedReasonOnSample: ModelCommandDecisionOutput = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['quieter', 'vegetarian'] },
        situationAttribution: {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'matches_confirmed_preference',
          explanation: 'Prioritizing quiet atmosphere.',
        },
        citedSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        citedFactKeys: ['sample_taste_key'],
        reasonCodes: ['matches_confirmed_preference'],
        explanation: 'Candidate places filtered by quiet atmosphere.',
      };
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'quieter vegetarian': fixtureWithConfirmedReasonOnSample },
        logger,
      });

      const result = interpreter.interpret('quieter vegetarian', {
        availableSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        knownFactKeys: ['sample_taste_key', 'confirmed_prep_buffer'],
        confirmedFactKeys: ['confirmed_prep_buffer'],
      });

      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('unconfirmed_fact_used');
    });

    it('(d) the same citing a confirmed key -> accepted', () => {
      const logger = new DecisionLogger();
      const fixtureWithConfirmedReasonOnConfirmed: ModelCommandDecisionOutput = {
        intent: 'FIND_LUNCH',
        slots: { filters: ['quieter', 'vegetarian'] },
        situationAttribution: {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'matches_confirmed_preference',
          explanation: 'Prioritizing quiet atmosphere.',
        },
        citedSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        citedFactKeys: ['confirmed_prep_buffer'],
        reasonCodes: ['matches_confirmed_preference'],
        explanation: 'Candidate places filtered by quiet atmosphere.',
      };
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'quieter vegetarian': fixtureWithConfirmedReasonOnConfirmed },
        logger,
      });

      const result = interpreter.interpret('quieter vegetarian', {
        availableSignalIds: ['mock_places:2026-10-28T19:10:00.000Z'],
        knownFactKeys: ['sample_taste_key', 'confirmed_prep_buffer'],
        confirmedFactKeys: ['confirmed_prep_buffer'],
      });

      expect(result.engineStatus).toBe('scripted_fixture');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(true);
    });

    it('discards hallucinated reason code to deterministic fallback', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'can i leave later': FIXTURE_FAULT_INVALID_REASON_CODE },
        logger,
      });

      const result = interpreter.interpret('can i leave later');
      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('invalid_reason_code');
    });

    it('discards invented time token in explanation via fact checker', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'can i leave later': FIXTURE_FAULT_INVENTED_TIME },
        logger,
      });

      const result = interpreter.interpret('can i leave later', {
        validTimes: ['2:10 PM', '2:30 PM', '3:00 PM'],
      });

      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('unlisted_fact_token');
    });

    it('discards schema-invalid output to deterministic fallback', () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'replay',
        fixtures: { 'can i leave later': FIXTURE_FAULT_SCHEMA_INVALID },
        logger,
      });

      const result = interpreter.interpret('can i leave later');
      expect(result.engineStatus).toBe('offline_deterministic');
      const latest = logger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('schema_invalid');
    });

    it('discards on network 500 error in interpretAsync to deterministic fallback', async () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: 'http://localhost:9999/api/model/command',
        logger,
      });

      // Stub fetch to return 500
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });

      try {
        const result = await interpreter.interpretAsync('Leave 15 minutes later');
        expect(result.intent).toBe('LEAVE_LATER');
        expect(result.slots.deltaMinutes).toBe(15);
        expect(result.engineStatus).toBe('offline_deterministic');

        const latest = logger.getLatest()!;
        expect(latest.validationResult.valid).toBe(false);
        expect(latest.validationResult.reason).toBe('error');
        expect(latest.engineStatus).toBe('offline_deterministic');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('discards on timeout in interpretAsync to deterministic fallback', async () => {
      const logger = new DecisionLogger();
      const interpreter = new ModelCommandInterpreter({
        mode: 'live',
        endpoint: 'http://localhost:9999/api/model/command',
        timeoutMs: 50,
        logger,
      });

      // Stub fetch to simulate timeout AbortError
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };

      try {
        const result = await interpreter.interpretAsync('Take the bus');
        expect(result.intent).toBe('CHANGE_ROUTE');
        expect(result.slots.mode).toBe('bus');
        expect(result.engineStatus).toBe('offline_deterministic');

        const latest = logger.getLatest()!;
        expect(latest.validationResult.valid).toBe(false);
        expect(latest.validationResult.reason).toBe('timeout');
        expect(latest.engineStatus).toBe('offline_deterministic');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Carry-over (b): Disabling Stale Buttons & Scene Isolation', () => {
    it('disables comparison and confirm buttons in older transcript messages or after resolution', () => {
      const store = new DefaultActionStateStore();
      store.setCommandContext({
        plan: rainPlan,
        snapshot: rainSnapshot,
        memory: d2MemoryFacts,
        candidate: departCandidate,
        sceneId: 'rain',
      });

      // Step 1: user asks "Can I leave later?" -> needs confirmation with comparison options
      store.submitMessage('Can I leave later?');
      expect(store.getActionState().status).toBe('needs-confirmation');

      // The latest transcript has active interactive buttons
      const activeHtml = renderTranscriptItems(store.getTranscript(), true);
      expect(activeHtml).toContain('btn-select-comparison');
      expect(activeHtml).not.toContain('is-stale');
      expect(activeHtml).not.toContain('disabled aria-disabled="true"');

      // Step 2: user selects an option -> status resolves to updated, collapsing interactive state
      store.submitMessage('Leave 5 minutes later');
      expect(store.getActionState().status).toBe('updated');

      // In the updated state, old transcript comparison buttons are rendered disabled and with class is-stale
      const staleHtml = renderTranscriptItems(
        store.getTranscript(),
        store.getActionState().status === 'needs-confirmation'
      );
      expect(staleHtml).toContain('is-stale');
      expect(staleHtml).toContain('disabled aria-disabled="true"');
    });

    it('cancels stale pending confirmation when scene changes in setCommandContext', () => {
      const store = new DefaultActionStateStore();
      store.setCommandContext({
        plan: rainPlan,
        snapshot: rainSnapshot,
        memory: d2MemoryFacts,
        candidate: departCandidate,
        sceneId: 'rain',
      });

      store.submitMessage('Can I leave later?');
      expect(store.getActionState().status).toBe('needs-confirmation');

      // Scene changes to clear
      store.setCommandContext({
        plan: rainPlan,
        snapshot: rainSnapshot,
        memory: d2MemoryFacts,
        sceneId: 'clear',
      });

      // Status was safely reset to idle, clearing pending comparison
      expect(store.getActionState().status).toBe('idle');
    });
  });

  describe('Situation Attribution & Why Sheet Integration', () => {
    it('renders situation attribution with reason codes in Why sheet', () => {
      const store = new DefaultActionStateStore();
      store.setCommandContext({
        plan: rainPlan,
        snapshot: rainSnapshot,
        memory: d2MemoryFacts,
        candidate: departCandidate,
        sceneId: 'rain',
      });

      store.submitMessage('Can I leave later?');
      const attribution = store.getSituationAttribution();
      expect(attribution).toBeDefined();
      expect(attribution!.reasonCode).toBe('weather_adjusted');
      expect(attribution!.signalId).toBe('weather:2026-10-28T20:35:00.000Z');

      const whyHtml = renderWhySheet(
        rainPlan,
        'Because you asked: leave 15 min later · this time only',
        'America/Los_Angeles',
        new Set(['habit_rain_mode']),
        attribution
      );

      expect(whyHtml).toContain('Situation Attribution');
      expect(whyHtml).toContain('Weather Adjusted');
      expect(whyHtml).toContain('Weather forecast · issued 1:35 PM');
      expect(whyHtml).toContain('Precipitation increased · travel buffer adjusted for rain');
      expect(whyHtml).not.toContain('weather:2026-10-28');
      expect(whyHtml).not.toContain('2026-10-28T20:35:00.000Z');
      expect(whyHtml).toContain('Because you asked: leave 15 min later · this time only');
    });

    it('renders recommended badge on model-ranked comparison option in conversation view', () => {
      const store = new DefaultActionStateStore();
      store.setCommandContext({
        plan: rainPlan,
        snapshot: rainSnapshot,
        memory: d2MemoryFacts,
        candidate: departCandidate,
        sceneId: 'rain',
      });

      store.submitMessage('Can I leave later?');
      const transcript = store.getTranscript();
      const lastMsg = transcript[transcript.length - 1]!;
      expect(lastMsg.comparisonOptions).toBeDefined();
      const recommendedOpt = lastMsg.comparisonOptions!.find(o => o.isRecommended);
      expect(recommendedOpt).toBeDefined();
      expect(recommendedOpt!.deltaMinutes).toBe(5);

      const html = renderTranscriptItems(transcript, true);
      expect(html).toContain('chat-comparison-recommendation');
      expect(html).toContain('Recommended');
    });
  });

  describe('Carry-over C-1 (CUTLINE_CHECK_V2): CHANGE_ROUTE Fixture Truthfulness', () => {
    it('bus fixture does not claim shorter_trip; drive fixture claims shorter_trip agreeing with Rain estimates', () => {
      // In the Rain scene (d2), drive travel estimate is 25 min vs bus 40 min.
      // Bus is NOT a shorter trip (40m > 25m), so it must not claim shorter_trip.
      expect(FIXTURE_CMD_CHANGE_ROUTE_BUS.reasonCodes).not.toContain('shorter_trip');
      expect(FIXTURE_CMD_CHANGE_ROUTE_BUS.reasonCodes).toEqual(['weather_adjusted']);

      // Drive IS a shorter trip (25m < 40m), so it legitimately claims shorter_trip.
      expect(FIXTURE_CMD_CHANGE_ROUTE_DRIVE.reasonCodes).toContain('shorter_trip');
      expect(FIXTURE_CMD_CHANGE_ROUTE_DRIVE.situationAttribution?.reasonCode).toBe('shorter_trip');
    });
  });
});
