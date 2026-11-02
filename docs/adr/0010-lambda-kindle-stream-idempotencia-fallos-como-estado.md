# 0010 — El envío a Kindle lo hace una Lambda sobre el Stream de DynamoDB, idempotente por `processedFor`, y los fallos de envío se guardan como estado

- **Status:** accepted
- **Date:** 2026-11-02
- **Scope:** infrastructure, serverless, frontend

## Context

La API pide un envío escribiendo `kindle = {requestedAt, status: "sending"}` en el Book (patrones #6 y #7). Falta quien lea el EPUB de S3 y lo mande por SES a la `@kindle.com` del usuario (ALE-18). El Stream entrega al menos una vez y ve todas las escrituras de la tabla. SES acepta 40 MB por mensaje y el remitente vive en `MailStack` (ADR 0007).

## Decision

- **Lambda `readflow-kindle`** (Python 3.13, arm64, 512 MB, 60 s) en `ServerlessStack`, consumiendo el Stream `NEW_AND_OLD_IMAGES` con un filtro de event source mapping (`MODIFY`, `BOOK`, `ingest=ready`, `kindle.requestedAt` presente). La comparación Old/New va en código.
- **Idempotencia:** antes de enviar, `SET kindle.processedFor = :req` condicionado a `requestedAt = :req` y a que no esté tomado. Si la Lambda cae después, borra `processedFor` y relanza para que el reintento lo retome.
- **Fallos de envío como estado:** `too_large` (> 28 MB), `kindle_email_missing`, `ses_error` e `ingest_failed` (este último lo escribe la Lambda de metadata) quedan como `kindle.status=failed` + `kindle.error` + Event `kindle_failed`, y la Lambda termina OK. Sin reintento: el usuario reenvía.
- **Solo las caídas reintentan:** `batchSize 1`, 2 reintentos, `bisectBatchOnError`, on-failure a la cola `readflow-kindle-failures` (14 días).
- **Resultado** en transacción condicionada a `kindle.requestedAt = :req`: un resultado viejo no pisa un reenvío.
- **Email:** SES v2 `SendEmail` con contenido Raw (MIME stdlib). IAM: `ses:SendRawEmail` sobre la identidad (con Raw, `ses:SendEmail` da AccessDenied).
- Contrato: "Contrato del Stream" y patrones #5 y #9 en [`docs/specs/modelo-de-datos.md`](../specs/modelo-de-datos.md).

## Rejected alternatives

- **Enviar desde la API** — el request esperaría la descarga de S3 y SES (hasta decenas de MB) dentro del timeout de API Gateway, y un fallo no tendría reintento.
- **SQS entre la API y la Lambda** — una pieza más y la API tendría que escribir en dos sitios; el Stream ya trae el cambio con la imagen vieja y nueva.
- **EventBridge Pipes** — el filtro y el reintento ya los da la event source mapping.
- **Reintentar errores de SES** — los rechazos de SES (permisos, remitente, tamaño) fallan igual en cada intento y bloquearían el shard.
- **Filtrar solo en código, sin filtro del ESM** — cada escritura de la tabla invocaría la Lambda.
- **SES v1 `SendRawEmail`** — API legacy; v2 cubre Raw con el mismo permiso.

## Consequences

- El usuario ve el motivo del fallo en el detalle y el tablero, y lo resuelve reenviando.
- `sent` significa que SES aceptó el correo, no que el Kindle lo recibió.
- La cola no tiene alarma; lo que llegue ahí es una caída de la Lambda, y el libro se recupera reenviando desde la UI.
- El límite de 28 MB es menor que el de subida (100 MB): un EPUB grande se sube pero no se envía.
