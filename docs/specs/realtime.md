# Avisos en tiempo real

Contrato entre la Lambda `notify` y el front para avisar cambios de un libro. Decisiones y porqués: [ALE-10](https://linear.app/g1alexander/issue/ALE-10). Modelo de datos: [modelo-de-datos.md](modelo-de-datos.md). API: [api.md](api.md).

## Base

| Propiedad | Valor |
| --- | --- |
| Servicio | AppSync Events (`ReadflowRealtime`) |
| Endpoint HTTP | `https://<httpDns>/event`. Output `EventsEndpoint`; en el front, `PUBLIC_EVENTS_ENDPOINT` |
| Namespace | `readflow` |
| Canal | `/readflow/users/<sub>` (un canal por usuario) |

## Autorización

| Acción | Modo | Regla |
| --- | --- | --- |
| Conectar / suscribirse | Cognito User Pool (token del usuario) | Handler `onSubscribe`: rechaza (`Unauthorized`) si el path del canal ≠ `/readflow/users/<ctx.identity.sub>`. Comodines (`/readflow/*`) también se rechazan |
| Publicar | IAM | Solo el rol de la Lambda `notify` (`appsync:EventPublish`) |

El front nunca publica.

## Cuándo se publica

La Lambda `notify` consume el Stream de `ReadflowStorage` (filtro: `MODIFY` y `NewImage.entity = BOOK`). Publica un aviso cuando cambia alguno de estos campos entre `OldImage` y `NewImage`:

- `ingest`
- `kindle.status`

Cualquier otro cambio no publica. `INSERT` y `REMOVE` no publican.

## Payload

```json
{ "bookId": "<id>" }
```

Es solo una señal: no lleva el estado. El front pide el libro con `GET /books/{id}` ([api.md](api.md)); la API sigue siendo el único contrato del libro.

## Entrega

- Sin garantía de entrega: un aviso con el cliente desconectado se pierde.
- Fallo al publicar → la Lambda lanza excepción → reintento del event source mapping (2 reintentos, bisect). Puede llegar un aviso duplicado; el front lo tolera porque solo relee el libro.

## Comportamiento del front

- Al cargar el tablero, la biblioteca o el detalle se suscribe a `/readflow/users/<sub>`.
- Cada aviso → `GET /books/{id}` (en el detalle, solo los avisos de ese libro); la vista actualiza la card, agrega el libro arriba si cumple su filtro o lo quita si dejó de cumplirlo. Toasts de Kindle cuando `kindle.status` pasa de `sending` a `sent` o `failed`.
- Al conectar o reconectar (`Connected` en el Hub `api`) → la vista repite sus consultas para recuperar avisos perdidos: tablero, `GET /books?status=toread&limit=5` + el resto de estados; biblioteca, primera página con sus filtros; detalle, `GET /books/{id}`.
- No hay polling.
