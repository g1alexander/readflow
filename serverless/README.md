# serverless

Lambdas en Python 3.13 (arm64). Hoy: `api`, detrás del HTTP API ([ADR 0008](../docs/adr/0008-http-api-una-lambda-con-router.md), [spec](../docs/specs/api.md)).

```sh
uv sync
uv run pytest -q
uv run ruff check
uv run ruff format --check
```

CDK empaqueta `src/` tal cual con `Code.fromAsset`; `boto3` viene en el runtime. Una ruta nueva = función en `src/api/routes/` + entrada en `ROUTES` de `handler.py` + ruta en `ServerlessStack`.
