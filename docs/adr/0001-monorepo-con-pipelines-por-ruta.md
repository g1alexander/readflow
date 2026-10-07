# 0001 — Frontend, backend e infraestructura viven en un solo repo con pipelines filtrados por ruta

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** frontend, backend, infrastructure

## Context

Readflow tiene tres piezas desplegables: el frontend Astro (Amplify Hosting), las Lambdas Python y la infraestructura AWS. Hay un solo desarrollador y muchos cambios tocan dos o tres de ellas a la vez (endpoint nuevo = Lambda + ruta en API Gateway + llamada desde el front).

## Decision

Todo vive en este repo, en `frontend/`, `backend/` e `infrastructure/`, y cada pipeline se dispara solo por cambios en sus rutas.

- Amplify: `appRoot: frontend` + `AMPLIFY_DIFF_DEPLOY=true`.
- GitHub Actions (`cdk deploy`): `on.push.paths: ['backend/**', 'infrastructure/**']`.
- Las Lambdas no tienen pipeline propio: CDK las empaqueta con `Code.fromAsset` y solo actualiza las que cambiaron (hash del asset).

## Rejected alternatives

- **Un repo por pieza** — un cambio transversal exige coordinar varios PRs y versiones entre repos; sin beneficio para un solo dev.
- **Un pipeline por Lambda** — CDK ya detecta qué asset cambió; multiplicar pipelines solo agrega YAML.

## Consequences

- Un cambio transversal es un solo commit/PR.
- Los filtros de ruta deben mantenerse al mover carpetas; un filtro mal puesto = deploy que no corre.
- `cdk deploy` sintetiza todo el stack en cada cambio de backend, aunque solo actualice lo modificado.
