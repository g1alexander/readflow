# Consideraciones

## Feedback de la subida de EPUB

**Problema:** S3 invoca la Lambda de metadata de forma asíncrona. La webapp no se entera cuándo termina el procesamiento ni si falla; si la Lambda falla tras los reintentos, el evento se pierde en silencio.

**Posibles soluciones:**

- **Polling:** la webapp consulta periódicamente el estado del libro en la API.
- **API Gateway WebSocket:** la Lambda notifica al navegador al terminar con `postToConnection`.
- **AppSync subscriptions:** notificaciones en tiempo real vía GraphQL.
- **On-failure destination:** captura los fallos de la Lambda para no perderlos.

**Resuelto (ALE-9):** `POST /uploads` crea el libro con `ingest=pending`, así nunca desaparece en silencio, y la webapp hace polling hasta `ready` o `failed`. Ver [modelo de datos](./specs/modelo-de-datos.md#ciclo-de-vida-de-ingest). El aviso push queda en [ALE-10](https://linear.app/g1alexander/issue/ALE-10); el on-failure destination, en la tarea de implementación.
