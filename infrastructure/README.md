# infrastructure

CDK v2 en TypeScript ([ADR 0002](../docs/adr/0002-iac-con-cdk-typescript.md)). Región `us-east-1`.

## Stacks

| Stack | Qué crea |
| -- | -- |
| `ReadflowFrontend` | App de Amplify Hosting conectada a `g1alexander/readflow`, rama `main` con auto-build ([ADR 0003](../docs/adr/0003-amplify-app-creada-en-cdk.md)) |

## Estructura

```
bin/readflow.ts      # instancia los stacks y pasa outputs entre ellos por props
lib/config.ts        # región, repo, nombres de secretos
lib/stacks/          # un stack por dominio: storage, auth, backend, frontend, pipeline
lib/constructs/      # piezas reutilizables sin lógica de dominio
test/                # vitest + aws-cdk-lib/assertions, un archivo por stack
```

## Comandos

```sh
pnpm install
pnpm build    # type-check
pnpm test
pnpm synth
pnpm diff
pnpm deploy
```

## Pasos manuales (una sola vez)

1. Instalar la Amplify GitHub App en el repo: https://github.com/apps/aws-amplify-us-east-1/installations/new
2. Crear un PAT classic con scope `admin:repo_hook`.
3. Guardarlo en Secrets Manager:
   ```sh
   aws secretsmanager create-secret --name readflow/github-token --secret-string '<PAT>' --region us-east-1
   ```
4. `pnpm exec cdk bootstrap aws://<ACCOUNT>/us-east-1`
5. `pnpm deploy`
6. Verificar el primer build de `main` en la consola de Amplify.

## Notas

- La conexión usa `AccessToken` (GitHub App), no `OauthToken`. `GitHubSourceCodeProvider` del alpha solo emite `oauthToken`, por eso existe `lib/constructs/github-app-source-code-provider.ts`.
- El PAT solo se usa al crear o actualizar la app; no se almacena en Amplify.
