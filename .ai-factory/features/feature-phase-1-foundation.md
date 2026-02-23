# Implementation Plan: Phase 1 — Foundation

Branch: feature/phase-1-foundation
Created: 2026-02-18

## Settings
- Testing: yes — write tests for key logic
- Logging: verbose — DEBUG logs throughout, configurable via LOG_LEVEL env var
- Docs: yes — update AGENTS.md and DESCRIPTION.md after implementation

## Scope
Next.js 14+ project scaffold, design system, Supabase Auth, @me profile initialization,
Google Calendar OAuth, Navigation + UserPanel, Root layout with AnimatedBackground.

Reference: START_PROJECT.md — SC-01 (onboarding), SC-02 (@me profile), SC-03 (Calendar)

## Notes
- `typography.md` and `icons.md` in design/ were written for React Native — ignore Expo/RN specifics
- Web fonts: Cinzel, Cormorant, Orbitron via Google Fonts (as in ui-style.md)
- Icons: `lucide-react` (not `lucide-react-native`)
- Follow web-specific: ui-style.md, components.md, animations.md

---

## Commit Plan

- **Commit 1** (after tasks 1–3): `feat: project scaffold, tailwind design tokens, animated background`
- **Commit 2** (after tasks 4–5): `feat: design system primitives and root layout`
- **Commit 3** (after tasks 6–8): `feat: supabase migrations, client setup, auth middleware`
- **Commit 4** (after tasks 9–11): `feat: auth pages, onboarding flow, @me profile init`
- **Commit 5** (after tasks 12–14): `feat: google calendar oauth, app shell, navigation`
- **Commit 6** (after tasks 15–16): `test: add tests; docs: update AGENTS.md`

---

## Tasks

### Phase A: Project Scaffold & Design Tokens

- [x] **Task 1: Next.js project scaffold + all dependencies**

  Create the Next.js 14+ application inside the repository root (or a subdirectory `app/` — see note).

  **Scaffold command:**
  ```bash
  npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
  # or into a subdirectory:
  npx create-next-app@latest soloLevelingApp --typescript --tailwind --app --src-dir --import-alias "@/*"
  ```

  **Install all project dependencies:**
  ```bash
  npm install \
    @supabase/supabase-js @supabase/ssr \
    zustand \
    react-hook-form @hookform/resolvers zod \
    framer-motion \
    lucide-react \
    recharts \
    ai @ai-sdk/anthropic

  npm install -D @types/node vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
  ```

  **TypeScript strict mode** — ensure `tsconfig.json` has:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true
    }
  }
  ```

  **Environment variables** — create `.env.local.example`:
  ```
  # Supabase
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=

  # Google Calendar OAuth
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback

  # Token encryption (32-char secret)
  TOKEN_ENCRYPTION_KEY=

  # App
  NEXT_PUBLIC_APP_URL=http://localhost:3000

  # Logging
  LOG_LEVEL=debug
  ```

  **Add `.env.local` to `.gitignore`** (keep `.env.local.example` tracked).

  **Vitest config** — create `vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config'
  import react from '@vitejs/plugin-react'
  import path from 'path'

  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  })
  ```

  Create `src/test/setup.ts`:
  ```typescript
  import '@testing-library/jest-dom'
  ```

  Files: `package.json`, `tsconfig.json`, `.env.local.example`, `vitest.config.ts`, `src/test/setup.ts`, `.gitignore`

- [x] **Task 2: Tailwind design tokens + global CSS**

  Configure Tailwind and global CSS to implement the complete design system from `design/ui-style.md` and `design/colors.md`.

  **`tailwind.config.ts`** — extend with project tokens:
  ```typescript
  const config: Config = {
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
      extend: {
        colors: {
          'darker-navy': '#0a0c10',
          'dark-navy': '#0f1419',
          'deep-blue': '#1a1f2e',
          'physical': '#00d4ff',
          'emotional': '#ec4899',
          'intellectual': '#a855f7',
        },
        fontFamily: {
          heading: ['Cinzel', 'serif'],
          body: ['Cormorant', 'Georgia', 'serif'],
          mono: ['Orbitron', 'monospace'],
        },
        borderRadius: {
          DEFAULT: '0',
        },
      },
    },
  }
  ```

  **`src/app/globals.css`** — full design system CSS:
  - Google Fonts import: Cinzel (400,500,600,700), Cormorant (300,400,500,600), Orbitron (400,500,700)
  - CSS custom properties for all color tokens (from colors.md)
  - Base typography: body = Cormorant 300, h1/h2/h3 = Cinzel with uppercase + letter-spacing
  - Button font: Cinzel, uppercase, letter-spacing 0.08em
  - Input font: Cormorant 300
  - Custom scrollbar (6px, rgba borders, no border-radius)
  - Glow utility classes: `.subtle-glow`, `.text-glow`, `.border-glow`
  - Placeholder color: rgba(255,255,255,0.5)

  **LOGGING:** Log CSS variable initialization errors if custom properties are not supported.

  Files: `tailwind.config.ts`, `src/app/globals.css`

- [x] **Task 3: AnimatedBackground canvas component**

  Implement the exact AnimatedBackground spec from `design/animations.md`.

  **`src/components/layout/AnimatedBackground.tsx`:**
  - `'use client'` directive
  - `useRef<HTMLCanvasElement>` + `useEffect`
  - `setCanvasSize()` on mount + resize listener
  - Grid: 50x50px, `rgba(255, 255, 255, 0.03)`, lineWidth 1
  - 50 particles: random position, vx/vy ∈ [-0.25, 0.25], size 1–3, opacity 0.2–0.7
  - Particle update: add velocity, bounce off walls (vx/vy *= -1)
  - Connections: draw if distance < 150px, opacity = `0.15 * (1 - distance/150)`
  - Particle draw: `rgba(255, 255, 255, ${opacity * 0.6})`
  - Canvas: `fixed inset-0 pointer-events-none opacity-30`, z-index 0
  - Cleanup: `cancelAnimationFrame` + `removeEventListener` in return fn

  **LOGGING:**
  ```typescript
  const logger = createLogger('AnimatedBackground')
  logger.debug('Canvas initialized', { width, height, particleCount: 50 })
  logger.debug('Animation started')
  // On unmount:
  logger.debug('Animation cleaned up')
  ```

  **`src/lib/logger.ts`** — create shared logger:
  ```typescript
  const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

  export function createLogger(module: string) {
    return {
      debug: (msg: string, data?: unknown) => {
        if (['debug'].includes(LOG_LEVEL)) console.debug(`[${module}] ${msg}`, data ?? '')
      },
      info: (msg: string, data?: unknown) => {
        if (['debug', 'info'].includes(LOG_LEVEL)) console.info(`[${module}] ${msg}`, data ?? '')
      },
      warn: (msg: string, data?: unknown) => {
        if (['debug', 'info', 'warn'].includes(LOG_LEVEL)) console.warn(`[${module}] ${msg}`, data ?? '')
      },
      error: (msg: string, data?: unknown) => console.error(`[${module}] ${msg}`, data ?? ''),
    }
  }
  ```

  Files: `src/components/layout/AnimatedBackground.tsx`, `src/lib/logger.ts`

<!-- 🔄 Commit checkpoint: tasks 1–3 → `feat: project scaffold, tailwind design tokens, animated background` -->

### Phase B: Design System Primitives & Root Layout

- [x] **Task 4: Base UI primitives (Button, Card, Input, Progress, Badge)**

  Implement reusable design system components per `design/components.md`.

  **`src/components/ui/Button.tsx`:**
  - Variants: `default` (outline), `ghost`, `destructive`
  - Sizes: `sm` (h-8), `default` (h-9), `lg` (h-10), `icon` (36×36)
  - Default: transparent bg, `rgba(255,255,255,0.2)` border, white text, Cinzel font, uppercase, tracking-wide
  - Hover: glow increases (`0 0 12px rgba(255,255,255,0.25)`)
  - Disabled: opacity-40, cursor-not-allowed, `#555B6E` border + text
  - border-radius: `rounded-md` (exception from default 0)
  - Framer Motion `whileHover={{ scale: 1.02 }}` + `whileTap={{ scale: 0.98 }}`
  - Props: `variant`, `size`, `isLoading` (shows spinner), standard button attrs
  - LOGGING: `logger.debug('[Button] clicked', { variant, disabled })`

  **`src/components/ui/Card.tsx`:**
  - `backdrop-blur-sm`, `rgba(26,31,46,0.6)` bg, `rgba(255,255,255,0.2)` border
  - border-radius: 0
  - `box-shadow: 0 0 15px rgba(255,255,255,0.1)`
  - Hover variant (clickable): bg darkens on hover via Framer Motion
  - Sub-components: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`

  **`src/components/ui/Input.tsx`:**
  - `rgba(26,31,46,0.4)` bg, `rgba(255,255,255,0.1)` border, h-9, border-radius `rounded-md`
  - Cormorant 300 font, white text
  - Focus: border → `rgba(255,255,255,0.3)`, ring `0 0 0 3px rgba(255,255,255,0.1)`
  - Placeholder: `rgba(255,255,255,0.5)`
  - Error state: destructive border glow
  - Textarea variant

  **`src/components/ui/Progress.tsx`:**
  - Container: `rounded-full`, `rgba(255,255,255,0.2)` bg, h-2
  - Bar: white bg, `0 0 8px rgba(255,255,255,0.4)` glow, transition 300ms
  - Color prop for fatigue: `physical` (#00d4ff), `emotional` (#ec4899), `intellectual` (#a855f7)

  **`src/components/ui/Badge.tsx`:**
  - Small badge for statuses, tags
  - White border, transparent bg, Cinzel xs uppercase

  All components must include JSDoc with usage example.

  Files: `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/Progress.tsx`, `src/components/ui/Badge.tsx`, `src/components/ui/index.ts`

- [x] **Task 5: Root layout, Navigation, UserPanel placeholders**

  Wire AnimatedBackground into the Next.js root layout and create Navigation + UserPanel shells.

  **`src/app/layout.tsx`** (root):
  ```tsx
  import { AnimatedBackground } from '@/components/layout/AnimatedBackground'
  // Google Fonts: Cinzel, Cormorant, Orbitron via next/font/google
  // Apply font CSS variables to <html>
  // AnimatedBackground rendered before {children}
  // Base: bg-[#0a0c10] text-white min-h-screen
  ```

  **`src/components/layout/Navigation.tsx`:**
  - `fixed top-0 left-0 right-0 z-50`
  - `bg-[#0a0c10]` border-b `rgba(255,255,255,0.2)` shadow
  - Links: Dashboard (`/app/dashboard`), Goals (`/app/goals`), Knowledge (`/app/knowledge`), Settings (`/app/settings`)
  - Active link: white text + subtle bg + text-glow; inactive: 50% opacity
  - Cinzel font, uppercase, tracking-wide
  - `--header-height: 56px` CSS variable on `:root`
  - LOGGING: `logger.debug('[Navigation] rendered', { pathname })`

  **`src/components/layout/UserPanel.tsx`:**
  - Placeholder that displays inside Navigation (right side)
  - Avatar placeholder (User icon from lucide-react)
  - Level badge: Orbitron font, white
  - XP progress bar: thin, white, `rounded-full`
  - 3 fatigue bars stacked vertically: Physical (cyan #00d4ff), Emotional (pink #ec4899), Intellectual (purple #a855f7)
  - Data from `src/store/user.ts` (Zustand)
  - Hardcoded initial values for now: level=1, xp=0/100, fatigue=0/0/0
  - LOGGING: `logger.debug('[UserPanel] fatigue updated', { physical, emotional, intellectual })`

  **`src/store/user.ts`** — Zustand store:
  ```typescript
  interface UserState {
    level: number
    xp: number
    xpToNext: number
    fatigue: { physical: number; emotional: number; intellectual: number }
    // setters
  }
  ```

  **`src/app/(app)/layout.tsx`** — protected app layout:
  - Renders `<Navigation />` + `<main className="pt-[56px]">{children}</main>`
  - Wraps children in `PageTransition` (from animations.md)

  **`src/app/(auth)/layout.tsx`** — auth layout (no nav/user panel):
  - Centered content, AnimatedBackground already in root layout

  **`src/components/layout/PageTransition.tsx`** — Framer Motion page wrapper:
  - `initial={{ x: 20, opacity: 0 }}`, `animate={{ x: 0, opacity: 1 }}`, `exit={{ x: -20, opacity: 0 }}`
  - duration 0.4, cubic-bezier(0.25, 0.1, 0.25, 1)

  Files: `src/app/layout.tsx`, `src/components/layout/Navigation.tsx`, `src/components/layout/UserPanel.tsx`, `src/components/layout/PageTransition.tsx`, `src/store/user.ts`

<!-- 🔄 Commit checkpoint: tasks 4–5 → `feat: design system primitives and root layout` -->

### Phase C: Supabase Setup & Auth

- [x] **Task 6: Supabase migrations (database schema)**

  Create SQL migration files for all Phase 1 entities. User runs these on their Supabase project.

  **`supabase/migrations/001_initial_schema.sql`:**

  ```sql
  -- Enable extensions
  create extension if not exists "uuid-ossp";
  create extension if not exists "vector";

  -- users table
  create table public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    display_name text,
    avatar_url text,
    level integer not null default 1,
    xp integer not null default 0,
    timezone text not null default 'UTC',
    activity_window_start time not null default '09:00',
    activity_window_end time not null default '21:00',
    calendar_token_encrypted text,
    calendar_connected_at timestamptz,
    retrospective_day integer default 0, -- 0=Sun..6=Sat
    retrospective_time time default '18:00',
    onboarding_completed boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- notes table (KB + @me profile storage)
  -- content stored as TEXT (not Storage) per DESCRIPTION.md
  create table public.notes (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references public.users(id) on delete cascade,
    path text not null,          -- e.g. '@me/profile.md', 'Work/Learn Python/goal.md'
    title text not null,
    content text not null default '',
    tags text[] not null default '{}',
    metadata jsonb not null default '{}',
    wikilinks text[] not null default '{}',
    is_readonly boolean not null default false, -- true for @me/patterns.md
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, path)
  );

  -- embedding queue (processed by Edge Function every 2-3 min)
  create table public.embedding_queue (
    id uuid primary key default uuid_generate_v4(),
    note_id uuid not null references public.notes(id) on delete cascade,
    status text not null default 'pending', -- pending | processing | done | error
    created_at timestamptz not null default now()
  );

  -- embeddings (pgvector for RAG)
  create table public.embeddings (
    id uuid primary key default uuid_generate_v4(),
    note_id uuid not null references public.notes(id) on delete cascade,
    chunk_index integer not null default 0,
    content text not null,
    embedding vector(1536),
    created_at timestamptz not null default now()
  );
  create index on public.embeddings using ivfflat (embedding vector_cosine_ops);

  -- Row Level Security
  alter table public.users enable row level security;
  alter table public.notes enable row level security;
  alter table public.embedding_queue enable row level security;
  alter table public.embeddings enable row level security;

  -- RLS Policies (users own their data)
  create policy "users: own row" on public.users for all using (auth.uid() = id);
  create policy "notes: own rows" on public.notes for all using (auth.uid() = user_id);
  create policy "embedding_queue: own rows" on public.embedding_queue for all using (
    note_id in (select id from public.notes where user_id = auth.uid())
  );
  create policy "embeddings: own rows" on public.embeddings for all using (
    note_id in (select id from public.notes where user_id = auth.uid())
  );

  -- Updated_at trigger
  create or replace function public.handle_updated_at()
  returns trigger as $$
  begin new.updated_at = now(); return new; end;
  $$ language plpgsql;

  create trigger users_updated_at before update on public.users
    for each row execute function public.handle_updated_at();
  create trigger notes_updated_at before update on public.notes
    for each row execute function public.handle_updated_at();

  -- Auto-create user row on auth.users insert
  create or replace function public.handle_new_user()
  returns trigger as $$
  begin
    insert into public.users (id, email)
    values (new.id, new.email);
    return new;
  end;
  $$ language plpgsql security definer;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```

  **LOGGING (migration docs):** Add comment in migration noting which app version introduced each table.

  Files: `supabase/migrations/001_initial_schema.sql`

- [x] **Task 7: Supabase client + TypeScript types**

  Set up Supabase clients for browser and server (Next.js SSR pattern).

  **`src/lib/supabase/types.ts`** — Database type definitions (mirror migration schema):
  ```typescript
  export interface Database {
    public: {
      Tables: {
        users: { Row: UserRow; Insert: UserInsert; Update: UserUpdate }
        notes: { Row: NoteRow; Insert: NoteInsert; Update: NoteUpdate }
        embedding_queue: { ... }
        embeddings: { ... }
      }
    }
  }
  // All Row/Insert/Update types fully typed
  ```

  **`src/lib/supabase/client.ts`** — browser client (singleton):
  ```typescript
  import { createBrowserClient } from '@supabase/ssr'
  // Export createClient() function (not module-level to avoid SSR issues)
  // LOG: logger.debug('[supabase/client] Browser client created')
  ```

  **`src/lib/supabase/server.ts`** — server client (for Server Components + API Routes):
  ```typescript
  import { createServerClient } from '@supabase/ssr'
  import { cookies } from 'next/headers'
  // Returns client with cookie handling
  // LOG: logger.debug('[supabase/server] Server client created')
  ```

  **`src/lib/supabase/admin.ts`** — service role client (for privileged operations):
  ```typescript
  // Uses SUPABASE_SERVICE_ROLE_KEY (server-only, never import in client components)
  // LOG: logger.debug('[supabase/admin] Admin client created')
  ```

  **`src/lib/supabase/index.ts`** — barrel export

  LOGGING requirements:
  - Log all database errors with query context
  - Log query results count (not full data) at DEBUG level
  - Use format: `[supabase/module] operation {table, userId, result}`

  Files: `src/lib/supabase/types.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/index.ts`

- [x] **Task 8: Auth middleware + protected routes**

  Implement Next.js middleware for route protection and session refresh.

  **`src/middleware.ts`:**
  ```typescript
  // Uses @supabase/ssr updateSession pattern
  // Matcher: '/((?!_next/static|_next/image|favicon.ico|api/auth/callback).*)'

  // Route rules:
  // /app/* → requires auth → redirect to /login if no session
  // /login, /register → if authenticated → redirect to /app/dashboard
  // /onboarding → requires auth + onboarding NOT completed
  // /app/* → requires auth + onboarding completed → else redirect to /onboarding

  // LOGGING:
  logger.debug('[middleware] request', { pathname, userId: session?.user.id ?? 'anonymous' })
  logger.info('[middleware] redirect', { from: pathname, to: redirectUrl, reason })
  ```

  **`src/app/api/auth/callback/route.ts`:**
  - Handles Supabase OAuth callback (code exchange)
  - Redirects to `/onboarding` if user.onboarding_completed = false, else `/app/dashboard`
  - LOG: `[auth/callback] OAuth callback received`, `[auth/callback] session established`, `[auth/callback] redirect to {url}`

  **`src/app/api/auth/logout/route.ts`:**
  - POST → `supabase.auth.signOut()` → redirect to `/login`
  - LOG: `[auth/logout] user signed out {userId}`

  Files: `src/middleware.ts`, `src/app/api/auth/callback/route.ts`, `src/app/api/auth/logout/route.ts`

<!-- 🔄 Commit checkpoint: tasks 6–8 → `feat: supabase migrations, client setup, auth middleware` -->

### Phase D: Auth Pages & Onboarding

- [x] **Task 9: Login and Register pages**

  Implement auth pages using design system components. Server Actions for form submission.

  **`src/app/(auth)/login/page.tsx`:**
  - Welcome screen: dark background + AnimatedBackground already in root layout
  - Logo/title: "SOLO LEVELING" in Cinzel, uppercase, text-glow effect
  - Card with Input (email, password) + Button "Enter"
  - Google OAuth button: "Continue with Google" (Google icon via simple SVG, not lucide)
  - Link to `/register`
  - Error display (inline, no toast)
  - React Hook Form + Zod validation schema
  - Server Action `loginAction` → `supabase.auth.signInWithPassword()`
  - LOGGING:
    ```
    [login/page] form submitted {email}
    [login/action] attempting sign in {email}
    [login/action] sign in result {success: true/false, error?: message}
    ```

  **`src/app/(auth)/register/page.tsx`:**
  - Similar layout to login
  - Fields: email, password, confirm password
  - Server Action `registerAction` → `supabase.auth.signUp()`
  - On success: show "Check your email" message (if email confirmation enabled)
    or redirect to `/onboarding`
  - LOGGING:
    ```
    [register/action] attempting sign up {email}
    [register/action] sign up result {success, userId}
    ```

  **`src/lib/auth/actions.ts`** — Server Actions:
  - `loginAction(formData)`, `registerAction(formData)`, `googleOAuthAction()`
  - All wrapped in try/catch with structured error returns
  - LOG entry + exit for each action with timing

  **`src/lib/auth/validation.ts`** — Zod schemas:
  - `loginSchema`, `registerSchema`

  Files: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/lib/auth/actions.ts`, `src/lib/auth/validation.ts`

- [x] **Task 10: Onboarding flow (SC-01) — multi-step wizard**

  Multi-step onboarding per SC-01. Each step must be completed before proceeding.

  **`src/app/(auth)/onboarding/page.tsx`** — wizard controller

  **`src/components/onboarding/` directory with:**

  **Step 1: WelcomeStep.tsx** — Welcome screen
  - "SOLO LEVELING" title, brief system description (2-3 sentences)
  - Button "Begin" → advance to step 2
  - Framer Motion entrance: `opacity: 0 → 1, scale: 0.95 → 1, duration: 1.2`

  **Step 2: ProfileSetupStep.tsx** — Collect user data
  - Fields: display name, timezone (select with common zones), activity window (start time, end time)
  - Form validation via Zod
  - On submit: call `initializeUserProfile(data)` (see Task 11)
  - LOGGING: `[onboarding/profile] form submitted {displayName, timezone, window}`

  **Step 3: CalendarStep.tsx** — Google Calendar OAuth (MANDATORY)
  - Explanation: "Calendar connection is required for task scheduling"
  - Button "Connect Google Calendar" → GET `/api/calendar/connect` → redirect to Google OAuth
  - If already connected (returns from callback): show success state + "Connected" badge
  - Cannot skip — "Continue" button disabled until connected
  - Status check: poll or server-side check `users.calendar_connected_at IS NOT NULL`
  - LOGGING: `[onboarding/calendar] connection initiated`, `[onboarding/calendar] connected {at}`

  **Step 4: RetroScheduleStep.tsx** — Set retrospective schedule
  - Select day of week (0=Sun..6=Sat) + time
  - Default: Sunday 18:00
  - On submit: save to `users.retrospective_day` + `users.retrospective_time`
  - LOGGING: `[onboarding/retro] schedule set {day, time}`

  **Step 5: CompleteStep.tsx** — Completion + first sphere prompt
  - "Setup complete! Create your first sphere to begin."
  - Button "Create First Sphere" → `/app/goals/new-sphere`
  - Button "Go to Dashboard" → `/app/dashboard`
  - Set `users.onboarding_completed = true` before redirect
  - LOGGING: `[onboarding] completed {userId}`

  **`src/store/onboarding.ts`** — Zustand store for step state:
  ```typescript
  { currentStep: number; data: Partial<OnboardingData>; advance(); setData(partial); }
  ```

  **Navigation between steps:** back button available (except step 1), progress indicator (dots or step numbers)

  Files: `src/app/(auth)/onboarding/page.tsx`, `src/components/onboarding/*.tsx`, `src/store/onboarding.ts`

- [x] **Task 11: @me profile initialization in PostgreSQL**

  When user completes Step 2 of onboarding, create 6 markdown notes in the `notes` table.

  **`src/lib/me-profile/templates.ts`** — markdown templates for each @me file:
  ```typescript
  export function generateProfileMd(data: { name: string; timezone: string; activityWindow: string }) {
    return `---
  name: ${data.name}
  timezone: ${data.timezone}
  activity_window: ${data.activityWindow}
  created_at: ${new Date().toISOString()}
  ---

  # Profile

  Name: ${data.name}
  Timezone: ${data.timezone}
  Activity Window: ${data.activityWindow}
  `
  }
  // Similar for career.md, skills.md, interests.md, personality.md
  // patterns.md: empty template, is_readonly: true
  ```

  **`src/lib/me-profile/initialize.ts`:**
  ```typescript
  export async function initializeUserProfile(
    supabase: SupabaseClient,
    userId: string,
    profileData: ProfileData
  ): Promise<{ success: boolean; error?: string }> {
    // LOGGING:
    logger.info('[me-profile/initialize] starting', { userId })

    const notes = [
      { path: '@me/profile.md', title: 'Profile', content: generateProfileMd(profileData) },
      { path: '@me/career.md', title: 'Career', content: generateCareerMd() },
      { path: '@me/skills.md', title: 'Skills', content: generateSkillsMd() },
      { path: '@me/interests.md', title: 'Interests', content: generateInterestsMd() },
      { path: '@me/personality.md', title: 'Personality', content: generatePersonalityMd() },
      { path: '@me/patterns.md', title: 'Patterns', content: generatePatternsMd(), is_readonly: true },
    ]

    // Also update users table: display_name, timezone, activity_window_start/end

    // LOG:
    logger.info('[me-profile/initialize] completed', { userId, noteCount: notes.length })
  }
  ```

  **`src/lib/supabase/notes.ts`** — note CRUD:
  ```typescript
  export async function createNote(supabase, note: NoteInsert): Promise<NoteRow>
  export async function getNoteByPath(supabase, userId: string, path: string): Promise<NoteRow | null>
  export async function updateNote(supabase, id: string, updates: NoteUpdate): Promise<NoteRow>
  export async function listNotesByPrefix(supabase, userId: string, pathPrefix: string): Promise<NoteRow[]>
  ```

  LOGGING in all CRUD functions:
  ```
  [notes/create] creating note {userId, path}
  [notes/create] note created {id, path}
  [notes/getByPath] {userId, path, found: true/false}
  ```

  Files: `src/lib/me-profile/templates.ts`, `src/lib/me-profile/initialize.ts`, `src/lib/supabase/notes.ts`

<!-- 🔄 Commit checkpoint: tasks 9–11 → `feat: auth pages, onboarding flow, @me profile init` -->

### Phase E: Google Calendar OAuth & App Shell

- [x] **Task 12: Google Calendar OAuth + encrypted token storage**

  Implement OAuth 2.0 flow for Google Calendar (read-only scope). Token stored encrypted.

  **`src/lib/calendar/oauth.ts`** — OAuth URL generation + token exchange:
  ```typescript
  const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

  export function generateAuthUrl(userId: string): string
  // Generates OAuth URL with state=userId for CSRF protection
  // LOG: [calendar/oauth] auth URL generated {userId}

  export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens>
  // LOG: [calendar/oauth] exchanging code for tokens
  // LOG: [calendar/oauth] tokens received {hasAccessToken, hasRefreshToken, expiresAt}
  ```

  **`src/lib/calendar/encryption.ts`** — AES-256-GCM token encryption:
  ```typescript
  export function encryptToken(token: string, key: string): string
  export function decryptToken(encrypted: string, key: string): string
  // Use Node.js `crypto` module (server-only)
  // LOG: [calendar/encryption] token encrypted/decrypted {length}
  ```

  **`src/lib/calendar/client.ts`** — Google Calendar API:
  ```typescript
  export async function getCalendarEvents(
    accessToken: string,
    date: Date
  ): Promise<CalendarEvent[]>
  // Used for: connection test (count today's events)
  // LOG: [calendar/client] fetching events {date, count}
  ```

  **`src/app/api/calendar/connect/route.ts`** — GET:
  ```typescript
  // 1. Get authenticated user from session
  // 2. Generate Google OAuth URL with userId in state
  // 3. Redirect to Google
  // LOG: [api/calendar/connect] initiating OAuth {userId}
  ```

  **`src/app/api/calendar/callback/route.ts`** — GET:
  ```typescript
  // 1. Validate state param (userId)
  // 2. Exchange code for tokens
  // 3. Encrypt tokens with TOKEN_ENCRYPTION_KEY
  // 4. Save to users.calendar_token_encrypted + users.calendar_connected_at
  // 5. Test connection: fetch today's event count
  // 6. Redirect to /onboarding (step 4) or /app/settings
  // LOG: [api/calendar/callback] received callback {userId}
  // LOG: [api/calendar/callback] tokens stored and encrypted
  // LOG: [api/calendar/callback] connection test: {eventCount} events today
  ```

  **`src/app/api/calendar/disconnect/route.ts`** — POST:
  ```typescript
  // Clear users.calendar_token_encrypted + calendar_connected_at
  // LOG: [api/calendar/disconnect] calendar disconnected {userId}
  ```

  Files: `src/lib/calendar/oauth.ts`, `src/lib/calendar/encryption.ts`, `src/lib/calendar/client.ts`, `src/app/api/calendar/connect/route.ts`, `src/app/api/calendar/callback/route.ts`, `src/app/api/calendar/disconnect/route.ts`

- [x] **Task 13: App shell — complete Navigation + UserPanel**

  Wire up Navigation and UserPanel with real data from Supabase.

  **`src/app/(app)/layout.tsx`** — fetch real user data on server:
  ```typescript
  // Server Component: fetch user from DB (level, xp, daily_fatigue)
  // Pass to UserPanel as initial props
  // daily_fatigue defaults to {physical:0, emotional:0, intellectual:0} in Phase 1
  // LOG: [app/layout] user loaded {userId, level, xp}
  ```

  **`src/components/layout/UserPanel.tsx`** — final implementation:
  - Avatar: User icon (lucide) in 32×32 square border, white, subtle glow
  - Level: `LVL {n}` — Orbitron font, white, text-glow
  - XP bar: `{xp} / {xpToNext} XP` under level, thin Progress component
  - 3 fatigue bars with labels:
    - `Dumbbell` icon (physical, cyan #00d4ff) + bar
    - `Heart` icon (emotional, pink #ec4899) + bar
    - `Cpu` icon (intellectual, purple #a855f7) + bar
  - Warning icon (`AlertTriangle`, lucide) appears when any fatigue ≥ 91%
  - Settings link: `Settings` icon (lucide) → `/app/settings`
  - All icons: `strokeWidth={1.5}`, size 16
  - Client component with Zustand hydration from server-fetched initial data
  - LOGGING: `[UserPanel] hydrated {level, xp, fatigue}`

  **`src/app/(app)/dashboard/page.tsx`** — placeholder:
  - "DASHBOARD" heading (Cinzel, h1 style)
  - Card with "Phase 2: Daily Execution coming soon"
  - Links to phase features (greyed out)

  Files: `src/app/(app)/layout.tsx`, `src/components/layout/UserPanel.tsx` (update), `src/app/(app)/dashboard/page.tsx`

- [x] **Task 14: Settings page (Phase 1 scope)**

  Basic settings page covering Calendar management, timezone, activity window (per SC-16).

  **`src/app/(app)/settings/page.tsx`:**
  - "SETTINGS" heading
  - Section: **Calendar** — shows connection status, "Disconnect" button if connected, "Connect" button if not
  - Section: **Profile** — display name (editable), timezone (select), activity window (start/end time)
  - Section: **Retrospectives** — day/time selector
  - Section: **Account** — logout button
  - All changes saved via Server Actions with optimistic updates
  - LOGGING per section: `[settings] {section} updated {userId, changes}`

  Files: `src/app/(app)/settings/page.tsx`, `src/lib/settings/actions.ts`

<!-- 🔄 Commit checkpoint: tasks 12–14 → `feat: google calendar oauth, app shell, navigation` -->

### Phase F: Tests & Documentation

- [x] **Task 15: Tests for key logic**

  Write unit tests for non-trivial logic (middleware, encryption, profile init, notes CRUD).

  **`src/test/auth/middleware.test.ts`:**
  - Route protection rules: unauthenticated → redirect to /login
  - Authenticated + onboarding incomplete → redirect to /onboarding
  - Authenticated + onboarding complete → allow through to /app/*
  - Public routes accessible without auth

  **`src/test/calendar/encryption.test.ts`:**
  - `encryptToken` + `decryptToken` round-trip returns original value
  - Different tokens produce different ciphertext
  - Wrong key fails decryption (throws)

  **`src/test/me-profile/initialize.test.ts`:**
  - `initializeUserProfile` creates exactly 6 notes
  - All required paths created (@me/profile.md ... @me/patterns.md)
  - patterns.md has `is_readonly: true`
  - `generateProfileMd` includes all required frontmatter fields

  **`src/test/supabase/notes.test.ts`:**
  - `createNote` → insert with correct shape
  - `getNoteByPath` → returns null for missing, row for existing
  - `updateNote` → applies updates correctly
  - Mock Supabase client for all tests

  **`src/test/components/Button.test.tsx`:**
  - Renders with correct variant classes
  - Disabled state prevents click
  - isLoading shows spinner

  All test files use Vitest + @testing-library/react.
  Mock pattern: `vi.mock('@/lib/supabase/client')` etc.

  Files: `src/test/auth/middleware.test.ts`, `src/test/calendar/encryption.test.ts`, `src/test/me-profile/initialize.test.ts`, `src/test/supabase/notes.test.ts`, `src/test/components/Button.test.tsx`

- [x] **Task 16: Update AGENTS.md with actual file structure**

  After all code is written, update AGENTS.md to reflect the real directory structure (not just planned).

  - Update "Project Structure" section with actual created directories and files
  - Update "Key Entry Points" with real paths to app entry points
  - Add "Phase 1 Status: Complete" section
  - Note any deviations from the original plan

  Files: `AGENTS.md`, `.ai-factory/features/feature-phase-1-foundation.md` (mark all tasks ✅)

<!-- 🔄 Commit checkpoint: tasks 15–16 → `test: add tests; docs: update AGENTS.md` -->

---

## Definition of Done for Phase 1

- [ ] `npm run dev` starts without errors
- [ ] AnimatedBackground renders on all pages
- [ ] User can register with email/password
- [ ] User can sign in with Google OAuth
- [ ] Onboarding flow completes (all 5 steps)
- [ ] @me files created in PostgreSQL on onboarding completion
- [ ] Google Calendar connected and token stored encrypted
- [ ] Navigation fixed at top on all /app/* pages
- [ ] UserPanel always visible with level, XP, 3 fatigue bars
- [ ] Fatigue bars use correct colors (cyan/pink/purple)
- [ ] No emojis anywhere in the UI
- [ ] `npm test` passes all unit tests
- [ ] All routes properly protected by middleware
