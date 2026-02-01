# 💰 Mi Control Financiero

Aplicación de gestión financiera personal con análisis de PDF de tarjetas, asistente AI, metas de ahorro y sincronización en la nube.

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-blue)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)

## ✨ Características

### 📊 Dashboard Financiero
- Resumen de ingresos, gastos y balance
- Tasa de ahorro con indicadores visuales
- Ratio de deuda/ingreso con alertas
- Gráficos de torta por categorías

### 💳 Gestión de Deudas
- Seguimiento de tarjetas de crédito
- Cálculo de cuotas y vencimientos
- Progreso de pago visual
- Alertas de próximos vencimientos

### 🎯 Metas de Ahorro
- Crear múltiples objetivos (vacaciones, casa, emergencia, etc.)
- Seguimiento de progreso con barras visuales
- Aportes directos desde balance disponible
- Reembolso automático al eliminar meta

### 📄 Análisis de PDF
- Extracción automática de datos de resúmenes
- Detección de montos y vencimientos
- Soporte para múltiples tarjetas
- Edición manual de datos detectados

### 🤖 Asistente Virtual con Gemini AI (Opcional)
- Chat inteligente sobre tus finanzas (con API key de Gemini)
- Predicciones de gastos
- Recordatorios de vencimientos
- Consejos personalizados
- Modo local disponible sin configuración

### 📤 Exportación de Datos
- **JSON**: Backup completo
- **CSV**: Compatible con Excel
- **Excel**: Múltiples hojas con resumen
- Filtros por fecha incluidos

### 🏷️ Categorías Personalizables
- Crear tus propias categorías
- 21 iconos disponibles
- 16 colores para elegir
- Vista previa en tiempo real

### ☁️ Sincronización en la Nube (Supabase)
- Datos sincronizados automáticamente
- Acceso multi-dispositivo
- Autenticación segura
- Backup automático en la nube

### 🎨 Personalización
- Modo claro/oscuro/sistema
- Interfaz responsive (mobile/desktop)
- Notificaciones toast
- Animaciones suaves

## 🚀 Tecnologías

- **Frontend**: React 19 + TypeScript + Vite
- **Estilos**: Tailwind CSS + shadcn/ui
- **Gráficos**: Recharts
- **AI**: Google Gemini API
- **Auth & Database**: Supabase
- **PDF**: pdf-parse
- **Excel**: xlsx

## 📦 Instalación

```bash
# Clonar o extraer el proyecto
cd app

# Instalar dependencias
npm install

# El archivo .env.local ya está configurado con Supabase

# Iniciar servidor de desarrollo
npm run dev
```

## ⚙️ Configuración de Supabase

Las credenciales ya están configuradas en `.env.local`:

```env
VITE_SUPABASE_URL=https://xtalkkbvyylwywzzafcc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_WR7AC0_eJkA-SpSC6ua8kA_RQytXduZ
```

### Configurar Gemini AI (Opcional)

Para usar el asistente con inteligencia artificial real:

1. Obtener API key gratuita en: https://aistudio.google.com/app/apikey
2. Agregar al archivo `.env.local`:

```env
VITE_GEMINI_API_KEY=tu-api-key-aqui
```

3. Reiniciar la aplicación

**Nota**: Si no configurás Gemini, el asistente funciona en "modo local" con respuestas pre-programadas basadas en reglas.

### Crear tablas en Supabase

1. Ir a https://supabase.com/dashboard/project/xtalkkbvyylwywzzafcc/sql-editor
2. Abrir el archivo `supabase-schema.sql` o copiar su contenido
3. Pegar en el SQL Editor y ejecutar

Las tablas creadas serán:
- `transactions` - Transacciones de ingresos/gastos
- `debts` - Deudas y cuotas
- `custom_categories` - Categorías personalizadas
- `savings_goals` - Metas de ahorro

## 🛠️ Scripts

```bash
npm run dev      # Desarrollo
npm run build    # Build de producción
npm run preview  # Previsualizar build
npm run lint     # Linting
```

## 📱 Uso

### Primera vez
1. Crear cuenta o iniciar sesión
2. Los datos se cargan automáticamente desde la nube (si existen)
3. O se cargan datos de ejemplo para empezar
4. La sincronización es automática cada 2 segundos después de cambios

### Agregar transacciones
- Pestaña "Transacciones" → Formulario rápido
- Seleccionar categorías predeterminadas o personalizadas

### Crear categorías personalizadas
- Pestaña "Categorías" → Nueva Categoría
- Elegir nombre, tipo, color e ícono
- Usar en transacciones inmediatamente

### Gestionar metas de ahorro
- Pestaña "Metas" → Nueva Meta
- Definir monto objetivo y fecha límite (opcional)
- Hacer aportes desde el balance disponible

### Analizar PDF de tarjetas
- Ir a "Analizar PDF"
- Subir resumen de tarjeta
- Revisar datos detectados
- Editar si es necesario
- Cargar a la cuenta

### Sincronización
- Los datos se sincronizan automáticamente
- Icono de nube en el header muestra el estado:
  - ☁️ Verde = Sincronizado
  - ☁️ Amarillo = Sin sincronizar
  - 🔄 Girando = Sincronizando...
- Click en el icono para sincronización manual

## 🔒 Seguridad

- Autenticación JWT con Supabase
- Row Level Security (RLS) en todas las tablas
- Usuarios solo pueden ver/modificar sus propios datos
- Encriptación en tránsito y en reposo
- Sin almacenamiento de contraseñas en cliente

## 📝 Mejoras Implementadas

### Opción A ✅
- [x] Exportar datos a JSON/Excel/CSV
- [x] Filtros por fecha en transacciones
- [x] Editar transacciones inline
- [x] Toggle modo oscuro/claro
- [x] Gráficos con datos reales

### Opción B ✅
- [x] Autenticación con Supabase
- [x] Login/Registro/Recuperación
- [x] Sincronización en la nube
- [x] Categorías personalizables
- [x] Metas de ahorro
- [x] Asistente IA con Gemini (opcional)

### Opción C (Próximas)
- [ ] Multi-cuenta (efectivo/banco/inversiones)
- [ ] Reportes PDF automáticos
- [ ] Importación CSV/Excel
- [ ] PWA con notificaciones push

## 🤝 Contribuir

1. Fork del proyecto
2. Crear rama: `git checkout -b feature/nueva`
3. Commit: `git commit -m 'Agrega feature'`
4. Push: `git push origin feature/nueva`
5. Abrir Pull Request

## 📄 Licencia

MIT License - Libre para usar y modificar.

---

Hecho con ❤️ para gestionar finanzas personales de forma inteligente.
