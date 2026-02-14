# Deploy en Vercel (Next.js)

Esta app es **Next.js (App Router)**. Vercel la detecta sola.

## 1) Crear el proyecto
1. Ir a https://vercel.com
2. "Add New..." -> "Project"
3. Importar el repo (GitHub) donde esta este proyecto

## 2) Variables de entorno (IMPORTANTE)
En Vercel -> Project -> Settings -> Environment Variables, definir:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://TU_PROYECTO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="TU_SUPABASE_ANON_KEY"
GEMINI_API_KEY="TU_GEMINI_API_KEY"
NEXT_PUBLIC_SITE_URL="https://TU_DOMINIO_EN_VERCEL"
```

Opcional (recomendado):

```bash
GEMINI_MODEL="gemini-2.5-flash"
ASSISTANT_FREE_MONTHLY_REQUEST_LIMIT="40"
ASSISTANT_PRO_MONTHLY_REQUEST_LIMIT="1200"
```

Nota: `GEMINI_API_KEY` debe ser server-only (no usar `NEXT_PUBLIC_`).

## 3) Deploy
1. Deploy
2. Esperar que finalice el build
3. Probar la app en la URL que entrega Vercel

## Seguridad
- No pegues keys reales en archivos del repo.
- Si una key se compartio por chat o quedo en Git, rotala y reemplazala en Vercel.
