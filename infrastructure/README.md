# infrastructure

CDK v2 en TypeScript, `us-east-1`.

| Stack | Crea |
| -- | -- |
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
3. `pnpm exec cdk bootstrap` y `pnpm deploy`.

`ReadflowFrontend` depende de `ReadflowAuth`: destruir primero `ReadflowFrontend`.
