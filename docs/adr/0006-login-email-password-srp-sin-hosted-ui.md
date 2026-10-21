# 0006 — El login es email + contraseña con SRP desde la UI propia, sin Hosted UI

- **Status:** accepted
- **Date:** 2026-10-21
- **Scope:** auth, frontend, infrastructure

## Context

Readflow tiene un único usuario y no permite registro. La API (ALE-14) valida el JWT de Cognito y todo el modelo de datos usa el claim `sub` como clave (`USER#<sub>`). El mockup mostraba un "enlace mágico", que Cognito no ofrece de forma nativa. El frontend es un sitio estático de Astro y no puede guardar secretos.

## Decision

El frontend inicia sesión con email + contraseña contra un User Pool de Cognito (plan Lite), con el flujo `USER_SRP_AUTH` de `aws-amplify/auth` v6 y la UI propia de `/`.

- Pool solo para admins (`selfSignUpEnabled: false`), con login por email. El usuario se crea por CLI: [`docs/runbooks/crear-usuario-cognito.md`](../runbooks/crear-usuario-cognito.md).
- App client público, sin secret, solo SRP y sin OAuth.
- `AuthStack` pasa los IDs a `FrontendStack` por props, y este los inyecta en Amplify como `PUBLIC_COGNITO_USER_POOL_ID` y `PUBLIC_COGNITO_USER_POOL_CLIENT_ID`.
- "Mantener la sesión" elige dónde se guardan los tokens: `localStorage` (por defecto) o `sessionStorage`.

## Rejected alternatives

- **Magic link** — no es nativo: requiere custom auth con 3 Lambdas (define/create/verify challenge) más el envío de correo. Es mucho código para un solo usuario.
- **Email OTP sin contraseña** — es nativo, pero exige el plan Essentials y cambiar la UI a un flujo de código de un solo uso.
- **Managed login / Hosted UI (OAuth + PKCE)** — descarta la UI propia, y las callback URLs dependen del dominio de Amplify, lo que crea una dependencia circular `auth ↔ frontend`.
- **`fetch` directo a `InitiateAuth` con `USER_PASSWORD_AUTH`** — no agrega dependencias, pero la contraseña viaja a Cognito, y el refresco y el almacenamiento de tokens quedan a mano.
- **Crear el usuario con `CfnUserPoolUser` en CDK** — el email quedaría en el repo, y cambiar cualquier propiedad reemplaza al usuario, con un `sub` nuevo.

## Consequences

- No hay Lambdas ni SES: Cognito Lite y Amplify Auth cubren login, refresco y logout.
- El chunk de auth suma unos 120 KB sin comprimir a la página de login.
- El pool tiene `RemovalPolicy.DESTROY`: `cdk destroy` borra el usuario, y al recrearlo cambia el `sub`, con lo que los datos `USER#<sub>` quedan huérfanos. Se acepta mientras no haya datos reales.
- El guard es del lado del cliente (oculta el `body` hasta validar la sesión). La protección real de los datos es el JWT authorizer de la API.
- No hay recuperación de contraseña desde la UI: se resetea por CLI.
