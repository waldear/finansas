# Finansas Pro 🚀

Plataforma financiera inteligente, segura y escalable. Construida con React, Tailwind, Vercel Serverless Functions y Google Gemini.

## Características Principales

- **Gestión de Gastos e Ingresos**: Interfaz optimizada mobile-first.
- **Análisis de Resúmenes PDF**: Procesamiento server-side de estados de cuenta bancarios (PDF -> Texto -> IA).
- **Asistente Financiero IA**: Chat inteligente con contexto real de tus finanzas.
- **Seguridad**: Arquitectura backend-for-frontend (BFF) para proteger API Keys.
- **Performance**: Code splitting y carga perezosa (Lazy Loading) para inicio instantáneo.

## Arquitectura Técnica

### Frontend
- **Framework**: React 19 + Vite.
- **UI**: Tailwind CSS + Shadcn UI + Lucide React.
- **Estado**: Hooks personalizados (`useFinance`).
- **Optimización**: `React.lazy` + `Suspense`.

### Backend (Serverless)
Ubicado en `/api`, ejecutándose como Vercel Functions (Node.js):
- `POST /api/analyze-pdf`: Extracción de texto de PDFs usando `pdf-parse`.
- `POST /api/gemini`: Proxy seguro para interacción con LLM (Gemini 1.5 Flash).

## Configuración Local

1. **Requisitos**: Node.js 18+ y Vercel CLI.
2. **Instalación**:
   ```bash
   npm install
   npm i -g vercel
   ```
3. **Variables de Entorno**:
   Crea un archivo `.env.local` en la raíz (o configura en Vercel):
   ```env
   GEMINI_API_KEY=tu_api_key_de_google_ai_studio
   # VITE_XXX keys ya no son necesarias para la IA
   ```
4. **Ejecutar**:
   Para probar la integración completa (Frontend + Backend):
   ```bash
   vercel dev
   ```
   Esto iniciará el servidor en `http://localhost:3000`.

## Despliegue

```bash
vercel deploy
```

## Estructura de Directorios

- `/api`: Funciones Serverless (Backend).
- `/src`: Código fuente Frontend.
  - `/sections`: Módulos de la aplicación (Lazy loaded).
  - `/services`: Lógica de negocio y llamadas a API.
