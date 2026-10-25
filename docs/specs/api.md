# API HTTP

Contrato entre el front y la Lambda `api`. Decisiones y porqués: [ALE-14](https://linear.app/g1alexander/issue/ALE-14), [ALE-15](https://linear.app/g1alexander/issue/ALE-15) y [ADR 0008](../adr/0008-http-api-una-lambda-con-router.md). Modelo de datos: [modelo-de-datos.md](modelo-de-datos.md).

## Base

| Propiedad | Valor |
| --- | --- |
| Tipo | API Gateway HTTP API, stage `$default` |
| Base URL | Output `ApiUrl` de `ReadflowServerless`; en el front, `PUBLIC_API_URL` (sin `/` final; las rutas se concatenan como `${PUBLIC_API_URL}/books`) |
| Formato | JSON UTF-8 (`content-type: application/json`) |
| Throttling | 10 rps, burst 20, para todo el stage. Exceso → `429` de API Gateway |

## Autenticación

- Header `Authorization: Bearer <access token>` de Cognito (no el ID token).
- API Gateway valida firma, expiración, `iss` (el User Pool) y `client_id` (el app client `WebClient`). Si falla → `401 {"message": "Unauthorized"}`, generado por API Gateway (no sigue el formato de error de abajo).
- La Lambda toma `<sub>` del claim `sub` del token. Nunca del body ni de la URL.

## CORS

- Orígenes: context `corsOrigins` de `cdk.json` (los mismos que el bucket).
- Métodos: `GET`, `POST`, `PATCH`, `DELETE`. Headers: `authorization`, `content-type`.
- El preflight `OPTIONS` lo responde API Gateway sin authorizer.

## Errores

Todo error que genera la Lambda:

```json
{ "error": { "code": "not_found", "message": "Route not found" } }
```

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `invalid_request` | Body que no es JSON o no cumple la validación de la ruta |
| 401 | `unauthorized` | El token no trae `sub` |
| 404 | `not_found` | Ruta sin handler en la Lambda |
| 500 | `internal` | Error no controlado; el detalle va a CloudWatch, no a la respuesta |

`code` es estable y el front decide por él; `message` es solo para humanos. El objeto puede ganar campos nuevos sin romper.

## Rutas

### `GET /books`

Tablero: todos los libros del usuario (access pattern #1 del modelo de datos). La Lambda pagina con `LastEvaluatedKey` hasta agotar y devuelve todo junto; el front agrupa por `status`.

`200`:

```json
{
  "books": [
    {
      "id": "01JB...",
      "name": "Ficciones",
      "authors": [{ "id": "jorge-luis-borges", "name": "Jorge Luis Borges" }],
      "status": "reading",
      "ingest": "ready",
      "epubKey": "...",
      "epubFileName": "ficciones.epub",
      "createdAt": "2026-10-08T21:04:14.123Z",
      "updatedAt": "2026-10-08T21:04:14.123Z"
    }
  ]
}
```

- Cada elemento es un [Book](modelo-de-datos.md#book--usersub--bookulid) con sus atributos tal cual, sin `PK`, `SK` ni `entity`. Los opcionales ausentes no aparecen.
- Los números (`score`, `year`, `epubSize`) salen como números JSON.
- Sin libros → `200 {"books": []}`.
- Orden: el de la SK (ULID, por fecha de creación ascendente).

### `POST /uploads`

Crea un libro y devuelve dónde subir su EPUB (access pattern #4 del modelo de datos). Un libro por request; el front llama una vez por archivo. El navegador sube el EPUB directo a S3 con la URL firmada, sin pasar por la Lambda.

Request:

```json
{ "fileName": "ficciones.epub", "size": 482113 }
```

| Campo | Tipo | Validación |
| --- | --- | --- |
| `fileName` | string | Hasta 255 caracteres, termina en `.epub` (sin distinguir mayúsculas) y el nombre sin `.epub` no queda vacío |
| `size` | integer | Bytes, entre 1 y 104857600 (100 MB). Solo se valida aquí: la URL firmada no limita el tamaño |

No hay `status` en el body: todo libro nace en `toread`.

`201`:

```json
{
  "book": {
    "id": "01JB...",
    "name": "ficciones",
    "authors": [],
    "status": "toread",
    "ingest": "pending",
    "epubKey": "users/<sub>/books/01JB.../book.epub",
    "epubFileName": "ficciones.epub",
    "createdAt": "2026-10-08T21:04:14.123Z",
    "updatedAt": "2026-10-08T21:04:14.123Z"
  },
  "upload": {
    "url": "https://...",
    "method": "PUT",
    "headers": { "content-type": "application/epub+zip" },
    "expiresIn": 900
  }
}
```

- `book` tiene la misma forma que un elemento de `GET /books`. `name` es `fileName` sin `.epub`, hasta que la Lambda de metadata lo reemplace.
- El cliente hace `PUT upload.url` con el archivo como body y exactamente los `upload.headers`. `content-type` va firmado: si falta o cambia, S3 responde `403`.
- La URL expira a los `expiresIn` segundos. Si vence, el libro queda en `ingest=pending` sin EPUB.
- Al llegar el objeto a S3 arranca la Lambda de metadata, que pasa `ingest` a `ready` o `failed`.
- Errores: `400 invalid_request` si el body no es JSON o falla la validación.
