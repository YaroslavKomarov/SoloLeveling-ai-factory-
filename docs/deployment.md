[← API Reference](api.md) · [Back to README](../README.md)

# Deployment

## Overview

| Component | Platform |
|-----------|----------|
| Next.js app | Vercel |
| Database + Auth + Storage | Supabase Cloud |
| Edge Functions (cron jobs) | Supabase Edge Functions (Deno) |
| PWA + Web Push | Service Worker via `next-pwa` |

## Step 0: Create Accounts

### Vercel
1. [vercel.com](https://vercel.com) → Sign Up (GitHub)
2. Import repo: **Add New → Project → Import Git Repository**
3. Deploy (first deploy may fail — configure env vars next)

### Supabase Cloud
1. [supabase.com](https://supabase.com) → New Project
   - Region: Frankfurt (EU Central) or nearest to your users
2. **Project Settings → API** — copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

## Step 1: Generate Secrets

```bash
# VAPID keys for Web Push
node scripts/generate-vapid.mjs
# Copy: NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY

# CRON_SECRET (random 32+ chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# TOKEN_ENCRYPTION_KEY (exactly 32 chars)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

## Step 2: Vercel Environment Variables

**Vercel Dashboard → Project → Settings → Environment Variables (Production)**

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/api/calendar/callback` |
| `TOKEN_ENCRYPTION_KEY` | Step 1 |
| `CRON_SECRET` | Step 1 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Step 1 |
| `VAPID_PRIVATE_KEY` | Step 1 |
| `VAPID_SUBJECT` | `mailto:your@email.com` |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` |
| `LOG_LEVEL` | `info` |

For **Preview** environments: same values, but `LOG_LEVEL=debug`.

## Step 3: Google Cloud Console (Calendar OAuth)

1. [console.cloud.google.com](https://console.cloud.google.com) → Enable **Google Calendar API**
2. Create OAuth 2.0 Client ID (Web application)
   - Redirect URI: `https://your-app.vercel.app/api/calendar/callback`
3. OAuth consent screen → add test users (your email)

## Step 4: Apply Database Migrations

```bash
npm install -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

Verify in Supabase Dashboard → Table Editor: all tables present.

## Step 5: Deploy Edge Functions

```bash
# Set secrets for Edge Functions
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  NEXT_PUBLIC_APP_URL=https://your-app.vercel.app \
  --project-ref <YOUR_PROJECT_REF>

# Deploy functions
supabase functions deploy nightly-planning --no-verify-jwt
supabase functions deploy embedding-worker --no-verify-jwt
supabase functions deploy period-notifications --no-verify-jwt
```

## Step 6: Configure Cron Jobs

**Supabase Dashboard → SQL Editor:**

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Nightly planning at 00:00 UTC
SELECT cron.schedule('nightly-planning', '0 0 * * *',
  $$SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/nightly-planning',
    headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  )$$);

-- Period notifications every minute
SELECT cron.schedule('period-notifications', '* * * * *',
  $$SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/period-notifications',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  )$$);
```

## Step 7: Post-Deploy Verification

```bash
# Health check
curl https://your-app.vercel.app/api/health
# Expected: {"status":"ok","db":"ok","version":"0.1.0","timestamp":"..."}

# Manual nightly planning test
curl -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/nightly-planning \
  -H "Authorization: Bearer <CRON_SECRET>"
# Expected: 200 OK
```

**PWA on mobile:**
1. Open `https://your-app.vercel.app` in Chrome (Android)
2. Look for "Add to Home Screen" prompt
3. iOS: Share → "Add to Home Screen"

## GitHub Actions (CI/CD)

**GitHub → Repo → Settings → Secrets → Actions:**

| Secret | Source |
|--------|--------|
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `vercel link` → `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `vercel link` → `.vercel/project.json` → `projectId` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | Supabase → Project Settings → General |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

## See Also

- [Getting Started](getting-started.md) — local development setup
- [API Reference](api.md) — environment variables consumed by each route
