/**
 * Externalized UI Strings (NFR-105)
 * English UI first; all user-visible text externalized for i18n readiness.
 * Free of internal engine identifiers, slice IDs, and invariant codes.
 */

export const STRINGS = Object.freeze({
  header: Object.freeze({
    greetings: Object.freeze({
      morning: 'Good morning.',
      afternoon: 'Good afternoon.',
      evening: 'Good evening.',
    }),
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
    clear: 'Clear',
    rain: 'Rain',
    awayLunch: 'Away lunch',
    busyLunch: 'Busy lunch',
    missingWeather: 'Missing weather',
    corruptStorage: 'Storage error',
  }),
  tabs: Object.freeze({
    today: 'Today',
    explore: 'Explore',
    ask: 'Ask',
    me: 'Me',
    comingSoonBadge: 'Coming soon',
  }),
  quietState: Object.freeze({
    title: 'Nothing needs your attention right now.',
    subtitle: "You're all caught up. We'll let you know when something comes up.",
  }),
  actions: Object.freeze({
    accept: 'Accept',
    adjust: 'Adjust',
    dismiss: 'Dismiss',
    comingSoon: 'Coming soon',
  }),
  depart: Object.freeze({
    defaultTitle: 'Piano lesson at 3:00',
    primaryLine: 'Get ready at 2:05 PM, leave by 2:25 PM',
    basisLine: 'Based on your calendar, the route, and how you usually get ready.',
  }),
  rain: Object.freeze({
    whatChanged: 'What changed: rain forecast',
    umbrellaChip: 'Umbrella',
    driveOption: 'Drive · leave 2:30',
    busOption: 'Bus · leave 2:15',
    habitNote: 'You usually prefer driving when it rains.',
  }),
  lunch: Object.freeze({
    title: 'Lunch options near you',
    primaryLine: 'Places matching what you like, within walking distance',
    basisLine: 'Based on your location, schedule window, and what you usually like.',
    mockPlacesNotice: 'Mock places for this demo; real listings come from a place provider.',
  }),
  storageError: Object.freeze({
    title: 'Storage error detected',
    message:
      'Stored data could not be verified. Your existing records are preserved and have not been wiped.',
    exportBtn: 'Export Raw Data',
    resetBtn: 'Reset Storage',
    exportedNotice: 'Storage backup exported successfully.',
    resetNotice: 'Storage reset to fresh state.',
  }),
  notices: Object.freeze({
    degradedNoticeHeader: 'Notice:',
  }),
  map: Object.freeze({
    label: 'Spatial Context Map',
    abstractStreetDescription: 'Stylized street grid showing destination area',
    simulatedTag: 'Simulated Spatial Evidence',
  }),
});
