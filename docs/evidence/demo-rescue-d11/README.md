# D11-GCAL-OAUTH evidence

**Live proof: PENDING-OWNER.** No owner OAuth client exists yet (`GOOGLE_OAUTH_CLIENT_ID` is not
set), so no live Google sign-in or Calendar call has been made. The owner steps are in
`docs/demo/GOOGLE_CALENDAR_OAUTH.md`. A live proof is one Connect plus one `/api/calendar` read,
after the owner creates the client and adds the values to `.env.local` themselves.

## Recorded proof (this slice)

`tests/e2e-live/live-google-calendar.spec.ts` drives the real UI and the real server-side OAuth code
against `tests/fixtures/google-mock/server.mjs`. That mock is loopback only, and it verifies PKCE
S256, the redirect URI and the client credentials, as Google's endpoint would. The lifecycle runs in
one ordered test:

1. **Not connected:** iCal is live underneath, and the read-only disclosure is shown.
2. **Connect:** an HttpOnly session cookie is set, the mock grants consent, and the callback exchanges
   the code once (the mock records 0 PKCE failures). The app returns to Connectors showing
   **Connected · read-only**.
3. **Parity:** `/api/calendar` returns the same events as the iCal path (id, title, start, end,
   location, all-day), each with `provenance: google_calendar`.
4. **Replay:** replaying the same callback gets 400, and no second exchange happens.
5. **Revoked or expired:** the Calendar API returns 401 and the refresh is refused. The grant is
   dropped, the iCal feed answers again (labelled iCal), and the card shows
   *Access expired · using your iCalendar feed instead*.
6. **Reconnect, then disconnect:** disconnect revokes at the mock and deletes the token file. iCal
   answers again.
7. **Leak scan:** the page HTML, every bundle and every page request URL contain none of: the secret,
   the access, refresh or authorization codes, `code_verifier`, or the Google OAuth/API hosts.

The renders (390×844, recorded mock, not live Google) are:

- `d11-connected-390x844.png`: Calendar connected via Google, with Disconnect.
- `d11-expired-ical-fallback-390x844.png`: access expired, the iCal fallback named, and Reconnect.

## Boundary tests

`tests/proxy-boundary/google-oauth-proxy.test.ts`, 14 tests, with mutation checks on the peer guard
and the session binding:

- **Config:** a missing client id, the owner switch off, or a non-loopback endpoint override each
  disable the connector, with a reason.
- **Redirect URI:** built only as `http://localhost:{4173|4174|5173}/api/google/oauth/callback`.
- **Authorization request:** exact scope `calendar.events.readonly`, `include_granted_scopes`, offline
  access, and a verifier that matches the S256 challenge.
- **State:** unknown, wrong-session, expired or replayed state means no exchange.
- **Tokens:** stored in a 0600 file; status carries booleans only; refresh happens in the proxy; a
  refused refresh marks the grant expired and deletes the file; disconnect revokes and deletes.
- **Routes:** a LAN peer with a forged localhost Host, a missing peer, or a non-allowlisted Host gets
  403 on every route with no exchange. A start from `127.0.0.1` or a cross-origin page gets 403. A
  missing client id gets 409.
- **`/api/calendar`:** byte-identical to the iCal-only build when no client is configured. When
  connected it returns Google events; a 401 triggers one refresh and a retry; a second 401 means
  expired, then iCal, else no calendar. `CALENDAR_LIVE_ENABLED=false` keeps Google unused.

`src/ui/connectors/google-calendar-connector.test.ts`, 8 tests, covers the port states and the
Connectors row states. When no Google info is available, the card is unchanged.
