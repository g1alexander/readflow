# infrastructure

CDK v2 en TypeScript, `us-east-1`.

| Stack | Crea |
| -- | -- |
| `ReadflowStorage` | Tabla DynamoDB `readflow` + bucket S3 de EPUB `g1-readflowstorage-epub` |
| `ReadflowMail` | Identidad SES del dominio remitente (DKIM) + registro DMARC |
| `ReadflowAuth` | Cognito User Pool + app client SRP |
| `ReadflowRealtime` | AppSync Events: canal de avisos por usuario |
| `ReadflowServerless` | HTTP API + JWT authorizer de Cognito + Lambdas `api`, `metadata`, `kindle`, `notify` (código en `../serverless/src`) |
| `ReadflowFrontend` | Amplify Hosting, rama `main` en `readflow.chess-mentor.com` ([ADR 0012](../docs/adr/0012-dominio-custom-amplify-en-cdk.md)) |

```sh
pnpm build   # type-check
pnpm test
pnpm synth
pnpm diff
```

## Setup inicial

1. Instalar la Amplify GitHub App en el repo.
2. PAT classic (`admin:repo_hook`) en SSM Parameter Store como `String` `/readflow/github-token` (`aws ssm put-parameter --name /readflow/github-token --type String --value <PAT> --profile alex`).
3. `pnpm exec cdk bootstrap` y `pnpm run deploy --all`.
4. Deploy continuo: push a `main` que toque `serverless/**`, `infrastructure/**` o `.github/workflows/**` → GitHub Actions corre lint, tests y `cdk deploy --all` con OIDC ([runbook](../docs/runbooks/github-actions-oidc.md)).

`ReadflowRealtime` depende de `ReadflowAuth`; `ReadflowServerless` depende de `ReadflowStorage`, `ReadflowAuth`, `ReadflowMail` y `ReadflowRealtime`; `ReadflowFrontend` depende de `ReadflowAuth`, `ReadflowServerless` y `ReadflowRealtime`: destruir primero `ReadflowFrontend`, luego `ReadflowServerless`, luego `ReadflowRealtime`.

Los orígenes CORS del bucket salen del context `corsOrigins` de `cdk.json`. Los mismos orígenes aplican al CORS del HTTP API. El dominio del frontend sale de los context `appDomain` y `appSubdomain`; si cambia, se actualiza también `corsOrigins` y se despliegan `ReadflowFrontend`, `ReadflowStorage` y `ReadflowServerless`.

Probar la API con un token: [runbook](../docs/runbooks/probar-api-con-token.md).

El dominio remitente de SES sale del context `mailDomain` de `cdk.json`. Su hosted zone se crea a mano antes del primer synth ([runbook](../docs/runbooks/route53-hosted-zone-dominio-externo.md)); `fromLookup` guarda el resultado en `cdk.context.json` (gitignored, se regenera en el synth). Production access y aprobación en Kindle: [runbook](../docs/runbooks/ses-production-access.md).
