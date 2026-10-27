/**
 * Externalized UI Strings (NFR-105)
 * English UI first; all user-visible text externalized for i18n readiness.
 */

export const STRINGS = Object.freeze({
  header: Object.freeze({
    greeting: 'Good afternoon.',
    subheading: "I've been looking ahead for you.",
    demoChip: 'Demo · simulated context',
    simulatedBadge: 'SIMULATED',
  }),
  sections: Object.freeze({
    now: 'NOW · YOUR NEXT MOMENT',
    ahead: "AHEAD · WHAT'S COMING",
    forYou: 'FOR YOU',
  }),
  scenes: Object.freeze({
    clear: 'Clear (D1)',
    rain: 'Rain (D2)',
    awayLunch: 'Away Lunch (D3)',
    busyLunch: 'Busy / Quiet (D4)',
    missingWeather: 'Missing Weather (D6)',
    corruptStorage: 'Corrupt Storage (INV-110)',
  }),
  tabs: Object.freeze({
    today: 'Today',
    explore: 'Explore',
    ask: 'Ask',
    me: 'Me',
    comingSoonBadge: 'Coming next',
  }),
  quietState: Object.freeze({
    title: 'Nothing needs your attention right now.',
    subtitle: "You're all caught up. We'll let you know when something comes up.",
  }),
  actions: Object.freeze({
    accept: 'Accept',
    adjust: 'Adjust',
    dismiss: 'Dismiss',
    comingSoon: 'Coming next in S4-1',
  }),
  rain: Object.freeze({
    whatChanged: 'What changed: rain forecast arrived for your travel window',
    checklistHeader: 'Checklist',
    umbrellaChip: 'Umbrella',
  }),
  lunch: Object.freeze({
    mockPlacesNotice: 'Simulated nearby dining options matching confirmed tastes',
  }),
  storageError: Object.freeze({
    title: 'Storage Corruption Detected',
    message:
      'Stored data could not be verified against schema version 1. No data has been wiped.',
    exportBtn: 'Export Raw Data',
    resetBtn: 'Reset Storage',
  }),
  map: Object.freeze({
    label: 'Spatial Context Map',
    abstractStreetDescription: 'Stylized street grid showing destination area',
    simulatedTag: 'Simulated Spatial Evidence',
  }),
});
