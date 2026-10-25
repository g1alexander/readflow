# 0008 — La API es un HTTP API con una sola Lambda Python que despacha por `routeKey`

- **Status:** accepted
- **Date:** 2026-10-23
- **Scope:** infrastructure, serverless

## Context

El front necesita una API autenticada con Cognito para libros, subidas y ajustes (ALE-14, ALE-15, ALE-17). Hay un único usuario y poco tráfico: cold starts y costo pesan más que el aislamiento por ruta. ADR 0001 fija `Code.fromAsset` sin pipeline propio para las Lambdas.

## Decision

- **API Gateway HTTP API** con `HttpJwtAuthorizer`: issuer = el User Pool, audience = el app client `WebClient`. El front manda el access token.
- **Una Lambda `api`** (Python 3.13, arm64) para todas las rutas. `serverless/src/api/handler.py` despacha por `event["routeKey"]` a funciones en `api/routes/`; sin Powertools ni framework.
- **Empaquetado:** `Code.fromAsset("serverless/src")`, sin Docker ni bundling. `boto3` viene en el runtime. Deps nativas futuras → Layer.
  - *Enmienda 2026-10-25:* cada Lambda usa el mismo `serverless/src` con un `exclude` de las carpetas de las otras Lambdas, y todas incluyen `common/`. Así cada zip lleva solo su código y un cambio en una Lambda no redespliega las demás. Nombre fijo `${config.appName}-<función>` (`readflow-api`, `readflow-metadata`) en lugar del nombre generado con hash.
- Stage `$default` con throttling 10 rps / burst 20. LogGroup de la Lambda con retención de 1 semana y `DESTROY`.
- `ServerlessStack` recibe `table`, `userPool` y `userPoolClient` por props y expone `apiUrl`, que llega a Amplify como `PUBLIC_API_URL`.
- Contrato: [`docs/specs/api.md`](../specs/api.md).

## Rejected alternatives

- **REST API** — más cara por request y con funciones (API keys, usage plans, transformaciones) que no se usan.
- **Una Lambda por ruta** — más cold starts y más recursos que mantener; el tamaño del zip lo definen las deps, no las rutas.
- **`aws-lambda-python-alpha` / bundling con Docker** — Docker en cada synth para un código sin deps de runtime.
- **Powertools / framework de routing** — una dependencia más para un `dict` de rutas.
- **ID token en el authorizer** — el access token es el pensado para APIs; API Gateway valida su `client_id`.

## Consequences

- Todas las rutas comparten el rol IAM: cada ruta nueva puede ampliar permisos de las demás. Hoy es solo lectura de la tabla.
- Si una dep requiere compilación o crece el zip, hay que introducir un Layer o bundling.
- El throttling es un tope de costo ante un token filtrado, no una cuota por usuario.
- El `401` del authorizer no sigue el formato de error de la spec.
