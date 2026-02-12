# Finansas (FinFlow)

App web de control financiero personal con Next.js, Supabase y asistente IA para analizar resúmenes/documentos.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase (Auth, Postgres, Storage, RLS)
- TanStack Query
- Gemini (`@google/generative-ai`)
- Tailwind + shadcn/ui

## Funcionalidades principales

- Login seguro (email/password, magic link y Google OAuth)
- Ingresos y gastos con historial
- Deudas y metas de ahorro
- Copilot financiero con análisis de PDF/imagen
- Presupuestos mensuales con alertas por uso
- Reglas recurrentes (semanal/quincenal/mensual)
- Auditoría de eventos (`audit_events`)
- Exportación de historial en CSV/PDF

## Requisitos

- Node.js 20+
- Proyecto Supabase
- API key de Gemini (Google AI Studio)

## Configuración rápida

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env.local` usando `.env.local.example`.

3. Ejecutar migraciones SQL en Supabase (SQL Editor), en este orden:
   - `supabase-schema.sql`
   - `supabase-copilot.sql`
   - `supabase-advanced.sql`

4. Levantar en local:

```bash
npm run dev
```

## Variables de entorno

Definir en `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SITE_URL` (ej: `http://localhost:3000`)

Opcionales:

- `SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE`

## Scripts

- `npm run dev` → desarrollo
- `npm run build` → build producción
- `npm run start` → correr build
- `npm run lint` → lint
- `npm test -- --run` → tests unitarios (Vitest)
- `npm run test:e2e` → flujos E2E (Playwright)

## Flujo de documentos (Copilot)

- `POST /api/documents/process` crea job asíncrono en `document_jobs`.
- Si falta bucket/cola, usa fallback síncrono para no bloquear al usuario.
- Estado de job:
  - `GET /api/documents/jobs/[id]`
  - `POST /api/documents/jobs/[id]/run`

## Health check

- `GET /api/system/health` valida:
  - env críticas
  - tablas clave
  - bucket `documents`

## Deploy en Vercel

- Branch de producción: `main`
- Si hay build stale, usar **Redeploy** con cache limpio
- Verificar en logs que el commit desplegado sea el esperado
