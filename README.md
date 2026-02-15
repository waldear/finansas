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
   - `supabase-spaces.sql`

`supabase-advanced.sql` también crea la base para suscripciones Pro:
- `user_entitlements`
- `assistant_usage_events`
- `billing_events`

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
- `GEMINI_MODEL` (default recomendado: `gemini-2.5-flash`)
- `ASSISTANT_FREE_MONTHLY_REQUEST_LIMIT` (default `40`)
- `ASSISTANT_PRO_MONTHLY_REQUEST_LIMIT` (default `1200`)
- `SUPABASE_SERVICE_ROLE_KEY` (necesaria para procesar billing events/webhooks)
- `BILLING_WEBHOOK_SECRET` (para `/api/billing/events`)
- `STRIPE_SECRET_KEY` (para checkout/portal/webhook real)
- `STRIPE_PRO_PRICE_ID` (Price ID de la suscripción Pro)
- `STRIPE_WEBHOOK_SECRET` (firma de webhook de Stripe)
- `STRIPE_PRO_TRIAL_DAYS` (opcional, trial en días para nuevos Pro)

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

## Pro / Billing (Base)

- `GET /api/billing/entitlement` devuelve plan y uso mensual del asistente para el usuario autenticado.
- `POST /api/billing/events` procesa webhooks de billing (App Store / Play / Stripe) con `x-billing-webhook-secret`.
- `POST /api/billing/checkout` crea una sesión Stripe Checkout para suscripción Pro.
- `POST /api/billing/portal` abre Stripe Billing Portal para gestionar/cancelar la suscripción.
- `POST /api/billing/stripe/webhook` procesa eventos reales de Stripe con verificación de firma (`stripe-signature` + `STRIPE_WEBHOOK_SECRET`).
- La ruta `/api/assistant` aplica límite mensual por plan usando:
  - `user_entitlements`
  - `assistant_usage_events`
  - `billing_events`

### Stripe setup rápido

1. Crear un Price recurrente en Stripe (mensual/anual según negocio).
2. Configurar variables:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRO_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`
3. Crear webhook en Stripe apuntando a:
   - `https://TU_DOMINIO/api/billing/stripe/webhook`
4. Suscribirse a eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

## Deploy en Vercel

- Branch de producción: `main`
- Si hay build stale, usar **Redeploy** con cache limpio
- Verificar en logs que el commit desplegado sea el esperado
