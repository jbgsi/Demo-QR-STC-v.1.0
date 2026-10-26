# API HTTP

Las rutas usan el mismo origen que el frontend. Salvo el contenido binario de documentos, las respuestas son JSON. Las mutaciones sin archivos usan JSON `{}`. Para multipart debe dejarse que el cliente genere el encabezado `Content-Type` y su boundary.

## Autenticación y configuración

`POST /api/login` recibe `{ "username": "admin", "password": "admin" }` y establece la cookie `stc.sid`. Las rutas administrativas necesitan esa cookie. Las rutas móviles necesitan un token vigente en la URL.

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP |
| `PUBLIC_BASE_URL` | Origen de la solicitud | Dirección accesible desde el teléfono, sin barra final |
| `SESSION_SECRET` | Aleatorio en cada arranque | Firma de cookies; configurar un valor propio al preparar un entorno |
| `TRUST_PROXY` | `false` | Confiar en un proxy solamente si existe uno de confianza delante |

`npm start` no carga `.env` automáticamente. Para cargarlo: `node --env-file=.env src/server.js`.

## Rutas administrativas

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/api/login` | Autentica y crea el trámite |
| POST | `/api/logout` | Destruye sesión, documentos y token |
| GET | `/api/session` | Metadatos y estado actual |
| POST | `/api/start/local` | Inicia un intento de carga local |
| POST | `/api/start/mobile` | Inicia 120 segundos y devuelve además `url` y `qr` como PNG data URL |
| GET | `/api/qr` | Recupera `url` y `qr` activos, sin renovar el plazo |
| POST | `/api/files` | Recibe archivos locales en campos multipart `files` |
| GET | `/api/files/:fileId/content` | Devuelve los bytes con el tipo detectado y disposición inline |
| POST | `/api/files/:fileId/review` | Marca como revisado un archivo del intento activo |
| DELETE | `/api/files/:fileId` | Elimina un archivo del intento activo |
| POST | `/api/cancel` | Descarta intento y devuelve estado idle |
| POST | `/api/complete` | Finaliza un intento local con todos los documentos revisados |
| POST | `/api/new` | Crea otro trámite dentro de la sesión administrativa |

## Rutas móviles

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/mobile/:token` | Metadatos del trámite compartido |
| POST | `/api/mobile/:token/files` | Recibe multipart `files` |
| GET | `/api/mobile/:token/files/:fileId/content` | Contenido del documento |
| POST | `/api/mobile/:token/files/:fileId/review` | Marca revisión compartida |
| DELETE | `/api/mobile/:token/files/:fileId` | Elimina un archivo compartido |
| POST | `/api/mobile/:token/cancel` | Revoca token y descarta el intento |
| POST | `/api/mobile/:token/complete` | Finaliza y revoca token |

El kiosco puede ver y revisar los archivos del móvil con su cookie. La finalización móvil se envía desde el portal móvil; el kiosco no usa `/api/complete` para finalizar ese origen.

## Ejemplo de estado

```json
{
  "id": "uuid-del-tramite",
  "status": "uploading",
  "source": "local",
  "reason": null,
  "expiresAt": null,
  "serverTime": 1790000000000,
  "files": [{
    "id": "uuid-del-archivo",
    "name": "documento-demo.pdf",
    "size": 920,
    "type": "application/pdf",
    "reviewed": false
  }]
}
```

Los tiempos son milisegundos Unix. `expiresAt` solo aplica durante la espera móvil. `reason` puede indicar `expired` o `cancelled` al volver al panel.

## Errores

| HTTP | Significado habitual |
| --- | --- |
| 400 | Tamaño/cantidad excedidos, archivo vacío o formato no reconocido, origen de carga inválido |
| 401 | Credenciales incorrectas, cookie ausente o sesión vencida |
| 403 | Mutación de origen distinto al host del servidor |
| 404 | Ruta o archivo inexistente para esa sesión |
| 409 | Duplicado, carga inactiva, documentos pendientes de revisión o intento ya finalizado |
| 410 | Token móvil vencido, cancelado, finalizado o revocado |
| 500 | Error de procesamiento no previsto |

Ejemplo: `{ "error": "La carga requiere revisar y confirmar cada documento antes de continuar." }`. Las respuestas de error no incluyen binarios de documentos.
