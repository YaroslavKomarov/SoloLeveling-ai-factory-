[Back to README](../README.md) · [Architecture →](architecture.md)

# Getting Started

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| npm | 10+ |
| Supabase CLI | latest (`npm i -g supabase`) |
| Supabase Cloud project | required |
| Anthropic API key | required |
| Google Cloud project (Calendar API) | required for calendar sync |

## Installation

```bash
git clone <repo>
cd SoloLevelingAiFactory
npm install
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google Calendar OAuth
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your@email.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=<32 random hex chars>
CRON_SECRET=<random 32+ char string>
LOG_LEVEL=debug
```

Generate VAPID keys:
```bash
node scripts/generate-vapid.mjs
```

## Apply Database Migrations

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

Verify in Supabase Dashboard → Table Editor: `users`, `spheres`, `goals`, `tasks`, `activity_periods`, etc.

## Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/login`.

## Verify It Works

1. Register a new account
2. Complete onboarding (chat flow + SchedulerBot activity periods)
3. Connect Google Calendar (OAuth)
4. Create a goal → confirm plan
5. Navigate to `/app/today` — you should see the activity period timeline

## Run Tests

```bash
npm test                  # all tests
npm test -- --reporter=verbose  # verbose output
```

## See Also

- [Architecture](architecture.md) — project structure and patterns
- [Deployment](deployment.md) — production setup on Vercel + Supabase Cloud
