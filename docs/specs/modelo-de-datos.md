# Modelo de datos

Contrato de datos que comparten la API de libros, la Lambda de metadata y la Lambda de envío a Kindle. Decisiones y porqués: [ALE-9](https://linear.app/g1alexander/issue/ALE-9) y [ADR 0005](../adr/0005-dynamodb-single-table.md).

## Tabla `readflow`

| Propiedad | Valor |
| --- | --- |
| Diseño | Single-table: libros, autores, eventos y ajustes de usuario |
| Claves | `PK` (string, partition key) y `SK` (string, sort key), genéricas |
| Billing | On-demand (`PAY_PER_REQUEST`) |
| PITR | Activado |
| Stream | `NEW_AND_OLD_IMAGES` |
| Removal policy | `RETAIN` (ADR 0004) |
| GSI | Ninguno |
| TTL | Ninguno |

Todos los items llevan `entity` (`BOOK`, `AUTHOR`, `EVENT`, `SETTINGS`) para distinguirlos en el código y en el Stream.

Las fechas son strings ISO-8601 en UTC con milisegundos: `2026-10-08T21:04:14.123Z`. `<sub>` es el claim `sub` del JWT de Cognito: la API lo lee del token, nunca del body.

## Items

```
PK              SK                  entity
USER#<sub>      SETTINGS            SETTINGS
USER#<sub>      AUTHOR#<slug>       AUTHOR
USER#<sub>      BOOK#<ulid>         BOOK
BOOK#<ulid>     EVENT#<ulid>        EVENT
```

### Book — `USER#<sub>` / `BOOK#<ulid>`

| Atributo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `entity` | `"BOOK"` | sí | |
| `id` | string (ULID) | sí | Lo genera la API en `POST /uploads` |
| `name` | string | sí | Al crear: nombre del archivo sin `.epub`. La metadata lo reemplaza mientras `ingest=pending` |
| `authors` | list de `{id, name}` | sí | Puede estar vacía. `id` = slug del autor, `name` = copia del nombre canónico |
| `status` | enum [status](#status) | sí | |
| `type` | enum [type](#type) | no | |
| `score` | number 1-5 | no | |
| `year` | number | no | Año de publicación |
| `epubKey` | string | sí | Key S3 del EPUB |
| `epubFileName` | string | sí | Nombre original del archivo |
| `epubSize` | number | no | Bytes; lo escribe la metadata (viene en el evento S3) |
| `coverKey` | string | no | Key S3 de la portada; ausente si el EPUB no trae portada |
| `ingest` | `pending` \| `ready` \| `failed` | sí | Ver [Ciclo de vida](#ciclo-de-vida-de-ingest) |
| `ingestError` | string | no | Solo con `ingest=failed`; mensaje corto, sin el payload |
| `kindle` | map | no | Ausente = nunca pedido. Ver abajo |
| `createdAt` | string ISO | sí | |
| `updatedAt` | string ISO | sí | Se actualiza en cada escritura |

`kindle`:

| Atributo | Tipo | Notas |
| --- | --- | --- |
| `requestedAt` | string ISO | Lo escribe la API. Cada valor nuevo es un pedido de envío |
| `processedFor` | string ISO | Valor de `requestedAt` que la Lambda de Kindle ya tomó (idempotencia) |
| `status` | `sending` \| `sent` \| `failed` | `sending` lo escribe la API junto con `requestedAt`; `sent` y `failed`, la Lambda |
| `at` | string ISO | Fecha del último resultado |

`sent` significa que SES aceptó el correo, no que el Kindle lo recibió; SES no puede confirmar la entrega.

No se guardan: los colores de la portada placeholder (`bg`/`ink`, el front los deriva del `id`) ni la URL del EPUB (se genera como presigned URL al pedirla).

### Author — `USER#<sub>` / `AUTHOR#<slug>`

| Atributo | Tipo | Notas |
| --- | --- | --- |
| `entity` | `"AUTHOR"` | |
| `id` | string | El slug |
| `name` | string | Nombre canónico, tal como se muestra |
| `createdAt` | string ISO | |

Slug: normalizar NFKD → quitar diacríticos → minúsculas → cada tramo no alfanumérico pasa a `-` → recortar los `-` de los extremos. `"Jorge Luis Borges"` y `"jorge  luis borges"` → `jorge-luis-borges`. Un slug vacío es un error de validación.

Alta: `PutItem` con `ConditionExpression: attribute_not_exists(SK)`. `ConditionalCheckFailedException` significa que el autor ya existe: se reusa, no es un error. El slug no detecta erratas; eso lo resuelve el autocompletar de la UI.

Renombrar un autor obliga a actualizar el `name` copiado en cada libro que lo referencia (Query del tablero y filtrar en código). Los autores sin libros no se borran.

### Event — `BOOK#<ulid>` / `EVENT#<ulid>`

El historial del libro vive en su propia partición, así que el Query del tablero nunca lo lee. La SK usa un ULID propio del evento: ordena por tiempo y no choca si dos eventos caen en el mismo milisegundo.

| Atributo | Tipo | Notas |
| --- | --- | --- |
| `entity` | `"EVENT"` | |
| `bookId` | string | |
| `kind` | enum | `uploaded`, `ingest_ready`, `ingest_failed`, `status_changed`, `kindle_requested`, `kindle_sent`, `kindle_failed` |
| `data` | map | Depende de `kind`; p. ej. `status_changed` → `{from, to}` |
| `at` | string ISO | |

El texto que muestra el timeline lo arma el front a partir de `kind` + `data`.

### Settings — `USER#<sub>` / `SETTINGS`

| Atributo | Tipo | Notas |
| --- | --- | --- |
| `entity` | `"SETTINGS"` | |
| `kindleEmail` | string | Dirección `@kindle.com` de destino. Sin ella, la Lambda de Kindle marca `failed` |
| `updatedAt` | string ISO | |

## Access patterns

| # | Caso | Quién | Operación |
| --- | --- | --- | --- |
| 1 | Tablero: todos mis libros | API | `Query PK=USER#<sub> AND begins_with(SK, "BOOK#")`. Paginar con `LastEvaluatedKey` (1 MB por página) hasta agotar. El front agrupa por `status` |
| 2 | Detalle de un libro | API | En paralelo: `GetItem USER#<sub> / BOOK#<id>` y `Query PK=BOOK#<id> AND begins_with(SK, "EVENT#")`, `ScanIndexForward=false`. Si el GetItem no devuelve nada → 404 sin leer eventos (esa lectura es la verificación de dueño) |
| 3 | Autocompletar autores | API | `Query PK=USER#<sub> AND begins_with(SK, "AUTHOR#")` |
| 4 | Crear libro (`POST /uploads`) | API | `TransactWriteItems`: Put Book (`ingest=pending`, `attribute_not_exists(PK)`) + Put Event `uploaded`. Si `status=reading`, el Book nace con `kindle.requestedAt` y `kindle.status=sending`. Devuelve la presigned URL de `epubKey` |
| 5 | Guardar metadata | Lambda metadata | Saca `<sub>` e `<id>` de la key S3. Put condicional por cada autor (§Author). `TransactWriteItems`: Update Book (`name`, `authors`, `year`, `coverKey`, `epubSize`, `ingest=ready`, condición `ingest = pending`) + Put Event `ingest_ready`. Si falla: `ingest=failed` + `ingestError` + Event `ingest_failed` |
| 6 | Cambiar estado | API | `TransactWriteItems`: Update `status` (+ `kindle.requestedAt=now`, `kindle.status=sending` si pasa a `reading` desde otro estado) + Put Event `status_changed` (+ `kindle_requested`) |
| 7 | Reenviar a Kindle | API | `TransactWriteItems`: Update `kindle.requestedAt=now`, `kindle.status=sending` + Put Event `kindle_requested` |
| 8 | Editar campos (`name`, `authors`, `type`, `score`, `year`) | API | `UpdateItem` con `attribute_exists(PK)`. Autores nuevos: Put condicional antes |
| 9 | Resultado del envío | Lambda Kindle | `TransactWriteItems`: Update `kindle.status` (`sent`/`failed`) y `kindle.at` + Put Event `kindle_sent`/`kindle_failed` |
| 10 | Borrar libro | API | Delete Book; Query + `BatchWriteItem` de los eventos; borrar el prefijo S3 del libro |
| 11 | Leer/guardar ajustes | API | `GetItem` / `PutItem USER#<sub> / SETTINGS` |
| 12 | Polling de `ingest` | Front | Repite #2 (o #1) hasta `ingest != pending`. Push: [ALE-10](https://linear.app/g1alexander/issue/ALE-10) |

## Ciclo de vida de `ingest`

```
POST /uploads ──► pending ──(metadata OK)──► ready
                     │
                     └──(metadata falla)──► failed
```

- El item existe desde que se pide la presigned URL: si el evento S3 se pierde, el libro queda visible como `pending` y no desaparece en silencio.
- La condición `ingest = pending` en #5 evita que un reintento de la Lambda pise ediciones posteriores del usuario.
- Un libro `pending` cuyo EPUB nunca llegó a S3 se queda así; limpiarlo queda fuera de esta spec.

## Contrato del Stream (Lambda de envío a Kindle)

Hay un solo Stream, que ve todas las escrituras de la tabla. Filtro de la event source mapping, para que solo lleguen libros listos con un pedido de envío:

```json
{
  "eventName": ["MODIFY"],
  "dynamodb": {
    "NewImage": {
      "entity": { "S": ["BOOK"] },
      "ingest": { "S": ["ready"] },
      "kindle": { "M": { "requestedAt": { "S": [{ "exists": true }] } } }
    }
  }
}
```

El filtro no puede comparar la imagen vieja con la nueva, así que la Lambda decide en código. Envía solo si se cumple alguna de estas condiciones:

- `New.kindle.requestedAt != Old.kindle.requestedAt` (pedido nuevo), o
- `Old.ingest != "ready"` (pedido hecho mientras el EPUB se procesaba: libro subido directo a `reading`).

Si no se cumple ninguna (p. ej. la Lambda acaba de escribir `kindle.status`, o el usuario editó el `score`), termina sin hacer nada.

**Idempotencia:** el Stream entrega al menos una vez. Antes de enviar, la Lambda hace `UpdateItem SET kindle.processedFor = :req` con condición `kindle.processedFor <> :req OR attribute_not_exists(kindle.processedFor)`. Si falla la condición, ese pedido ya se tomó y no reenvía.

Sin `INSERT`: un Book nace siempre con `ingest=pending`, así que el primer envío posible es el MODIFY de #5.

## S3 — bucket de EPUB

Bucket privado (Block Public Access completo). El navegador sube y descarga solo con presigned URLs que emite la API.

```
users/<sub>/books/<ulid>/book.epub
users/<sub>/books/<ulid>/cover.<ext>
```

- La API arma la key; el cliente nunca la elige.
- La Lambda de metadata obtiene `<sub>` y `<ulid>` de la key del evento `ObjectCreated` (filtro de sufijo `book.epub`).
- Borrar un libro = borrar el prefijo `users/<sub>/books/<ulid>/`.

## Enums

Se guardan las keys; los labels viven en el front.

### status

`toread` (To Read) · `upnext` (Up Next) · `reading` (Reading) · `onhold` (On Hold) · `finished` (Finished) · `dropped` (Dropped). Son las mismas keys de `frontend/src/scripts/store.ts`. Cualquier transición está permitida.

### type

| Key | Label |
| --- | --- |
| `productivity` | Desarrollo y Productividad |
| `wellbeing` | Mente y bienestar |
| `history` | Historia y Sociedad |
| `film` | Cine y cultura |
| `philosophy` | Filosofía |
| `fiction` | Clásicos y Narrativa |
| `thriller` | Thriller y Terror |
| `scifi` | Ciencia Ficción y Fantasía |
| `design` | Arte y Diseño |
| `strategy` | Sistemas y Estrategia |
| `programming` | Programación y Software |
| `other` | Otros y Antologías |

## Fuera de esta spec

- Highlights de Kindle (fase 2). El single-table permite agregar `HIGHLIGHT#` en la partición `BOOK#<ulid>` sin migrar.
- Aviso push del fin de la metadata: [ALE-10](https://linear.app/g1alexander/issue/ALE-10).
- On-failure destination de la Lambda de metadata y limpieza de libros `pending` huérfanos.
- Migrar los datos actuales de localStorage.

## Cuándo revisar

- Si el tablero necesita paginar o filtrar del lado del servidor → GSI por `status` (`GSI1PK = USER#<sub>#STATUS#<status>`).
- Si aparece "libros de un autor" como pantalla → GSI por autor, o un item de relación por autor.
