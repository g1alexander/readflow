# infrastructure

CDK v2 en TypeScript, `us-east-1`.

| Stack | Crea |
| -- | -- |
| `ReadflowStorage` | Tabla DynamoDB `readflow` + bucket S3 de EPUB `g1-readflowstorage-epub` |
| `ReadflowMail` | Identidad SES del dominio remitente (DKIM) + registro DMARC |
| `ReadflowAuth` | Cognito User Pool + app client SRP |
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

`ReadflowFrontend` depende de `ReadflowAuth`: destruir primero `ReadflowFrontend`.

Los orígenes CORS del bucket salen del context `corsOrigins` de `cdk.json`. Si cambia el dominio del frontend, se actualiza ahí y se despliega `ReadflowStorage`.

El dominio remitente de SES sale del context `mailDomain` de `cdk.json`. Su hosted zone se crea a mano antes del primer synth ([runbook](../docs/runbooks/route53-hosted-zone-dominio-externo.md)); `fromLookup` guarda el resultado en `cdk.context.json` (gitignored, se regenera en el synth). Production access y aprobación en Kindle: [runbook](../docs/runbooks/ses-production-access.md).
