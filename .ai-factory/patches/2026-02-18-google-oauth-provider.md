# Google OAuth fails: provider not enabled in Supabase

**Date:** 2026-02-18
**Files:** none (configuration issue, no code changes)
**Severity:** high

## Problem

Clicking "Continue with Google" returns:
```
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

## Root Cause

The Google OAuth provider was not enabled in the Supabase Dashboard.
`supabase.auth.signInWithOAuth({ provider: 'google' })` reaches Supabase's
GoTrue service, which rejects the request immediately if the provider is
disabled — before any redirect is issued. The application code is correct.

## Solution

**No code changes required.** Two-step configuration:

1. **Google Cloud Console** — create OAuth 2.0 Client ID (Web application),
   add authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`

2. **Supabase Dashboard** → Authentication → Providers → Google:
   enable the provider, paste Client ID and Client Secret, save.

## Prevention

- When setting up a new Supabase project, enable all required auth providers
  in the Dashboard BEFORE writing auth code or testing OAuth flows.
- The `.env.local.example` does NOT list Supabase Google OAuth vars because
  they are configured in the Dashboard, not env vars. Add a comment there
  to remind about this step.
- For local dev with `supabase start`, add to `supabase/config.toml`:
  ```toml
  [auth.external.google]
  enabled = true
  client_id = "env(GOOGLE_CLIENT_ID)"
  secret = "env(GOOGLE_CLIENT_SECRET)"
  ```

## Tags

`#supabase` `#auth` `#google-oauth` `#configuration` `#dashboard`
