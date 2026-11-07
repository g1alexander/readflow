# infrastructure

CDK v2 en TypeScript, `us-east-1`.

| Stack | Crea |
| -- | -- |
| `g1-readflow-storage` | Tabla DynamoDB `g1-readflow-table` + bucket S3 de EPUB `g1-readflow-bucket` |
| `g1-readflow-mail` | Identidad SES del dominio remitente (DKIM) + registro DMARC |
| `g1-readflow-auth` | Cognito User Pool + app client SRP |
| `g1-readflow-realtime` | AppSync Events: canal de avisos por usuario |
| `g1-readflow-serverless` | HTTP API + JWT authorizer de Cognito + Lambdas `api`, `metadata`, `kindle`, `notify` (código en `../serverless/src`) |
| `g1-readflow-frontend` | Amplify Hosting, rama `main` en `readflow.chess-mentor.com` ([ADR 0012](../docs/adr/0012-dominio-custom-amplify-en-cdk.md)) |

```sh
pnpm build   # type-check
pnpm test
pnpm synth
pnpm diff
```

## Setup inicial

1. Instalar la Amplify GitHub App en el repo.
2. PAT classic (`admin:repo_hook`) en SSM Parameter Store como `String` `/g1-readflow/github-token` (`aws ssm put-parameter --name /g1-readflow/github-token --type String --value <PAT> --profile alex`).
3. `pnpm exec cdk bootstrap --profile alex` y `pnpm run deploy --all --profile alex`.
4. Deploy continuo: push a `main` que toque `serverless/**`, `infrastructure/**` o `.github/workflows/**` → GitHub Actions corre lint, tests y `cdk deploy --all` con OIDC ([runbook](../docs/runbooks/github-actions-oidc.md)).

`g1-readflow-realtime` depende de `g1-readflow-auth`; `g1-readflow-serverless` depende de `g1-readflow-storage`, `g1-readflow-auth`, `g1-readflow-mail` y `g1-readflow-realtime`; `g1-readflow-frontend` depende de `g1-readflow-auth`, `g1-readflow-serverless` y `g1-readflow-realtime`: destruir primero `g1-readflow-frontend`, luego `g1-readflow-serverless`, luego `g1-readflow-realtime`.

Los orígenes CORS del bucket salen del context `corsOrigins` de `cdk.json`. Los mismos orígenes aplican al CORS del HTTP API. El dominio del frontend sale de los context `appDomain` y `appSubdomain`; si cambia, se actualiza también `corsOrigins` y se despliegan `g1-readflow-frontend`, `g1-readflow-storage` y `g1-readflow-serverless`.

Probar la API con un token: [runbook](../docs/runbooks/probar-api-con-token.md).

El dominio remitente de SES sale del context `mailDomain` de `cdk.json`. Su hosted zone se crea a mano antes del primer synth ([runbook](../docs/runbooks/route53-hosted-zone-dominio-externo.md)); `fromLookup` guarda el resultado en `cdk.context.json` (gitignored, se regenera en el synth). Production access y aprobación en Kindle: [runbook](../docs/runbooks/ses-production-access.md).
