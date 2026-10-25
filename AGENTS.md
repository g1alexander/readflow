# readflow

Webapp serverless personal de biblioteca y lectura (EPUB → Kindle). Monorepo: `frontend/` (Astro), `serverless/` (Lambdas Python 3.13) e `infrastructure/` (CDK v2, `us-east-1`).

## Comandos

- Front dev: `cd frontend && pnpm dev`
- Front build: `cd frontend && pnpm build`
- Serverless tests: `cd serverless && uv run pytest -q`
- Serverless lint: `cd serverless && uv run ruff check && uv run ruff format --check`
- Infra type-check: `cd infrastructure && pnpm build`
- Infra tests: `cd infrastructure && pnpm test --reporter=dot`
- Infra un test: `cd infrastructure && pnpm exec vitest run <file> --reporter=dot`
- Synth: `cd infrastructure && pnpm synth -q`
- Diff: `cd infrastructure && pnpm diff 2>&1 | tail -40`
- Git: `git log --oneline -n 20`

## Estructura

- `frontend/src/scripts/`: lógica por página + `store.ts` (datos) y `auth.ts` (Cognito).
- `serverless/src/api/`: Lambda `api`; `handler.py` despacha por `routeKey` a `routes/` ([ADR 0008](docs/adr/0008-http-api-una-lambda-con-router.md)). Se empaqueta `serverless/src` tal cual.
- `serverless/src/metadata/`: Lambda `metadata` (EventBridge `Object Created` → parser EPUB stdlib → DynamoDB, [ADR 0009](docs/adr/0009-lambda-metadata-eventbridge-parser-stdlib.md)). `serverless/src/common/`: código compartido entre Lambdas.
- `infrastructure/bin/readflow.ts`: instancia stacks y pasa outputs por props.
- `infrastructure/lib/stacks/`: un stack por dominio ([ADR 0004](docs/adr/0004-stacks-cdk-por-dominio.md)).
- `infrastructure/lib/constructs/`: piezas sin lógica de dominio.
- `docs/adr/`, `docs/specs/`, `docs/runbooks/`.

## Convenciones

- Los commits los hace siempre el usuario: el agente nunca corre `git commit` ni `git push`. Se trabaja en `main`; rama solo si se pide.
- Toda decisión de arquitectura → ADR en `docs/adr/`.
- Contratos (API, eventos, modelo de datos) → `docs/specs/`. No inferirlos del código.
- READMEs cortos: qué es, comandos, setup. El detalle va a ADRs/specs.
- Solo `AGENTS.md`; no crear `CLAUDE.md`.
- Ningún stack con terminationProtection; todos los recursos con `RemovalPolicy.DESTROY`, sin deletionProtection.

## Zonas prohibidas

- Nunca `cdk deploy` ni `pnpm deploy`: lo corre el usuario.
- No tocar `infrastructure/cdk.out/`, `frontend/dist/`.
- Nunca secretos, tokens ni IDs reales en código, docs o commits.

## Compact instructions

Al compactar, conserva: tarea en curso, decisiones y por qué, archivos modificados, tests fallando.
Descarta: salidas de comandos, contenido de archivos ya editados.
