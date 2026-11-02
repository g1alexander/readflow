# 0011 — Los cambios de `ingest` y `kindle.status` llegan al front por AppSync Events, publicados por una Lambda sobre el Stream

- **Status:** accepted
- **Date:** 2026-11-02
- **Scope:** infrastructure, serverless, frontend

## Context

La UI se enteraba del fin de la metadata (ADR 0009) y del resultado del envío a Kindle (ADR 0010) con polling de la API cada 3 s, con tope de 2 min (ALE-10). El Stream `NEW_AND_OLD_IMAGES` ya ve todos los cambios del Book. El front usa Amplify v6 con el User Pool y no tiene Identity Pool.

## Decision

- **AppSync Events** en un stack nuevo `ReadflowRealtime` (ADR 0004). Namespace `readflow`, un canal por usuario `/readflow/users/<sub>`.
- **Auth:** suscripción con Cognito User Pool y handler `onSubscribe` (APPSYNC_JS) que rechaza todo canal distinto de `/readflow/users/<ctx.identity.sub>`. Publicación solo IAM.
- **Lambda `readflow-notify`** (Python 3.13, arm64, 256 MB, 30 s) en `ServerlessStack`, segundo consumidor del Stream (filtro `MODIFY` + `BOOK`, 2 reintentos, `bisectBatchOnError`). Publica `{bookId}` si `ingest` o `kindle.status` cambian entre Old y New. POST firmado SigV4 con botocore del runtime + `urllib`. metadata, kindle y api no cambian.
- **Payload solo señal:** el front relee el libro con `GET /books/{id}`. La API sigue siendo el único contrato del libro.
- **Front:** `events.connect` de Amplify. Al conectar o reconectar, `GET /books` para recuperar avisos perdidos. Polling eliminado.
- Contrato: [`docs/specs/realtime.md`](../specs/realtime.md).

## Rejected alternatives

- **Seguir con polling** — llamadas a la API cada 3 s mientras haya algo pendiente, y el tope de 2 min deja estados sin refrescar.
- **API Gateway WebSocket API** — hay que guardar `connectionId` en DynamoDB, limpiar conexiones caídas y escribir los handlers `$connect`/`$disconnect`; AppSync Events lo da administrado.
- **AppSync GraphQL subscriptions** — exige un schema y resolvers, y una mutación para disparar el aviso, solo para mandar una señal.
- **Publicar desde metadata, kindle y api** — tres sitios que acoplar a AppSync; el Stream ya ve cada cambio con su imagen vieja y nueva.
- **Mandar el libro completo en el evento** — un segundo contrato del Book que mantener en paralelo a la API.

## Consequences

- Sin garantía de entrega: un aviso con el cliente desconectado se pierde y lo cubre la recarga al reconectar.
- Puede llegar un aviso duplicado por los reintentos del Stream; el front solo relee el libro.
- Un fallo de la Lambda `notify` tras los reintentos se descarta (sin cola): el siguiente cambio o la reconexión dejan la UI al día.
- Cambios de otros campos (status de lectura, ediciones desde otro dispositivo) no se avisan.
