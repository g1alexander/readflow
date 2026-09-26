# Consideraciones

## Feedback de la subida de EPUB

**Problema:** S3 invoca la Lambda de metadata de forma asíncrona. La webapp no se entera cuándo termina el procesamiento ni si falla; si la Lambda falla tras los reintentos, el evento se pierde en silencio.

**Posibles soluciones:**

- **Polling:** la webapp consulta periódicamente el estado del libro en la API.
- **API Gateway WebSocket:** la Lambda notifica al navegador al terminar con `postToConnection`.
- **AppSync subscriptions:** notificaciones en tiempo real vía GraphQL.
- **On-failure destination:** captura los fallos de la Lambda para no perderlos.
