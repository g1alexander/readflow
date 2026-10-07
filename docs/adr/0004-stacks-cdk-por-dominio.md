# 0004 — La infraestructura se divide en un stack de CDK por dominio, con el estado aislado

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** infrastructure

## Context

`infrastructure/` va a contener frontend (Amplify), Cognito, API Gateway + Lambdas, SES, DynamoDB, S3 y el pipeline de deploy. Mover un recurso de un stack a otro obliga a reemplazarlo o a importarlo a mano, y con DynamoDB o S3 eso pone los datos en riesgo.

## Decision

Cada dominio de `docs/architecture.drawio` tiene su propio stack en `lib/stacks/`: storage, auth, backend, frontend y pipeline.

- `storage` (DynamoDB y S3) es el único stack con estado: `RemovalPolicy.RETAIN` y termination protection.
- Las dependencias van en una sola dirección: storage → auth → backend → frontend. Los valores viajan por props tipadas en `bin/readflow.ts`, nunca con `Fn.importValue` a mano.
- Las piezas reutilizables sin lógica de dominio van en `lib/constructs/`, y las constantes en `lib/config.ts`.

## Rejected alternatives

- **Un solo stack con constructs por dominio** — es más simple, pero un `destroy` o un reemplazo accidental alcanza a los datos, y cada diff incluye todo.
- **Dos stacks (stateful / stateless)** — aísla los datos, pero mete Cognito, API, Lambdas, SES y Amplify en un stack enorme con diffs ruidosos y deploys que tocan todo.

## Consequences

- Cada dominio se despliega y se revisa (`cdk diff`) por separado; el radio de impacto es menor.
- Los exports entre stacks quedan bloqueados mientras otro stack los consuma: cambiar un output usado exige deploys en dos pasos.
- Hay que respetar el orden de dependencias; un stack no puede consumir a uno posterior.
