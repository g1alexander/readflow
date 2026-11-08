# 0012 — El front se sirve en `readflow.g1alexander.com`, con el dominio declarado en CDK sobre la app Amplify

- **Status:** accepted
- **Date:** 2026-11-02
- **Scope:** infrastructure, frontend

## Context

La app Amplify (ADR 0003) solo tenía el dominio `main.<appId>.amplifyapp.com`, que cambia si la app se recrea (todo es `DESTROY`). La zona Route 53 `g1alexander.com` ya existe en la cuenta y la usa SES (ADR 0007). Los orígenes permitidos de la HTTP API y del bucket salen del context `corsOrigins` (ALE-30).

## Decision

`FrontendStack` declara `app.addDomain(appDomain).mapSubDomain(main, appSubdomain)`, con `appDomain=g1alexander.com` y `appSubdomain=readflow` en el context de `cdk.json`.

- Amplify emite el certificado administrado y crea los registros en la zona, porque está en la misma cuenta.
- `https://readflow.g1alexander.com` se agrega a `corsOrigins`; el dominio `amplifyapp.com` se mantiene.
- Cognito no cambia: login SRP sin callback URLs (ADR 0006). AppSync Events no filtra origen.

## Rejected alternatives

- **Dominio configurado a mano en la consola de Amplify** — no queda en código; se pierde al recrear la app y `cdk diff` no lo ve.
- **CloudFront propio delante de Amplify** — doble CDN y certificado propio en `us-east-1` para lo que Amplify ya resuelve.
- **Zona nueva solo para readflow** — otro NS delegado y otro costo mensual sin necesidad; la zona existente ya sirve.

## Consequences

- URL estable aunque la app Amplify se recree.
- El primer deploy espera la verificación del certificado (puede tardar ~30 min); hasta `Available` el dominio no responde.
- Cambiar de dominio exige tocar `appDomain`/`appSubdomain` y `corsOrigins` juntos.
