# Ручное руководство по деплою SoloLeveling

Этот документ описывает **только действия, которые нужно выполнить вручную**.
Изменения в коде автоматически реализуются через `/implement` (см. `.ai-factory/features/feature-production-deployment.md`).

Выполняй шаги **по порядку** — некоторые зависят от предыдущих.

---

## Этап 0: Подготовка аккаунтов

### 0.1 Vercel
1. Зайди на [vercel.com](https://vercel.com) → Sign Up (через GitHub аккаунт)
2. Импортируй репозиторий: **Add New → Project → Import Git Repository**
3. Выбери `SoloLevelingAiFactory`, нажми **Deploy** (первый деплой может упасть — это нормально, настроим переменные ниже)

### 0.2 Supabase Cloud
1. Зайди на [supabase.com](https://supabase.com) → Sign In
2. Создай новый проект: **New Project**
   - Name: `solo-leveling`
   - Region: **Frankfurt (EU Central)** — ближайший к России
   - Database Password: сохрани в надёжном месте (понадобится)
3. Дождись создания проекта (~2 минуты)
4. Открой **Project Settings → API** и скопируй:
   - `Project URL` → это `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` ключ → это `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` ключ → это `SUPABASE_SERVICE_ROLE_KEY` (держи в секрете!)

### 0.3 Установка Supabase CLI (один раз)
```bash
# Windows (через npm)
npm install -g supabase

# Проверка
supabase --version
```

---

## Этап 1: Генерация секретов (после реализации Task 3)

> Выполни после того как Claude реализует Task 3 (появится `scripts/generate-vapid.mjs`)

### 1.1 VAPID ключи для Web Push
```bash
node scripts/generate-vapid.mjs
```
Скопируй и сохрани вывод:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxxxxxxx...
VAPID_PRIVATE_KEY=xxxxxxxx...
```

### 1.2 CRON_SECRET
Сгенерируй случайную строку (32+ символа):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Сохрани как `CRON_SECRET=...`

### 1.3 TOKEN_ENCRYPTION_KEY
Ровно 32 символа (уже должно быть в `.env.local`, просто скопируй):
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## Этап 2: Настройка Vercel Environment Variables

Открой: **Vercel Dashboard → твой проект → Settings → Environment Variables**

Добавь следующие переменные (для окружения **Production**):

| Переменная | Значение | Где взять |
|-----------|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Supabase → Project Settings → API (секрет!) |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/api/calendar/callback` | твой Vercel URL |
| `TOKEN_ENCRYPTION_KEY` | 32-символьная строка | Сгенерировано в Этапе 1.3 |
| `CRON_SECRET` | случайная строка | Сгенерировано в Этапе 1.2 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | публичный VAPID ключ | Сгенерировано в Этапе 1.1 |
| `VAPID_PRIVATE_KEY` | приватный VAPID ключ | Сгенерировано в Этапе 1.1 |
| `VAPID_SUBJECT` | `mailto:твой@email.com` | твой email |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | URL из Vercel Dashboard |
| `LOG_LEVEL` | `info` | фиксированное значение |
| `AI_PROVIDER` | `anthropic` | фиксированное значение |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |

> Для **Preview** окружения можно продублировать те же значения, только `LOG_LEVEL=debug`

### Как узнать свой Vercel URL
Vercel Dashboard → твой проект → вкладка **Deployments** → URL последнего деплоя.
Обычно формат: `https://solo-leveling-ai-factory.vercel.app`

---

## Этап 3: Google Cloud Console (для Calendar OAuth)

> Пропусти если Google Calendar уже настроен в `.env.local`

1. Зайди на [console.cloud.google.com](https://console.cloud.google.com)
2. Создай новый проект или выбери существующий
3. **APIs & Services → Enable APIs** → найди и включи **Google Calendar API**
4. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://your-app.vercel.app/api/calendar/callback`
5. Скопируй `Client ID` и `Client Secret` в Vercel Environment Variables (Этап 2)
6. **APIs & Services → OAuth consent screen**:
   - User Type: External
   - Добавь тестовых пользователей (свой email) пока приложение не верифицировано Google

---

## Этап 4: Первое применение миграций Supabase

> Выполни после того как Claude реализует Task 5 (появится `supabase/config.toml`)

### 4.1 Войти в Supabase CLI
```bash
supabase login
# Откроется браузер, авторизуйся
```

### 4.2 Найти Project Reference
Supabase Dashboard → **Project Settings → General → Project Ref**
Выглядит как: `abcdefghijklmnopqr` (20 символов)

### 4.3 Привязать проект
```bash
supabase link --project-ref ТВОЙ_PROJECT_REF
# Введёт пароль от БД (тот что создал в Этапе 0.2)
```

### 4.4 Применить все миграции
```bash
supabase db push
```
Вывод покажет какие миграции применились. Проверь что все 14 файлов применились без ошибок.

### 4.5 Проверить в Dashboard
Supabase Dashboard → **Table Editor** — должны появиться таблицы:
`users`, `spheres`, `goals`, `quests`, `tasks`, `notes`, `embeddings` и другие.

---

## Этап 5: Деплой Edge Functions

> Выполни после Этапа 4

### 5.1 Установить секреты для nightly-planning
```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-твой-ключ \
  CRON_SECRET=твой-cron-secret \
  --project-ref ТВОЙ_PROJECT_REF
```

### 5.2 Установить секреты для embedding-worker
```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-твой-ключ \
  --project-ref ТВОЙ_PROJECT_REF
```

> `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет в Edge Functions автоматически — их задавать не нужно.

### 5.3 Задеплоить функции
```bash
supabase functions deploy nightly-planning --no-verify-jwt
supabase functions deploy embedding-worker --no-verify-jwt
```

### 5.4 Настроить расписание (pg_cron)
В Supabase Dashboard → **SQL Editor** выполни:
```sql
-- Включить расширение (если не включено)
create extension if not exists pg_cron;

-- Запускать nightly-planning каждый день в 00:00 UTC
select cron.schedule(
  'nightly-planning',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://ТВОЙ_PROJECT_REF.supabase.co/functions/v1/nightly-planning',
    headers := '{"Authorization": "Bearer ТВОЙ_CRON_SECRET"}'::jsonb
  )
  $$
);
```

---

## Этап 6: GitHub Actions Secrets

> Выполни после того как Claude реализует Tasks 6-7 (появятся `.github/workflows/*.yml`)

Открой: **GitHub → твой репозиторий → Settings → Secrets and variables → Actions → New repository secret**

### Получить Vercel токены

1. [vercel.com/account/tokens](https://vercel.com/account/tokens) → **Create Token** → скопируй как `VERCEL_TOKEN`
2. В терминале (после `vercel login`):
   ```bash
   vercel link
   # Выбери существующий проект
   cat .vercel/project.json
   # Увидишь: { "orgId": "...", "projectId": "..." }
   ```
3. `orgId` → GitHub Secret `VERCEL_ORG_ID`
4. `projectId` → GitHub Secret `VERCEL_PROJECT_ID`

> После `vercel link` файл `.vercel/project.json` создаётся локально. Он уже в `.gitignore` — в репозиторий не попадёт.

### Получить Supabase токен

1. [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token**
2. Скопируй как `SUPABASE_ACCESS_TOKEN`
3. `SUPABASE_PROJECT_REF` — тот же Project Ref из Этапа 4.2

### Добавить все секреты в GitHub

| Secret | Где взять |
|--------|-----------|
| `VERCEL_TOKEN` | Vercel Account → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |
| `SUPABASE_ACCESS_TOKEN` | Supabase Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Supabase → Project Settings → General |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

---

## Этап 7: Проверка после деплоя

После того как всё настроено и первый деплой прошёл успешно:

### 7.1 Health check
```bash
curl https://your-app.vercel.app/api/health
# Ожидаемый ответ:
# {"status":"ok","db":"ok","version":"0.1.0","timestamp":"..."}
```

### 7.2 Проверка PWA на мобильном
1. Открой `https://your-app.vercel.app` в Chrome на Android
2. Должен появиться баннер "Добавить на главный экран" или кнопка в меню браузера
3. На iOS (Safari): кнопка Share → "На экран «Домой»"

### 7.3 Тест offline режима
1. Открой приложение на мобильном
2. Включи режим самолёта
3. Обнови страницу — должна показаться страница `/offline` (а не ошибка браузера)

### 7.4 Ручной запуск nightly-planning (тест)
```bash
curl -X POST \
  https://ТВОЙ_PROJECT_REF.supabase.co/functions/v1/nightly-planning \
  -H "Authorization: Bearer ТВОЙ_CRON_SECRET"
# Ответ должен быть 200 OK
```

---

## Порядок выполнения (итого)

```
Этап 0  → Создай аккаунты Vercel + Supabase
          ↓
[Claude реализует Tasks 1-3]
          ↓
Этап 1  → Сгенерируй VAPID ключи и CRON_SECRET
Этап 2  → Добавь все переменные в Vercel Dashboard
Этап 3  → Настрой Google Cloud Console (если нужно)
          ↓
[Claude реализует Tasks 4-5]
          ↓
Этап 4  → Примени миграции через Supabase CLI
Этап 5  → Задеплой Edge Functions + настрой cron
          ↓
[Claude реализует Tasks 6-7]
          ↓
Этап 6  → Добавь GitHub Secrets для Actions
          ↓
[Claude реализует Tasks 8-9]
          ↓
Этап 7  → Проверь деплой (health check, PWA, offline)
```
