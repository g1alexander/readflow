# 0003 — La app de Amplify Hosting se crea desde CDK, no desde la consola

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** frontend, infrastructure

## Context

El frontend necesita valores que solo existen tras desplegar la infraestructura: URL de la API, User Pool ID y Client ID de Cognito. Si la app de Amplify se conecta a mano, esos valores se copian a mano y quedan fuera del código.

## Decision

CDK crea la app de Amplify (`@aws-cdk/aws-amplify-alpha`) conectada a GitHub y le inyecta como variables de entorno los outputs de Cognito y API Gateway.

## Rejected alternatives

- **Conectar Amplify en la consola y copiar outputs** — más rápido la primera vez, pero la configuración no está en el repo y cada cambio de recurso exige actualizar variables a mano.
- **Frontend en S3 + CloudFront vía CDK** — control total, pero se pierden previews, builds y conexión a Git que Amplify da gratis.

## Consequences

- Toda la configuración del frontend es reproducible con `cdk deploy`.
- El construct de Amplify es alpha: su API puede cambiar entre versiones.
- CDK necesita un token de GitHub (en Secrets Manager) para conectar el repo.

## Notas

- 2026-10-06 (ALE-7): la conexión usa la GitHub App de Amplify mediante `AccessToken`, no `OauthToken`, que es el flujo legacy de webhook + deploy key. `GitHubSourceCodeProvider` del alpha solo emite `oauthToken`, así que existe un provider propio: `infrastructure/lib/constructs/github-app-source-code-provider.ts`. El secreto `readflow/github-token` guarda un PAT classic con scope `admin:repo_hook`, que solo se usa al crear o actualizar la app.
