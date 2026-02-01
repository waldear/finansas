# 🚀 Deploy en Vercel - Instrucciones

## Paso 1: Crear cuenta
1. Ir a https://vercel.com
2. Click "Sign Up"
3. Elegir "Continue with Email"
4. Completar datos y verificar email

## Paso 2: Crear proyecto
1. En el dashboard de Vercel, click "Add New..." → "Project"
2. Elegir la pestaña "Import Git Repository"
3. Como NO usamos Git, hacemos clic en "Upload" o arrastramos archivos

## Paso 3: Subir archivos
Subir TODA la carpeta `mi-control-financiero` (comprimida en zip o arrastrando)

## Paso 4: Configurar
- **Framework Preset**: Vite
- **Root Directory**: `app`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## Paso 5: Variables de entorno (IMPORTANTE)
Agregar estas 3 variables:

```
VITE_SUPABASE_URL=https://xtalkkbvyylwywzzafcc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_WR7AC0_eJkA-SpSC6ua8kA_RQytXduZ
VITE_GEMINI_API_KEY=AIzaSyAikwJNXtQNpcEBgz7-80T2ruY9hjQ_Ew4
```

## Paso 6: Deploy
Click en "Deploy" y esperar 2-3 minutos.

## Paso 7: Listo!
Vercel te dará una URL como:
`https://mi-control-financiero-xxx.vercel.app`

## Para acceder desde el celular
1. Abrir Chrome/Safari en el teléfono
2. Ir a la URL de Vercel
3. Agregar a pantalla de inicio para usar como app
