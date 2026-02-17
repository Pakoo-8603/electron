# Hikvision ISAPI Gateway (Electron + TypeScript)

Gateway ligero para sucursal/LAN que integra dispositivos Hikvision (acceso/facial) vía ISAPI, con cola local y sincronización resiliente a nube.

## ⚠️ Versiones de Node soportadas

Este proyecto soporta **Node 20.x o 22.x (LTS)**.

- ✅ Recomendado: `v22`
- ✅ También soportado: `v20`
- ❌ No soportado: `v23+` (incluye `v25`, que rompe instalación de toolchain nativo en varios entornos)

Si usas `nvm`:

```bash
nvm install 22
nvm use 22
```

## Arquitectura

- **Main process (Node/Electron):**
  - `DeviceManager`: orquestación de conexiones y salud por dispositivo.
  - `AlertStreamClient`: consumo incremental de `multipart/mixed` (`alertStream`).
  - `HttpListenerServer`: receptor `POST /hikvision/events`.
  - `OutboxSync`: envío batch con reintentos/backoff y compresión gzip.
  - `GatewayDatabase` (`sql.js`): persistencia local en archivo SQLite-compatible.
- **Renderer (React):** wizard, dispositivos, estado, accesos recientes, logs.
- **Shared:** tipos comunes.

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
/scripts
```

## Desarrollo

```bash
npm install
npm run dev
```

## Build / empaquetado

```bash
npm run build
npm run package
```

## Configuración de dispositivos

1. Wizard inicial: `tenantId`, `siteId`, `backendUrl`, `backendToken`, `listenerPort`.
2. Alta de dispositivo: host/ip, puerto, protocolo, usuario, password, modo.
3. Modo de eventos:
   - `alertStream` (pull): `GET /ISAPI/Event/notification/alertStream`
   - `httpPush` (push): POST al gateway `http://<gateway>:<port>/hikvision/events`
   - `polling` (fallback)

## Simulador local

```bash
npm run simulate
```

Levanta mock en `:9090` para:
- `GET /ISAPI/System/deviceInfo`
- `GET /ISAPI/Event/notification/alertStream`
- `POST /gateway/events/batch`

## Pruebas

```bash
npm test
```

## Troubleshooting

### `npm i` falla con `better-sqlite3` / `node-gyp` / `distutils`
Esta base ya **no usa dependencias nativas** para DB/credenciales, pero si vienes de un lockfile viejo:

```bash
rm -rf node_modules package-lock.json
npm cache verify
npm install
```

Asegúrate de estar en Node 20/22 LTS.


### Diagnóstico rápido de entorno

Ejecuta:

```bash
npm run doctor
```

Este comando valida:
- versión de Node
- variables de proxy activas
- conectividad al registry
- si tu red bloquea paquetes scopeados (ej. `@types/express`)

Si ves `403` en paquetes `@scope/name`, el problema es de red/proxy corporativo (no del código).

### `concurrently: command not found`
Ocurre cuando `npm install` no terminó. Corrige instalación y vuelve a correr `npm run dev`.

### 401/403 en Hikvision
Validar credenciales, puerto y protocolo HTTP/HTTPS.

### No llegan eventos push
Abrir `listenerPort` en firewall y confirmar ruta `/hikvision/events`.
