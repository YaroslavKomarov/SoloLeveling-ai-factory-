# Google OAuth Error 400: redirect_uri_mismatch

**Date:** 2026-02-18
**Files:** none (configuration issue, no code changes)
**Severity:** high

## Problem

Clicking "Connect Google Calendar" during onboarding returns:
```
Error 400: redirect_uri_mismatch
```
Full Google error page (in Russian):
> Вы не можете выполнить вход, потому что это приложение отправило недопустимый запрос.

## Root Cause

The app sends `redirect_uri=http://localhost:3000/api/calendar/callback` in the
OAuth authorization request (read from `GOOGLE_REDIRECT_URI` env var). Google
checks this value against the **Authorized redirect URIs** list in the OAuth 2.0
Client configuration in Google Cloud Console.

If the exact URI is not in that list — Google rejects the request with 400
`redirect_uri_mismatch` before the user even sees the consent screen.

Common causes:
- URI was never added to Google Cloud Console
- URI in env var has trailing slash / different port / http vs https mismatch
- Using a different OAuth Client ID than the one configured

## Solution

**No code changes required.** Fix in Google Cloud Console:

1. Open [console.cloud.google.com](https://console.cloud.google.com) →
   **APIs & Services** → **Credentials**
2. Find the OAuth 2.0 Client ID matching `GOOGLE_CLIENT_ID` in `.env.local`
3. Click edit (pencil icon)
4. Under **Authorized redirect URIs** → **+ ADD URI**
5. Add exactly: `http://localhost:3000/api/calendar/callback`
6. Click **SAVE** (takes a few minutes to propagate)

For production deployment on Vercel also add:
```
https://your-domain.com/api/calendar/callback
```
And update `GOOGLE_REDIRECT_URI` env var on Vercel to the production URL.

## Prevention

- When creating a Google OAuth 2.0 Client ID, immediately add ALL redirect URIs
  you'll need: localhost for dev, production domain for prod.
- The `GOOGLE_REDIRECT_URI` in `.env.local` must match character-for-character
  (including trailing slash, http/https, port) what's in Google Cloud Console.
- Add a checklist comment in `.env.local.example`:
  ```
  # GOOGLE_REDIRECT_URI must be registered in Google Cloud Console →
  # APIs & Services → Credentials → [Your OAuth Client] → Authorized redirect URIs
  ```
- Note: this is DIFFERENT from the Supabase callback URI. The Supabase Google
  provider uses `https://<project>.supabase.co/auth/v1/callback`.
  The Calendar OAuth uses `/api/calendar/callback` in the Next.js app.

## Tags

`#google-oauth` `#calendar` `#configuration` `#redirect-uri` `#google-cloud-console`
