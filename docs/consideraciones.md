# Consideraciones

## Feedback de la subida de EPUB

**Problema:** el `Object Created` de S3 llega a la Lambda de metadata por EventBridge, de forma asíncrona. La webapp no se entera cuándo termina el procesamiento ni si falla; si la Lambda falla tras los reintentos, el evento se pierde en silencio.

**Posibles soluciones:**

- **Polling:** la webapp consulta periódicamente el estado del libro en la API.
- **API Gateway WebSocket:** la Lambda notifica al navegador al terminar con `postToConnection`.
- **AppSync subscriptions:** notificaciones en tiempo real vía GraphQL.
- **On-failure destination:** captura los fallos de la Lambda para no perderlos.

**Resuelto (ALE-9):** `POST /uploads` crea el libro con `ingest=pending`, así nunca desaparece en silencio, y la webapp hace polling hasta `ready` o `failed`. Ver [modelo de datos](./specs/modelo-de-datos.md#ciclo-de-vida-de-ingest). Los fallos tras los reintentos van a la cola SQS `g1-readflow-metadata-failures` (on-failure destination).

**Resuelto (ALE-10):** el polling se reemplazó por avisos push con AppSync Events, publicados por una Lambda sobre el Stream. Ver [ADR 0011](./adr/0011-avisos-push-appsync-events-lambda-notify.md) y [spec](./specs/realtime.md).
