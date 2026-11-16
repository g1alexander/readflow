# 0015 — La observabilidad es logs JSON nativos de Lambda y un dashboard de CloudWatch, sin alarmas

- **Status:** accepted
- **Date:** 2026-11-16
- **Scope:** serverless, infrastructure

## Context

Las 4 Lambdas registraban texto plano sin contexto, y algunos fallos solo quedaban como estado en DynamoDB (`kindle_email_missing`, `too_large`). No había dashboard ni alarmas. Las DLQ de metadata y kindle (ADR 0009, ADR 0010) se revisaban a mano. Es una app personal con poco tráfico.

## Decision

Las Lambdas usan `loggingFormat: JSON` con `applicationLogLevelV2: INFO` y `systemLogLevelV2: WARN`. El código usa `logging` de la stdlib sin `setLevel`, y el contexto va en `extra={}`.

- Se registran los fallos en los puntos críticos (WARN/ERROR) y 1 INFO con el desenlace de cada flujo (ingest, envío al Kindle). Solo IDs (`bookId`, `sub`, `requestedAt`), y para SES solo el código de error. Nunca emails, títulos ni payloads.
- El stack `g1-readflow-observability` tiene el dashboard `g1-readflow-dashboard`. Muestra, por Lambda, invocaciones, errores y duración p95; del API, requests, 4xx, 5xx y latencia p95; los mensajes visibles en las DLQ; el `IteratorAge` de kindle y notify, y los últimos ERROR/WARN con Logs Insights.

## Rejected alternatives

- **Powertools Logger** — suma una dependencia de runtime y una capa por algo que Lambda ya trae (JSON y `extra`).
- **Alarmas con SNS** — para una app personal, el dashboard alcanza. Se pueden agregar después sobre las mismas métricas.
- **X-Ray** — cobra por traza y aporta poco: los flujos son cortos y asíncronos por stream, y los logs con `bookId` ya permiten seguirlos.
- **Access logs del HTTP API** — repiten lo que ya registra el log de 500 del handler.
- **Dashboard dentro de `g1-readflow-serverless`** — mezcla dominios (ADR 0004).

## Consequences

- Logs Insights puede filtrar por `level`, `bookId` o `reason` sin parsear texto.
- `g1-readflow-serverless` exporta las funciones, las DLQ, los log groups y el API para el dashboard. Reemplazar alguno de esos recursos obliga a desplegar antes `g1-readflow-observability`.
- Nada avisa de un fallo. Hay que mirar el dashboard.
