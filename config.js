// Public settings. Nothing secret lives here: every RSVP request also needs the guest's personal link token.
window.RFP_CONFIG = {
  // Google Apps Script web app that stores RSVPs in the private RSVP Google Sheet.
  api: 'https://script.google.com/macros/s/AKfycbyoE8Ee5FAgZtXRI8S0E0ScX7wvfzoSFvUe2R0xlY3AvN8CKytdVtb0EWOQQ1yUxG6t/exec',
  event: {
    title: "RFP 2026 - Roast a Frikkin' Pig",
    start: '2026-10-17T17:00',
    end: '2026-10-17T21:00',
    place: 'The Gray Home',
    details: 'Please bring a side or dessert to share. Adults only please.',
  },
};
