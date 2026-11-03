# Google Calendar connector (D11): owner setup

Yori can read your Google Calendar **read-only** via Google sign-in. Your iCal feed
(`CALENDAR_ICS_URL`) stays underneath as the fallback. This page covers the one-time owner setup.
Agents never read, print or paste these values; you type them into `.env.local` yourself.

## 1. Create the OAuth client (Google Cloud Console)

1. Open **Google Cloud Console** and choose (or create) a project for Yori.
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**. Publishing status: **Testing**.
   - App name: Yori. Add your own Google account under **Test users**.
   - Scopes: add only `https://www.googleapis.com/auth/calendar.events.readonly`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: add all three, exactly as written:
     - `http://localhost:4173/api/google/oauth/callback`
     - `http://localhost:4174/api/google/oauth/callback` (the phone, through surface E `ssh -R 4174`)
     - `http://localhost:5173/api/google/oauth/callback` (dev server)
   - Create, then copy the **Client ID** and **Client secret**.

## 2. Put the values in `.env.local` (on the Mac, never in chat)

```
GOOGLE_OAUTH_CLIENT_ID=<paste the client id>
GOOGLE_OAUTH_CLIENT_SECRET=<paste the client secret>
```

Do not prefix these with `VITE_`: they must never reach the browser bundle. Restart the preview server
afterwards. `GOOGLE_OAUTH_ENABLED=false` turns the connector off without removing the client.

## 3. Connect

Open Yori at **`http://localhost:4173`**. Use `localhost`, not `127.0.0.1`: Google matches the
redirect URI exactly. Then go to **Me → Connectors → Calendar → Connect Google Calendar**, sign in, and
allow read-only calendar access. You return to Connectors showing **Connected · read-only**.
**Disconnect Google Calendar** revokes the access at Google and deletes the tokens on the Mac.

## What happens to the data

- **Server-side only:** the server keeps the tokens in memory and in a gitignored fallback file,
  `.yori-runtime/google-oauth-tokens.json` (mode 0600). It refreshes them itself. The browser only
  ever sees "connected / expired / not connected": no email, no token.
- **What is read:** the primary calendar, from now − 2 h to + 24 h, with only id, title, time,
  location and status. Descriptions are not requested.
- **Expiry:** if access expires or is revoked, Yori says so and falls back to your iCal feed. With no
  iCal feed, it shows no calendar. It never invents events.

## Caveats (stated in the plan)

- **7-day expiry in Testing mode:** Google expires refresh tokens after 7 days for apps in "Testing"
  status. After that, the Connectors card shows *Access expired*; press **Reconnect Google Calendar**.
- **LAN / `demo:https` origins are unsupported:** Google does not accept private-network HTTPS origins
  as redirect URIs for this client. Use `localhost:4173`, or the phone through surface E
  (`http://localhost:4174`). From a LAN address the server refuses to start sign-in (403).
