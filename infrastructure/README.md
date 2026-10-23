# infrastructure

CDK v2 en TypeScript, `us-east-1`.

| Stack | Crea |
| -- | -- |
| `ReadflowStorage` | Tabla DynamoDB `readflow` + bucket S3 de EPUB `g1-readflowstorage-epub` |
| `ReadflowMail` | Identidad SES del dominio remitente (DKIM) + registro DMARC |
| `ReadflowAuth` | Cognito User Pool + app client SRP |
| `ReadflowServerless` | HTTP API + JWT authorizer de Cognito + Lambda `api` (código en `../serverless/src`) |
| `ReadflowFrontend` | Amplify Hosting, rama `main` |

```sh
pnpm build   # type-check
pnpm test
pnpm synth
pnpm diff
```

## Setup inicial

1. Instalar la Amplify GitHub App en el repo.
2. PAT classic (`admin:repo_hook`) en Secrets Manager como `readflow/github-token`.
3. `pnpm exec cdk bootstrap` y `pnpm deploy --all`.

`ReadflowServerless` depende de `ReadflowStorage` y `ReadflowAuth`; `ReadflowFrontend` depende de `ReadflowAuth` y `ReadflowServerless`: destruir primero `ReadflowFrontend`, luego `ReadflowServerless`.

Los orígenes CORS del bucket salen del context `corsOrigins` de `cdk.json`. Los mismos orígenes aplican al CORS del HTTP API. Si cambia el dominio del frontend, se actualiza ahí y se despliegan `ReadflowStorage` y `ReadflowServerless`.

Probar la API con un token: [runbook](../docs/runbooks/probar-api-con-token.md).

El dominio remitente de SES sale del context `mailDomain` de `cdk.json`. Su hosted zone se crea a mano antes del primer synth ([runbook](../docs/runbooks/route53-hosted-zone-dominio-externo.md)); `fromLookup` guarda el resultado en `cdk.context.json` (gitignored, se regenera en el synth). Production access y aprobación en Kindle: [runbook](../docs/runbooks/ses-production-access.md).
