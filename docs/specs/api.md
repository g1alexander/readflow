# API HTTP

Contrato entre el front y la Lambda `api`. Decisiones y porqués: [ALE-14](https://linear.app/g1alexander/issue/ALE-14), [ALE-15](https://linear.app/g1alexander/issue/ALE-15), [ALE-17](https://linear.app/g1alexander/issue/ALE-17) y [ADR 0008](../adr/0008-http-api-una-lambda-con-router.md). Modelo de datos: [modelo-de-datos.md](modelo-de-datos.md).

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
- Métodos: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. Headers: `authorization`, `content-type`.
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
| 404 | `not_found` | Ruta sin handler en la Lambda, o libro que no existe o no es del usuario |
| 409 | `kindle_email_missing` | Pedido de envío a Kindle sin `kindleEmail` en ajustes |
| 409 | `ingest_failed` | Pedido de envío a Kindle de un libro con `ingest=failed` |
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
      "coverKey": "users/<sub>/books/01JB.../cover.jpg",
      "coverUrl": "https://...",
      "createdAt": "2026-10-08T21:04:14.123Z",
      "updatedAt": "2026-10-08T21:04:14.123Z"
    }
  ]
}
```

- Cada elemento es un [Book](modelo-de-datos.md#book--usersub--bookulid) con sus atributos tal cual, sin `PK`, `SK` ni `entity`. Los opcionales ausentes no aparecen.
- `coverUrl`: presigned GET de `coverKey`, válida 3600 s. Solo aparece si hay `coverKey`. Se firma en la Lambda, sin llamar a S3: que la URL exista no garantiza que el objeto exista. El front no la guarda: si la imagen no carga (URL vencida o sin objeto), muestra el placeholder; la próxima carga trae una URL nueva.
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

### `GET /books/{id}`

Detalle de un libro con su historial (access pattern #2). Si el libro no existe o es de otro usuario → `404 not_found`, sin leer eventos.

`200`:

```json
{
  "book": { "id": "01JB...", "name": "Ficciones", "coverUrl": "https://...", "...": "..." },
  "events": [
    { "id": "01JC...", "kind": "status_changed", "data": { "from": "toread", "to": "reading" }, "at": "2026-10-09T10:00:00.000Z" },
    { "id": "01JB...", "kind": "uploaded", "data": { "fileName": "ficciones.epub", "size": 482113 }, "at": "2026-10-08T21:04:14.123Z" }
  ]
}
```

- `book`: misma forma que un elemento de `GET /books` (con `coverUrl`).
- `events`: del más nuevo al más viejo. `id` es el ULID del evento; `kind` y `data` según el [modelo](modelo-de-datos.md#event--bookulid--eventulid). `kindle_requested` lleva `data: {}`.

### `PATCH /books/{id}`

Cambia el estado y/o edita campos (access patterns #6 y #8). Body parcial: solo los campos presentes se tocan.

```json
{ "status": "reading", "score": 5, "type": null }
```

| Campo | Tipo | Validación | `null` |
| --- | --- | --- | --- |
| `status` | enum [status](modelo-de-datos.md#status) | Una de las 6 keys | No |
| `name` | string | 1-300 caracteres tras recortar espacios | No |
| `authors` | lista de strings | 1-10 nombres, cada uno 1-300 caracteres tras recortar y con slug no vacío | No |
| `type` | enum [type](modelo-de-datos.md#type) | Una de las 12 keys | Borra el campo |
| `score` | integer | 1-5 | Borra el campo |
| `year` | integer | 0 hasta el año actual (UTC) | Borra el campo |

- Body vacío (`{}`), campo desconocido o valor inválido → `400 invalid_request`, sin escribir nada.
- `authors` son nombres, no slugs. El servidor saca el slug, deduplica, crea el `AUTHOR#` que falte y, si ya existía, usa su nombre canónico. El libro guarda `[{id, name}]` en el orden recibido.
- Cambio de `status` (distinto del actual): una transacción escribe los campos y el Event `status_changed` `{from, to}`. Si el nuevo estado es `reading`, además escribe `kindle = {requestedAt: now, status: "sending"}` y el Event `kindle_requested`.
- Pasar a `reading` exige lo mismo que [reenviar](#post-booksidkindle): sin `kindleEmail` → `409 kindle_email_missing`; `ingest=failed` → `409 ingest_failed`. Con `ingest=pending` se acepta: el envío sale cuando la metadata pase el libro a `ready`.
- `status` igual al actual no genera eventos ni pedido de envío.
- Libro inexistente → `404 not_found`.

`200`: `{ "book": { ... } }`, el libro ya actualizado, con la forma de `GET /books`.

### `POST /books/{id}/kindle`

Reenvía el libro al Kindle (access pattern #7), sin cambiar `status`. Sin body.

- Escribe `kindle = {requestedAt: now, status: "sending"}` + Event `kindle_requested` en una transacción.
- Errores: `404 not_found`, `409 kindle_email_missing`, `409 ingest_failed` (mismas reglas que el PATCH a `reading`).

`200`: `{ "book": { ... } }`.

### `DELETE /books/{id}`

Borra el libro (access pattern #10): primero todo el prefijo S3 `users/<sub>/books/<id>/`, después sus eventos y al final el Book. Si falla a mitad, el Book sigue existiendo y repetir el `DELETE` termina el trabajo.

- `204` sin body.
- Libro inexistente → `404 not_found`. Los autores no se borran.

### `GET /settings`

`200`: `{ "kindleEmail": "yo@kindle.com" }`. Sin ajustes guardados → `200 {}`.

### `PUT /settings`

```json
{ "kindleEmail": "yo@kindle.com" }
```

| Campo | Tipo | Validación |
| --- | --- | --- |
| `kindleEmail` | string \| `null` | Obligatorio. Hasta 254 caracteres, forma `<local>@kindle.com` (dominio sin distinguir mayúsculas, local sin espacios ni `@`). `null` lo borra |

- Reemplaza el item `SETTINGS` entero (access pattern #11). Campo desconocido o faltante → `400 invalid_request`.
- `200`: los ajustes guardados, con la forma de `GET /settings`.

### `GET /authors`

Autocompletar de autores (access pattern #3): todos los autores del usuario, ordenados por slug.

`200`: `{ "authors": [{ "id": "jorge-luis-borges", "name": "Jorge Luis Borges" }] }`.
