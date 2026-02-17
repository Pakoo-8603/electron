# Hikvision ISAPI Gateway (Electron + TypeScript)

Gateway ligero para sucursales/LAN que recibe eventos Hikvision y los sincroniza a nube con tolerancia a desconexión.

## Arquitectura

- `src/main`: núcleo gateway y conectividad Hikvision.
  - `gateway/device-manager.ts`: orquestación por dispositivo, modo `alertStream/httpPush/polling`.
  - `gateway/alert-stream-client.ts`: lectura incremental de `multipart/mixed` en `/ISAPI/Event/notification/alertStream`.
  - `gateway/http-listener-server.ts`: servidor Fastify `POST /hikvision/events/:deviceId` para modo push.
  - `gateway/outbox-sync.ts`: batching + reintentos a backend central.
  - `db/database.ts`: SQLite (WAL) con tablas `devices`, `events`, `outbox`.
- `src/shared`: tipos y normalización/dedupe.
- `src/renderer`: UI React (wizard, dispositivos, estado, accesos, logs).

## Requisitos

- Node 22+ (objetivo Node moderno para Electron)
- npm
- Windows recomendado (también Linux/macOS)

## Desarrollo

```bash
npm install
npm run dev
```

Esto levanta:
- Vite renderer en `localhost:5173`
- compilación TS del main en watch
- Electron apuntando al dev server

## Build / empaquetado

```bash
npm run build
```

Para empaquetado final, integrar `electron-builder` (pendiente en esta iteración de esqueleto).

## Configuración de dispositivos Hikvision

### Modo A: `alertStream` (recomendado)
1. En UI → Dispositivos, crear equipo (`ip`, `puerto`, `http/https`, `usuario`, `password`, modo `alertStream` o `auto`).
2. Ejecutar "probar conexión" (usa `/ISAPI/System/deviceInfo`).
3. El cliente mantiene GET persistente a `/ISAPI/Event/notification/alertStream` y reconecta con backoff + jitter.

### Modo B: `httpPush`
1. Configurar `listenerPort` (default `9876`).
2. Endpoint del gateway: `http://<gateway-ip>:9876/hikvision/events/<deviceId>`.
3. Si el modelo soporta `httpHosts`, puede automatizarse por ISAPI en siguiente iteración.

### Fallback `polling`
- Se consulta periódicamente endpoint de eventos (`/ISAPI/AccessControl/AcsEvent?format=json`), con dedupe por hash+ventana temporal.

## Operación resiliente

- SQLite WAL para durabilidad local.
- Outbox `pending/sent/failed` con `next_retry_at` y backoff exponencial.
- Sin Internet: los eventos quedan en outbox; al volver conectividad se sincronizan.

## Seguridad

- Password Hikvision se guarda en keychain (keytar / DPAPI en Windows).
- Nunca loguear password.
- Nube siempre por HTTPS (opción pinning TLS configurable en próximos pasos).

## Métricas / observabilidad

- Logs en `userData/logs/gateway.log`.
- Estado UI: conectividad por dispositivo, cola local, latencia nube.

## Pruebas

```bash
npm test
```

Incluye tests unitarios de normalización/dedupe.

## Simulador de eventos

```bash
npm run simulate:events -- http://localhost:9876/hikvision/events/mock-device
```

Genera eventos mock cada segundo para validar pipeline completo sin hardware físico.

## Troubleshooting

- **401 Unauthorized**: verificar usuario/password y que el equipo permita Digest/Basic.
- **No llegan eventos en stream**: revisar firewall LAN y timeout heartbeat.
- **Push no entra**: abrir puerto `listenerPort` en firewall local.
- **SQLite locked**: validar permisos de escritura en `userData`.

## Semáforo de salud (UI)

- **Verde**: dispositivos conectados y cola local bajo control.
- **Naranja**: estado de advertencia (p. ej. sin dispositivos aún, o alguno desconectado/reintentando).
- **Rojo**: cola local elevada, suele indicar problema sostenido de salida/sincronización.

## Consumo local desde dispositivo (sin backend)

Se agregó una pantalla **Datos del dispositivo** para priorizar operación local:
- Consultar usuarios/empleados del equipo por ISAPI (`/ISAPI/AccessControl/UserInfo/Search?format=json`).
- Consultar accesos del equipo por ISAPI (`/ISAPI/AccessControl/AcsEvent?format=json`).

Esto permite validar extracción de datos directamente del dispositivo antes de cerrar la integración con nube.
