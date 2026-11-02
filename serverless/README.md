# serverless

Lambdas en Python 3.13 (arm64): `api` detrás del HTTP API ([ADR 0008](../docs/adr/0008-http-api-una-lambda-con-router.md), [spec](../docs/specs/api.md)), `metadata` ([ADR 0009](../docs/adr/0009-lambda-metadata-eventbridge-parser-stdlib.md)), `kindle` ([ADR 0010](../docs/adr/0010-lambda-kindle-stream-idempotencia-fallos-como-estado.md)) y `notify` ([ADR 0011](../docs/adr/0011-avisos-push-appsync-events-lambda-notify.md)). Código compartido en `src/common/`.

```sh
uv sync
uv run pytest -q
uv run ruff check
uv run ruff format --check
```

CDK empaqueta `src/` tal cual con `Code.fromAsset`; `boto3` viene en el runtime. Una ruta nueva = función en `src/api/routes/` + entrada en `ROUTES` de `handler.py` + ruta en `ServerlessStack`.
