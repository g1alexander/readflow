# 0009 — La metadata del EPUB la extrae una Lambda disparada por EventBridge, con parser stdlib y fallos a SQS

- **Status:** accepted
- **Date:** 2026-10-25
- **Scope:** infrastructure, serverless

## Context

Tras `POST /uploads` el libro existe con `ingest=pending` y el nombre del archivo (ALE-15). Falta leer título, autores, año y portada del EPUB al llegar a S3 (ALE-16). Un EPUB es un zip con un OPF en XML. ADR 0008 fija el asset `serverless/src` sin bundling. El bucket vive en `StorageStack` y las Lambdas en `ServerlessStack` (ADR 0004).

## Decision

- **Lambda `readflow-metadata`** (Python 3.13, arm64, 512 MB, 60 s) en `ServerlessStack`. Mismo `serverless/src` que `api`, sin la carpeta `api/` (ADR 0008). Código en `serverless/src/metadata/`; lo común con `api` (ULID) va a `serverless/src/common/`.
- **Parser con stdlib** (`zipfile` + `xml.etree`): `container.xml` → OPF → `dc:title`, `dc:creator`, `dc:date`, portada (`properties="cover-image"` y, si no hay, `<meta name="cover">`).
- **Trigger por EventBridge:** `eventBridgeEnabled` en el bucket + Rule `Object Created` filtrada por bucket y key `users/*/books/*/book.epub`, con target la Lambda.
- **Errores:** un EPUB inválido se captura y deja el libro en `failed` sin reintento. Cualquier otro error se propaga: 2 reintentos async y luego on-failure destination a la cola SQS `readflow-metadata-failures` (14 días). Runbook: [reprocesar metadata](../runbooks/reprocesar-metadata.md).
- **UI:** polling de `GET /books` cada 3 s mientras haya libros `pending`, tope 2 min. El push queda para ALE-10.
- Contrato: patrón #5 y ciclo de vida de `ingest` en [`docs/specs/modelo-de-datos.md`](../specs/modelo-de-datos.md).

## Rejected alternatives

- **ebooklib + lxml en un Layer** — binario nativo para arm64 y un paso de build, para leer un XML simple.
- **Notificación S3 directa a la Lambda** — el bucket está en otro stack: crea dependencia cíclica entre stacks o un custom resource.
- **SQS entre S3 y la Lambda** — más piezas para un usuario; los reintentos async + destination cubren los fallos.
- **DLQ de la Lambda** — guarda solo el evento; la destination guarda también el error.
- **Reintentar EPUBs inválidos** — un archivo corrupto falla igual en cada intento.

## Consequences

- Los EPUB raros (sin OPF estándar, DRM) quedan `failed`; el usuario los borra y vuelve a subir.
- Un libro que ya no está `pending` no se reprocesa: la condición lo descarta. Reprocesar `failed` queda fuera.
- La cola no tiene alarma: hay que revisarla a mano si un libro se queda `pending`.
- Los eventos de servicios AWS a EventBridge no tienen costo; la cola cuesta ≈ $0 sin mensajes.
