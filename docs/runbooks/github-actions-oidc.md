# Deploy desde GitHub Actions con OIDC

`.github/workflows/deploy.yml` corre en cada push a `main` que toque `serverless/**`, `infrastructure/**` o `.github/workflows/**`. Primero pasan `serverless` (ruff + pytest) e `infra` (type-check + vitest), y después `deploy` asume el rol `ci-cd-github-actions` por OIDC y ejecuta `cdk deploy --all`. El rol se creó a mano y no forma parte de CDK. Ver [ADR 0001](../adr/0001-monorepo-con-pipelines-por-ruta.md) y [ADR 0002](../adr/0002-iac-con-cdk-typescript.md).

## Antes de empezar

- La cuenta tiene que estar bootstrapeada con `pnpm exec cdk bootstrap` (ver `infrastructure/README.md`).

## 1. Identity provider

En IAM → Identity providers crear el provider `token.actions.githubusercontent.com`, con audiencia `sts.amazonaws.com`.

```sh
aws iam get-open-id-connect-provider --profile <PROFILE> \
  --open-id-connect-provider-arn arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com \
  --query ClientIDList
```

Esperado: `["sts.amazonaws.com"]`.

## 2. Rol `ci-cd-github-actions`

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:g1alexander@<OWNER_ID>/readflow@<REPO_ID>:ref:refs/heads/main" }
    }
  }]
}
```

GitHub manda el `sub` con los IDs inmutables del owner y del repo (`owner@id/repo@id`), no con `repo:owner/repo`. Si el trust usa el formato corto, el deploy falla con `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

Permisos del rol:

- `sts:AssumeRole` sobre los roles de bootstrap `arn:aws:iam::<ACCOUNT_ID>:role/cdk-hnb659fds-*`.
- `ssm:GetParameter` sobre el parámetro `/readflow/github-token`, que `ReadflowFrontend` lee durante el deploy.

## 3. Secret en GitHub

En Settings → Secrets and variables → Actions → Repository secrets, crear `AWS_ROLE_ARN` con el ARN del rol. Debe ir sin espacios ni salto de línea al final.

## Si falla

Si `Not authorized to perform sts:AssumeRoleWithWebIdentity` persiste, agregar temporalmente este paso en el job `deploy`, antes de `configure-aws-credentials`. Imprime los claims que compara AWS:

```yaml
- uses: actions/github-script@v7
  with:
    script: |
      const token = await core.getIDToken('sts.amazonaws.com');
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      core.info(`sub=${claims.sub} aud=${claims.aud}`);
```

El `sub` y el `aud` del log deben coincidir con los del trust policy. Quitar el paso al terminar.
