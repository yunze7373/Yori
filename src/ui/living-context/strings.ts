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
    accepted: 'Accepted',
    undo: 'Undo',
    adjust: 'Adjust',
    dismiss: 'Dismiss',
    why: 'Why',
    confirm: 'Confirm',
    notTrue: 'Not true',
    save: 'Save',
    cancel: 'Cancel',
  }),
  adjustDialog: Object.freeze({
    title: 'Adjust Departure Timing',
    prepLabel: 'Preparation time (minutes)',
    bufferLabel: 'Buffer time (minutes)',
    forThisTimeOnly: 'For this time only',
    rememberPreference: 'Remember as preference',
  }),
  dismissDialog: Object.freeze({
    title: 'Dismiss Recommendation',
    subtitle: 'Why would you like to dismiss this?',
    reasonToday: "Don't suggest this today",
    reasonBusy: "I'm busy during this time",
    reasonNotNeeded: 'Not needed',
    confirmDismiss: 'Dismiss Plan',
  }),
  whySheet: Object.freeze({
    title: "Why you're seeing this",
    evidenceTitle: 'Evidence & Signals',
    memoryTitle: 'Confirmed Memory & Habits',
    derivationTitle: 'How this was derived',
    close: 'Close',
    noEvidence: 'No additional evidence recorded.',
    noMemory: 'No personal memory facts influenced this plan.',
  }),
  me: Object.freeze({
    title: 'Me & Memory',
    subtitle: 'Manage your confirmed preferences, proposals, and privacy controls.',
    budgetTitle: "Today's Proactive Prompts",
    budgetSubtitle: 'On-open Living Context updates dynamically; proactive notifications are capped per day.',
    budgetUsage: '{used} of {max} used today',
    confirmedTitle: 'Confirmed Preferences',
    confirmedEmpty: 'No confirmed preferences yet.',
    pendingTitle: 'Pending Proposals',
    pendingSubtitle: 'Proposals created from your actions, waiting for your explicit confirmation.',
    pendingEmpty: 'No pending proposals.',
    rejectedTitle: 'Rejected Proposals',
    rejectedSubtitle: 'Declined proposals retained for audit. These are never applied.',
    rejectedEmpty: 'No rejected proposals.',
    dataControlsTitle: 'Data Controls & Storage',
    exportBtn: 'Export Raw Data',
    resetBtn: 'Reset Storage',
    confirmResetBtn: 'Confirm Reset',
    cancelResetBtn: 'Cancel',
    exportNotice: 'Data backup exported successfully.',
    resetNotice: 'Storage reset to fresh state.',
    persistenceUnavailable:
      'Persistence unavailable: Storage is operating in temporary session mode because browser storage is restricted.',
  }),
  memory: Object.freeze({
    prepBufferMinutesLabel: 'Buffer before leaving',
    prepDurationMinutesLabel: 'Time to get ready',
    prepBufferPreferenceLabel: 'Preparation & buffer routine',
    rainTransportLabel: 'Rain travel habit',
    tastePreferenceLabel: 'Dining taste preferences',
    suppressLunchLabel: 'Lunch suggestions',
    minutesUnit: '{minutes} min',
    rainDriveValue: 'Prefers driving when it rains',
    rainTransitValue: 'Prefers transit when it rains',
    suppressedTodayValue: 'Suppressed for today',
  }),
  depart: Object.freeze({
    basisLine: 'Based on your calendar, the route, and how you usually get ready.',
  }),
  rain: Object.freeze({
    whatChanged: 'What changed: rain forecast',
    umbrellaChip: 'Umbrella',
  }),
  habit: Object.freeze({
    rainDrive: 'You usually prefer driving when it rains.',
    rainTransit: 'You usually prefer taking transit when it rains.',
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
