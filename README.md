# Hikvision ISAPI Gateway (Electron + TypeScript)

Gateway ligero de sucursal/LAN para dispositivos Hikvision (acceso/facial), con cola local SQLite y sincronización robusta a nube.

## Arquitectura

- **Main process (Node/Electron):**
  - `DeviceManager`: orquestación de conexiones por dispositivo y health.
  - `AlertStreamClient`: consumo incremental de `multipart/mixed` (modo A pull).
  - `HttpListenerServer`: receptor `POST /hikvision/events` (modo B push).
  - `OutboxSync`: envío batch de eventos a nube con reintentos/backoff.
  - `GatewayDatabase`: persistencia en SQLite (WAL): `devices`, `events`, `outbox`.
- **Renderer (React):** wizard, dispositivos, estado, accesos recientes, logs.
- **Shared:** tipos y contratos comunes.

## Estructura

```
/src/main
  /bootstrap
  /connectors
  /db
  /ipc
  /mock
  /services
/src/renderer
/src/shared
/tests
```

## Requisitos

- Node 18+
- npm 9+
- Windows recomendado (cross-platform compatible)

## Desarrollo

```bash
npm install
npm run dev
```

## Build y empaquetado

```bash
npm run build
npm run package
```

## Configuración de dispositivos

### Paso 1: Wizard inicial
- `tenantId`, `siteId`
- `backendUrl` (HTTPS)
- `backendToken`
- `listenerPort` (para modo B push)

### Paso 2: Dispositivos
- Campos: `ip/host`, `port`, `http/https`, `username`, `password`, `eventMode`
- `eventMode`:
  - `auto` / `alertStream`: usa `GET /ISAPI/Event/notification/alertStream`
  - `httpPush`: configurar dispositivo para enviar POST a `http://<gateway>:<port>/hikvision/events`
  - `polling`: fallback por consulta periódica

### Paso 3: Prueba de conectividad
- `GET /ISAPI/System/deviceInfo` para validar credenciales.

## Modos de evento

### Modo A (pull)
- Conexión persistente a `alertStream`
- Parseo incremental por boundary
- Reconexión automática con backoff + jitter
- Timeout de heartbeat

### Modo B (push)
- Listener HTTP local (`/hikvision/events`)
- Acepta payload XML/JSON como texto
- Puede ampliarse para multipart con imagen adjunta

### Fallback polling
- Consulta periódica de eventos
- Dedupe por `event_id` y ventana temporal

## Seguridad

- Credenciales Hikvision almacenadas en keychain (`keytar`)
- Password nunca en logs
- Backend esperado sobre HTTPS
- Extensible con pinning TLS en cliente HTTP

## Outbox y resiliencia

- SQLite WAL para robustez
- Outbox con estados `pending/sent/failed`
- Reintentos exponenciales con `next_retry_at`
- Batch + compresión gzip al backend

## Simulador local

Levanta un mock de Hikvision + backend en puerto 9090.

```bash
npm run simulate
```

Endpoints mock:
- `GET /ISAPI/System/deviceInfo`
- `GET /ISAPI/Event/notification/alertStream`
- `POST /gateway/events/batch`

## Pruebas

```bash
npm test
```

Incluye unit tests de normalización + dedupe.

## Troubleshooting

- **401/403 en ISAPI:** revisar usuario/clave y modo de auth Digest/Basic.
- **Sin eventos en push:** abrir puerto `listenerPort` en firewall local.
- **No conecta por HTTPS interno:** validar certificados del dispositivo; para pruebas usar HTTP LAN aislada.
- **Outbox crece y no baja:** revisar reachability al backend y token Bearer.

## Operación en background

- Soporta ejecución minimizada con tray.
- Auto-arranque al login: usar opciones de startup del SO/Electron.
- Inicio sin login (Windows): recomendado configurar `Task Scheduler` con permisos de servicio.
