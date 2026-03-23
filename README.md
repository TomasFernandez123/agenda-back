# Agenda SaaS — Backend Multi-Tenant

Backend multi-tenant para gestión de turnos/citas, construido con **NestJS**, **MongoDB** (Mongoose) y **Redis** (BullMQ). Incluye autenticación JWT con cookies httpOnly, recordatorios por **WhatsApp** (Cloud API) y **email**, prevención de solapamiento con **transacciones MongoDB**, y un sistema de auditoría completo.

---

## 📋 Tabla de Contenidos

- [Arquitectura](#-arquitectura)
- [Stack Tecnológico](#-stack-tecnológico)
- [Requisitos](#-requisitos)
- [Instalación y Setup](#-instalación-y-setup)
- [Variables de Entorno](#-variables-de-entorno)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Módulos](#-módulos)
- [API Reference](#-api-reference)
- [Roles y Permisos](#-roles-y-permisos)
- [Multi-Tenancy](#-multi-tenancy)
- [Prevención de Solapamiento](#-prevención-de-solapamiento)
- [Recordatorios y Notificaciones](#-recordatorios-y-notificaciones)
- [WhatsApp Integration](#-whatsapp-integration)
- [Docker](#-docker)
- [Scripts Disponibles](#-scripts-disponibles)
- [Deploy en Producción](#-deploy-en-producción)

---

## 🏗 Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│   Frontend  │────▶│  NestJS API  │────▶│  MongoDB   │
│  (Angular)  │     │   (REST)     │     │ ReplicaSet │
└─────────────┘     └──────┬───────┘     └───────────┘
                           │
                    ┌──────┴───────┐
                    │    Redis     │
                    │  (BullMQ)    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ WhatsApp │ │  Email   │ │  Audit   │
        │ Cloud API│ │  Brevo   │ │  Logs    │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 🛠 Stack Tecnológico

| Categoría | Tecnología |
|-----------|-----------|
| Framework | NestJS 11 (TypeScript) |
| Base de datos | MongoDB + Mongoose (Replica Set para transacciones) |
| Caché / Colas | Redis + BullMQ |
| Autenticación | JWT (access + refresh tokens en httpOnly cookies) |
| Contraseñas | bcryptjs (12 salt rounds) |
| Validación | class-validator + class-transformer + Joi (env vars) |
| WhatsApp | Meta Cloud API v18.0 |
| Email | Brevo Transactional API (`@getbrevo/brevo`) |
| Seguridad | Helmet, CORS, ThrottlerModule (rate limiting) |
| Contenedores | Docker + Docker Compose |

---

## 📌 Requisitos

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** y **Docker Compose** (para desarrollo local)
- Cuenta de **Meta Business** (para WhatsApp, opcional)

---

## 🚀 Instalación y Setup

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd agenda-back
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.development .env.development
# Editar los valores según tu entorno
```

### 4. Levantar infraestructura con Docker

```bash
docker compose up -d
```

Esto levanta:
- **MongoDB Replica Set** (3 nodos: `mongo1:27017`, `mongo2:27018`, `mongo3:27019`) — necesario para transacciones
- **Redis** (`localhost:6379`) — para BullMQ

### 5. Crear el SuperAdmin

```bash
npm run seed
```

Crea un usuario `SUPER_ADMIN` con las credenciales definidas en las variables de entorno.

### 6. Iniciar el servidor de desarrollo

```bash
npm run start:dev
```

El servidor estará disponible en `http://localhost:3000`.

---

## 🔐 Variables de Entorno

| Variable | Descripción | Default (dev) |
|----------|-------------|---------------|
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno (`development` / `production`) | `development` |
| `CORS_ORIGIN` | Origen permitido para CORS | `http://localhost:4200` |
| `FRONTEND_BASE_URL` | Base URL del frontend (para links de reset) | `http://localhost:4200` |
| `MONGODB_URI` | URI de conexión a MongoDB | `mongodb://localhost:27017/agenda-saas?replicaSet=rs0` |
| `REDIS_HOST` | Host de Redis | `localhost` |
| `REDIS_PORT` | Puerto de Redis | `6379` |
| `REDIS_USERNAME` | Usuario Redis (opcional, según proveedor) | _(vacío)_ |
| `REDIS_PASSWORD` | Password Redis (opcional, requerido en Redis gestionado) | _(vacío)_ |
| `REDIS_TLS` | Habilita TLS para Redis (`true/false`) | `false` |
| `JWT_SECRET` | Secreto para access tokens | `dev-jwt-secret` |
| `JWT_REFRESH_SECRET` | Secreto para refresh tokens | `dev-jwt-refresh-secret` |
| `JWT_RESET_SECRET` | Secreto para reset password token (opcional) | `JWT_SECRET` |
| `JWT_EXPIRATION` | Expiración del access token | `15m` |
| `JWT_REFRESH_EXPIRATION` | Expiración del refresh token | `7d` |
| `BREVO_API_KEY` | API Key V3 para correos transaccionales | _(requerido)_ |
| `PASSWORD_RESET_EXPIRATION_SECONDS` | Vida útil del token de reset (900-3600 seg) | `1800` |
| `SUPERADMIN_EMAIL` | Email del superadmin inicial | `admin@agenda-saas.com` |
| `SUPERADMIN_PASSWORD` | Password del superadmin inicial | `SuperAdmin123!` |

> ⚠️ **En producción**, asegurate de cambiar TODOS los secretos y passwords.

---

## 📁 Estructura del Proyecto

```
src/
├── config/
│   ├── configuration.ts        # Factory de configuración centralizada
│   ├── validation.ts           # Schema Joi para env vars
│   └── index.ts
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts      # @Roles(Role.ADMIN)
│   │   ├── current-user.decorator.ts # @CurrentUser()
│   │   └── public.decorator.ts     # @Public()
│   ├── guards/
│   │   ├── jwt-auth.guard.ts       # Autenticación global
│   │   ├── roles.guard.ts          # Control de roles
│   │   └── tenant.guard.ts         # Aislamiento de tenant
│   ├── filters/
│   │   └── all-exceptions.filter.ts # Manejo global de errores
│   ├── pipes/
│   │   └── parse-objectid.pipe.ts  # Validación de ObjectId
│   └── utils/
│       └── timezone.util.ts        # UTC ↔ timezone de tenant
├── modules/
│   ├── auth/           # Autenticación JWT
│   ├── tenants/        # Gestión de tenants
│   ├── users/          # CRUD de usuarios
│   ├── professionals/  # Profesionales / staff
│   ├── services/       # Servicios ofrecidos
│   ├── availability/   # Disponibilidad horaria
│   ├── appointments/   # Turnos (módulo crítico)
│   ├── notifications/  # Recordatorios (BullMQ)
│   ├── whatsapp/       # Integración WhatsApp
│   ├── audit/          # Log de auditoría
│   └── health/         # Health check
├── seeds/
│   └── seed.ts         # Script de seed para SuperAdmin
├── app.module.ts       # Módulo raíz
└── main.ts             # Bootstrap
```

---

## 📦 Módulos

### Auth (`/auth`)
- Login con JWT en cookies httpOnly (access + refresh)
- Refresh de tokens
- Action tokens firmados para confirmación/cancelación pública

### Tenants (`/tenants`)
- CRUD de tenants (solo `SUPER_ADMIN`)
- Configuración de WhatsApp y email por tenant
- Offsets de recordatorios configurables

### Users (`/users`)
- CRUD de usuarios (scoped por tenant)
- Gestión de contraseñas con bcrypt
- Roles: `SUPER_ADMIN`, `ADMIN`, `STAFF`, `CLIENT`

### Professionals (`/professionals`)
- Vinculación de staff como profesionales
- Reglas de cancelación/reprogramación (minutos mínimos)
- Configuración de depósito

### Services (`/services`)
- Catálogo de servicios con duración y precio
- Configuración de depósito opcional

### Availability (`/professionals/:id/availability`)
- Reglas semanales (lunes a domingo, rangos horarios)
- Excepciones por fecha (bloqueos, horarios extra)
- Validación de slots disponibles

### Appointments (`/appointments`)
- **Prevención de solapamiento con transacciones MongoDB**
- Ciclo de vida completo: PENDING → CONFIRMED → CANCELLED / NO_SHOW / RESCHEDULED
- Endpoints públicos con tokens firmados (confirmación/cancelación sin login)
- Validación de reglas de negocio (minutos mínimos para cancelar/reprogramar)

### Notifications
- Scheduling de recordatorios con BullMQ + Redis
- Envío por WhatsApp y/o email según config del tenant
- Reintentos automáticos (3 intentos, backoff exponencial)
- Tracking de estado de cada trabajo

### WhatsApp (`/webhooks/whatsapp/:tenantId`)
- Envío de mensajes de texto vía Cloud API v18.0
- Mensajes interactivos con botones
- Webhook de verificación (GET) e inbound (POST)
- Parsing de comandos: CONFIRMAR, CANCELAR, REPROGRAMAR

### Audit
- Log de eventos críticos (creación, confirmación, cancelación, etc.)
- Búsqueda por tenant y por entidad

### Health (`/health`)
- Estado de la aplicación y conectividad a base de datos

---

## 📡 API Reference

### Auth

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | 🔓 Público | Login, setea cookies |
| `POST` | `/auth/forgot-password` | 🔓 Público | Solicita link de recuperación (respuesta genérica) |
| `POST` | `/auth/reset-password` | 🔓 Público | Resetea contraseña usando token |
| `POST` | `/auth/logout` | 🔒 JWT | Logout, limpia cookies |
| `GET` | `/auth/me` | 🔒 JWT | Datos del usuario actual |
| `POST` | `/auth/refresh` | 🔓 Público (cookie refresh) | Renueva access token |

#### `POST /auth/login`

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "admin@agenda-saas.com",
    "password": "SuperAdmin123!"
  }'
```

**Respuesta:**

```json
{
  "message": "Login successful",
  "user": {
    "sub": "60f7b2...",
    "email": "admin@agenda-saas.com",
    "role": "SUPER_ADMIN",
    "name": "Super Admin"
  }
}
```

#### `POST /auth/forgot-password`

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "tenantSlug": "clinica-nova",
    "email": "usuario@clinica.com"
  }'
```

**Respuesta (siempre genérica):**

```json
{
  "message": "Si el email existe, te enviamos un link."
}
```

#### `POST /auth/reset-password`

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOi...",
    "newPassword": "Nueva123!"
  }'
```

**Respuesta:**

```json
{
  "message": "Password updated successfully"
}
```

---

### Tenants (solo `SUPER_ADMIN`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/tenants` | Crear tenant |
| `GET` | `/tenants` | Listar todos |
| `GET` | `/tenants/:id` | Obtener por ID |
| `PATCH` | `/tenants/:id` | Actualizar tenant |

#### `POST /tenants`

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Clínica Salud",
    "slug": "clinica-salud",
    "timezone": "America/Argentina/Buenos_Aires",
    "whatsappConfig": {
      "wabaId": "123456789",
      "phoneNumberId": "987654321",
      "accessToken": "EAAxxxxxxx",
      "verifyToken": "mi-verify-token"
    },
    "emailConfig": {
      "from": "Clínica Salud <contacto@clinica.com>"
    },
    "reminderOffsets": [
      { "offsetMinutes": 1440, "channels": ["whatsapp", "email"] },
      { "offsetMinutes": 120, "channels": ["whatsapp"] }
    ]
  }'
```

> 📧 Envío centralizado: el envío técnico usa `notificaciones@syncrolab.tech` (dominio autenticado) y el nombre visible del remitente toma `tenant.name`. Si `emailConfig.from` está presente, se usa como `reply-to`.

---

### Users (`SUPER_ADMIN` o `ADMIN`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/users` | Crear usuario |
| `GET` | `/users` | Listar usuarios del tenant |
| `GET` | `/users/:id` | Obtener por ID |
| `PATCH` | `/users/:id` | Actualizar usuario |
| `PATCH` | `/users/:id/password` | Cambiar contraseña |

#### `POST /users`

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "role": "STAFF",
    "email": "dr.garcia@clinica.com",
    "password": "Staff123!",
    "name": "Dr. García",
    "phone": "+5491155551234"
  }'
```

---

### Professionals (`ADMIN` o `SUPER_ADMIN`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/professionals` | Crear profesional |
| `GET` | `/professionals` | Listar profesionales del tenant |
| `GET` | `/professionals/:id` | Obtener por ID |
| `PATCH` | `/professionals/:id` | Actualizar |

#### `POST /professionals`

```bash
curl -X POST http://localhost:3000/professionals \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": "60f7b2...",
    "displayName": "Dr. García",
    "minCancelMinutes": 120,
    "minRescheduleMinutes": 120
  }'
```

---

### Services (`ADMIN` o `SUPER_ADMIN`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/services` | Crear servicio |
| `GET` | `/services` | Listar servicios activos |
| `GET` | `/services/:id` | Obtener por ID |
| `PATCH` | `/services/:id` | Actualizar |

#### `POST /services`

```bash
curl -X POST http://localhost:3000/services \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Consulta General",
    "durationMinutes": 30,
    "price": 5000,
    "depositEnabled": true,
    "depositAmount": 1000,
    "depositRequired": true
  }'
```

---

### Availability

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/professionals/:id/availability` | Ver disponibilidad |
| `PUT` | `/professionals/:id/availability` | Configurar disponibilidad |

#### `PUT /professionals/:id/availability`

```bash
curl -X PUT http://localhost:3000/professionals/60f7b2.../availability \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "weeklyRules": [
      { "day": 1, "ranges": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "18:00"}] },
      { "day": 2, "ranges": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "18:00"}] },
      { "day": 3, "ranges": [{"start": "09:00", "end": "13:00"}] },
      { "day": 4, "ranges": [{"start": "09:00", "end": "13:00"}, {"start": "14:00", "end": "18:00"}] },
      { "day": 5, "ranges": [{"start": "09:00", "end": "13:00"}] }
    ],
    "exceptions": [
      { "date": "2026-03-15", "type": "blocked", "ranges": [] },
      { "date": "2026-03-22", "type": "extra", "ranges": [{"start": "10:00", "end": "14:00"}] }
    ]
  }'
```

> **Nota:** `day` usa formato JavaScript: 0 = Domingo, 1 = Lunes, ..., 6 = Sábado.

---

### Appointments (módulo crítico)

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/appointments` | 🔒 JWT | Crear turno |
| `GET` | `/appointments` | 🔒 JWT | Listar con filtros |
| `GET` | `/appointments/:id` | 🔒 JWT | Obtener detalle |
| `PATCH` | `/appointments/:id` | 🔒 ADMIN/STAFF | Actualizar notas |
| `POST` | `/appointments/:id/confirm` | 🔒 JWT | Confirmar turno |
| `POST` | `/appointments/:id/cancel` | 🔒 JWT | Cancelar turno |
| `POST` | `/appointments/:id/reschedule` | 🔒 JWT | Reprogramar |
| `POST` | `/appointments/:id/mark-no-show` | 🔒 ADMIN/STAFF | Marcar ausencia |
| `GET` | `/public/appointments/:id/confirm?token=xxx` | 🔓 Público | Confirmar via link |
| `GET` | `/public/appointments/:id/cancel?token=xxx` | 🔓 Público | Cancelar via link |

#### `POST /appointments`

```bash
curl -X POST http://localhost:3000/appointments \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "professionalId": "60f7b2...",
    "serviceId": "60f7b3...",
    "clientId": "60f7b4...",
    "startAt": "2026-03-10T10:00:00.000Z",
    "notesInternal": "Primera consulta"
  }'
```

#### Filtros en `GET /appointments`

```bash
# Por profesional y rango de fechas
curl "http://localhost:3000/appointments?professionalId=60f7b2...&from=2026-03-01&to=2026-03-31&status=CONFIRMED" \
  -b cookies.txt
```

---

### WhatsApp Webhooks

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/webhooks/whatsapp/:tenantId` | 🔓 Público | Verificación de webhook |
| `POST` | `/webhooks/whatsapp/:tenantId` | 🔓 Público | Mensajes entrantes |

---

### Health

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/health` | 🔓 Público | Estado de la app y BD |

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-02-10T22:40:00.000Z",
  "database": "connected"
}
```

---

## 👥 Roles y Permisos

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `SUPER_ADMIN` | Administrador global | Todo. Gestión de tenants, sin restricción de tenant |
| `ADMIN` | Administrador de tenant | CRUD de usuarios, profesionales, servicios, turnos en su tenant |
| `STAFF` | Profesional / empleado | Ver turnos propios, gestionar disponibilidad, confirmar/cancelar |
| `CLIENT` | Cliente | Crear turnos, ver sus turnos, confirmar/cancelar |

---

## 🏢 Multi-Tenancy

- Cada recurso está asociado a un `tenantId`.
- El `TenantGuard` global inyecta `request.tenantId` automáticamente.
- `SUPER_ADMIN` no está asociado a un tenant y puede gestionar todos.
- Los emails son únicos **dentro** de cada tenant (no globalmente).
- No hay registro público. Solo `SUPER_ADMIN` crea tenants y `ADMIN` crea usuarios.

---

## 🔒 Prevención de Solapamiento

La creación y reprogramación de turnos usan **transacciones MongoDB** para garantizar atomicidad:

```
1. Validar que el servicio existe → obtener duración
2. Calcular endAt = startAt + duración
3. Verificar disponibilidad del profesional (weekly rules + exceptions)
4. DENTRO DE TRANSACCIÓN:
   a. Buscar turnos existentes que se solapen (startAt < endAt && endAt > startAt)
   b. Si hay solapamiento → ConflictException (409)
   c. Si no → crear el turno
5. Log de auditoría
```

> ⚠️ Esto requiere MongoDB en **Replica Set** (configurado en `docker-compose.yml`).

---

## 🔔 Recordatorios y Notificaciones

El sistema de recordatorios está basado en **BullMQ + Redis**:

1. Al crear un turno, se crean `ReminderJob` según los `reminderOffsets` del tenant
2. Cada job se agrega a la cola con un `delay` calculado
3. El `ReminderProcessor` envía por WhatsApp o email cuando se ejecuta
4. Con reintentos automáticos (3 intentos, backoff exponencial de 60s)
5. Cada job trackea su estado: `pending` → `sent` | `failed` | `cancelled`

**Ejemplo de offsets por defecto:**
- 24 horas antes → WhatsApp
- 2 horas antes → WhatsApp

---

## 💬 WhatsApp Integration

### Configuración por Tenant

Cada tenant tiene su propia configuración de WhatsApp (WABA, Phone Number ID, Access Token).

### Webhook URL

Configurar en Meta Business:

```
GET/POST: https://tu-dominio.com/webhooks/whatsapp/{tenantId}
```

### Comandos soportados (inbound)

| Mensaje | Acción |
|---------|--------|
| `CONFIRMAR` | Confirma el turno pendiente |
| `CANCELAR` | Cancela el turno |
| `REPROGRAMAR` | Solicita reprogramación |

---

## 🐳 Docker

### Desarrollo local

```bash
# Levantar MongoDB + Redis
docker compose up -d

# Ver logs
docker compose logs -f

# Detener
docker compose down

# Detener y borrar volúmenes
docker compose down -v
```

### Producción

```bash
# Build y run con Docker
docker compose --profile app up -d --build
```

El `Dockerfile` usa **multi-stage build** para optimizar la imagen:
1. **Builder**: instala deps y compila TypeScript
2. **Production**: solo `node_modules` de producción + `dist/`

---

## 📜 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | Inicia en modo watch (desarrollo) |
| `npm run start:debug` | Inicia con debugger |
| `npm run start:prod` | Inicia en producción (`dist/main`) |
| `npm run build` | Compila TypeScript |
| `npm run seed` | Crea usuario SUPER_ADMIN |
| `npm run lint` | Ejecuta ESLint |
| `npm run format` | Formatea con Prettier |
| `npm test` | Ejecuta tests unitarios |
| `npm run test:e2e` | Ejecuta tests E2E |
| `npm run test:cov` | Tests con coverage |

---

## 🚀 Deploy en Producción

### Render

1. Crear un **Web Service** con Docker
2. Configurar variables de entorno (ver tabla arriba)
3. Usar un servicio externo de **MongoDB Atlas** (con Replica Set)
4. Usar un servicio externo de **Redis** (Upstash, Redis Cloud, etc.)
5. Configurar el health check: `GET /health`

### Variables críticas para producción

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/agenda-saas?retryWrites=true&w=majority
REDIS_HOST=tu-redis-host.com
REDIS_PORT=6379
JWT_SECRET=<secreto-largo-y-seguro>
JWT_REFRESH_SECRET=<otro-secreto-largo-y-seguro>
CORS_ORIGIN=https://tu-frontend.com
SUPERADMIN_EMAIL=admin@tudominio.com
SUPERADMIN_PASSWORD=<password-seguro>
```

---
