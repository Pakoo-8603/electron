# Electron Gateway para Hikvision (ISAPI)

Aplicación Electron + TypeScript para operar como gateway local en LAN con dispositivos Hikvision vía ISAPI.

## ¿Por qué `digest-fetch`?
Se eligió `digest-fetch` porque implementa **HTTP Digest Authentication** de forma sencilla sobre `fetch`, permitiendo reutilizar una capa común para `GET` y `POST` y mantener el código del cliente Hikvision pequeño y extensible.

## Características fase 1
- UI con gestión de múltiples dispositivos (agregar, seleccionar, eliminar) y configuración por dispositivo: host/IP, puerto, protocolo, usuario/password, TLS insecure, timeout, recordar password.
- Botones:
  - **Probar conexión**: `GET /ISAPI/System/deviceInfo`
  - **Listar usuarios**: `POST /ISAPI/AccessControl/UserInfo/Search?format=json`
  - **Detectar** (extra): prueba combinaciones `https:443`, `http:80`, `https:80`, `http:443`.
- Vista amigable de usuarios (tabla) con paginación básica (`searchResultPosition`, `maxResults`) y filtro `fuzzySearch`.
- Requests ejecutados desde **main process** usando IPC seguro (`contextIsolation: true`, `nodeIntegration: false`).
- Parseo XML → JSON con `fast-xml-parser` cuando `deviceInfo` no regresa JSON.
- Persistencia con `electron-store` (sin password por defecto).
- Password opcional en almacenamiento seguro con `keytar` (si no está disponible, fallback sin guardar password).

## Fase 2 (preparada y apagada)
Existe `SyncService` (feature flag `sync.enabled=false`) con `node-cron` para sincronización periódica (`deviceInfo` + usuarios) hacia un endpoint externo:

`POST https://mi-servidor.com/api/hikvision/sync`

## Estructura
- `src/main` (Electron main + cliente Hikvision + IPC + storage + sync)
- `src/preload`
- `src/renderer`
- `src/shared`

## Correr en desarrollo
```bash
npm i
npm run dev
```

## Build
```bash
npm run build
```

## Ejemplos esperados
### deviceInfo
Request:
```http
GET https://192.168.0.187/ISAPI/System/deviceInfo
```
Response típica (XML simplificado):
```xml
<DeviceInfo>
  <deviceName>DS-K1T</deviceName>
  <serialNumber>ABCD1234</serialNumber>
</DeviceInfo>
```

### UserInfo/Search
Request body:
```json
{
  "UserInfoSearchCond": {
    "searchID": "1",
    "searchResultPosition": 0,
    "maxResults": 30,
    "fuzzySearch": ""
  }
}
```

## Compatibilidad
Algunos equipos/firmwares Hikvision varían en endpoints de AccessControl/ACS. El cliente está encapsulado en `HikvisionClient` para extender fácilmente nuevos métodos GET/POST (por ejemplo eventos ACS).

## Referencia curl
```bash
curl -k --digest -u "admin:tu_password" \
  "https://192.168.0.187/ISAPI/System/deviceInfo"
```
