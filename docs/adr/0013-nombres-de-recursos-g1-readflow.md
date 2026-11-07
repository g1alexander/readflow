# 0013 — Todo recurso con nombre propio se llama `g1-readflow-<servicio>`

- **Status:** accepted
- **Date:** 2026-11-07
- **Scope:** infrastructure

## Context

Los nombres eran mezcla: unos fijos con `readflow` (`readflow-api`, tabla `readflow`), otro con un prefijo distinto (`g1-readflowstorage-epub`) y el resto generados por CDK (`ReadflowServerless-ApiFunction...`). En la consola no se distinguía qué era del proyecto ni se podía buscar por prefijo. Ponerle nombre fijo a un recurso con datos lo reemplaza, así que el cambio se hizo con todo destruido.

## Decision

Cada recurso que CDK permite nombrar se llama `g1-readflow-<servicio>`, generado con `resourceName()` de `infrastructure/lib/config.ts`.

| Recurso | Nombre |
|---|---|
| Stacks | `g1-readflow-{storage,mail,auth,realtime,serverless,frontend}` |
| Tabla / bucket | `g1-readflow-table` / `g1-readflow-bucket` |
| Lambdas | `g1-readflow-{api,metadata,kindle,notify}` |
| Roles de las Lambdas | `g1-readflow-<servicio>-role` |
| Log groups | `/aws/lambda/g1-readflow-<servicio>` |
| Colas | `g1-readflow-{metadata,kindle}-failures` |
| User pool / client | `g1-readflow-userpool` / `g1-readflow-web` |
| Event API / HTTP API | `g1-readflow-events` / `g1-readflow-api` |
| Regla EventBridge | `g1-readflow-epub-uploaded` |
| App Amplify | `g1-readflow-frontend` |
| Parámetro SSM | `/g1-readflow/github-token` |

`<servicio>` es la función del recurso, no su tipo (`g1-readflow-kindle`, no `g1-readflow-kindle-lambda`).

Quedan fuera:
- los roles que crea CDK por dentro (auto-delete del bucket, Amplify, custom resources);
- el namespace de AppSync Events (`readflow`), que es parte de la ruta del canal y no un recurso ([spec realtime](../specs/realtime.md)).

## Rejected alternatives

- **Dejar nombres automáticos de CDK** — son ilegibles y cambian con el id del construct.
- **Agregar el tipo al nombre (`-lambda`, `-queue`)** — la consola ya muestra el tipo; solo alarga el nombre.
- **Agregar el ID de cuenta al bucket** — no hace falta mientras `g1-readflow-bucket` esté libre; se agrega solo si choca.
- **Nombrar también los roles internos de CDK** — no todos se pueden nombrar y el estándar igual quedaría incompleto.

## Consequences

- Recursos fáciles de encontrar y filtrar por `g1-readflow-` en consola, CLI y facturación.
- Un cambio en CDK que obliga a reemplazar un recurso con nombre fijo falla en el deploy: hay que borrar el recurso o cambiarle el nombre antes.
- Los nombres de rol valen para toda la cuenta: el mismo stack no se puede desplegar en dos regiones sin cambiar el prefijo.
