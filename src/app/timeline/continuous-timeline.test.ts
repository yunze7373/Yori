import { describe, it, expect } from 'vitest';
import {
  buildSnapshotAt,
  deriveLivingHeaderFromSnapshot,
  formatTimelineTime,
  TIMELINE_BEATS,
  CONTINUOUS_TIMEZONE,
} from './continuous-timeline.js';
import {
  createSimulatedSignal,
  freezeSnapshot,
  type ContextSnapshot,
} from '../../core/contracts/index.js';

describe('Continuous Timeline Dynamic Living Header (Finding 2)', () => {
  describe('TIMELINE_BEATS structure', () => {
    it('does not contain hardcoded livingHeaderLine, weatherDisplay, placeDisplay, or timeDisplay', () => {
      for (const beat of TIMELINE_BEATS) {
        expect((beat as any).livingHeaderLine).toBeUndefined();
        expect((beat as any).weatherDisplay).toBeUndefined();
        expect((beat as any).placeDisplay).toBeUndefined();
        expect((beat as any).timeDisplay).toBeUndefined();
      }
    });
  });

  describe('deriveLivingHeaderFromSnapshot across beats', () => {
    it('derives S0 Morning Calm header from snapshot: 10:00 AM · Clear · Home', () => {
      const snapS0 = buildSnapshotAt('2026-10-28T17:00:00.000Z');
      const header = deriveLivingHeaderFromSnapshot(snapS0, CONTINUOUS_TIMEZONE);

      expect(header.timeDisplay).toBe('10:00 AM');
      expect(header.weatherDisplay).toBe('Clear');
      expect(header.placeDisplay).toBe('Home');
      expect(header.formattedLine).toBe('10:00 AM · Clear · Home');
    });

    it('derives S1 Lunch Away header from snapshot: 11:50 AM · Clear · Downtown', () => {
      const snapS1 = buildSnapshotAt('2026-10-28T18:50:00.000Z');
      const header = deriveLivingHeaderFromSnapshot(snapS1, CONTINUOUS_TIMEZONE);

      expect(header.timeDisplay).toBe('11:50 AM');
      expect(header.weatherDisplay).toBe('Clear');
      expect(header.placeDisplay).toBe('Downtown');
      expect(header.formattedLine).toBe('11:50 AM · Clear · Downtown');
    });

    it('derives S2 Depart Piano Lesson header from snapshot: 1:20 PM · Clear · Home', () => {
      const snapS2 = buildSnapshotAt('2026-10-28T20:20:00.000Z');
      const header = deriveLivingHeaderFromSnapshot(snapS2, CONTINUOUS_TIMEZONE);

      expect(header.timeDisplay).toBe('1:20 PM');
      expect(header.weatherDisplay).toBe('Clear');
      expect(header.placeDisplay).toBe('Home');
      expect(header.formattedLine).toBe('1:20 PM · Clear · Home');
    });

    it('derives S3 Rain Re-plan header from snapshot: 1:35 PM · Rain from 2:00 · Home', () => {
      const snapS3 = buildSnapshotAt('2026-10-28T20:35:00.000Z');
      const header = deriveLivingHeaderFromSnapshot(snapS3, CONTINUOUS_TIMEZONE);

      expect(header.timeDisplay).toBe('1:35 PM');
      expect(header.weatherDisplay).toBe('Rain from 2:00');
      expect(header.placeDisplay).toBe('Home');
      expect(header.formattedLine).toBe('1:35 PM · Rain from 2:00 · Home');
    });
  });

  describe('deriveLivingHeaderFromSnapshot edge cases & custom snapshots', () => {
    it('handles rain without onset by capitalizing condition', () => {
      const snap: ContextSnapshot = freezeSnapshot({
        id: 'snap-rain-no-onset',
        asOf: '2026-10-28T21:00:00.000Z',
        timezone: CONTINUOUS_TIMEZONE,
        signals: [
          createSimulatedSignal({
            kind: 'weather',
            value: { condition: 'rain' },
            issuedAt: '2026-10-28T21:00:00.000Z',
            validFor: 3600000,
            confidence: 0.9,
            consentScope: 'device_only',
          }),
        ],
      });
      const header = deriveLivingHeaderFromSnapshot(snap, CONTINUOUS_TIMEZONE);
      expect(header.weatherDisplay).toBe('Rain');
      expect(header.placeDisplay).toBe('Home');
      expect(header.formattedLine).toBe('2:00 PM · Rain · Home');
    });

    it('handles custom weather conditions like cloudy, snow, foggy', () => {
      const snap: ContextSnapshot = freezeSnapshot({
        id: 'snap-snow',
        asOf: '2026-10-28T16:00:00.000Z',
        timezone: CONTINUOUS_TIMEZONE,
        signals: [
          createSimulatedSignal({
            kind: 'weather',
            value: { condition: 'snow' },
            issuedAt: '2026-10-28T16:00:00.000Z',
            validFor: 3600000,
            confidence: 0.9,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'location_status',
            value: { currentArea: 'Mountain Resort', isHome: false },
            issuedAt: '2026-10-28T16:00:00.000Z',
            validFor: 3600000,
            confidence: 0.9,
            consentScope: 'device_only',
          }),
        ],
      });
      const header = deriveLivingHeaderFromSnapshot(snap, CONTINUOUS_TIMEZONE);
      expect(header.weatherDisplay).toBe('Snow');
      expect(header.placeDisplay).toBe('Mountain Resort');
      expect(header.formattedLine).toBe('9:00 AM · Snow · Mountain Resort');
    });

    it('handles snapshot with missing signals gracefully with defaults', () => {
      const snap: ContextSnapshot = freezeSnapshot({
        id: 'snap-empty',
        asOf: '2026-10-28T17:00:00.000Z',
        timezone: CONTINUOUS_TIMEZONE,
        signals: [],
      });
      const header = deriveLivingHeaderFromSnapshot(snap, CONTINUOUS_TIMEZONE);
      expect(header.timeDisplay).toBe('10:00 AM');
      expect(header.weatherDisplay).toBe('Clear');
      expect(header.placeDisplay).toBe('Home');
      expect(header.formattedLine).toBe('10:00 AM · Clear · Home');
    });
  });

  describe('formatTimelineTime', () => {
    it('formats valid ISO time in given timezone', () => {
      expect(formatTimelineTime('2026-10-28T17:00:00.000Z', 'America/Los_Angeles')).toBe('10:00 AM');
      expect(formatTimelineTime('2026-10-28T18:50:00.000Z', 'America/Los_Angeles')).toBe('11:50 AM');
      expect(formatTimelineTime('2026-10-28T20:35:00.000Z', 'America/Los_Angeles')).toBe('1:35 PM');
    });

    it('returns empty string for invalid or missing timestamps', () => {
      expect(formatTimelineTime(undefined)).toBe('');
      expect(formatTimelineTime('invalid-time')).toBe('');
    });
  });
});
