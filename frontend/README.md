# frontend

Astro 7 (SSG) + Tailwind 4 + TypeScript

```sh
pnpm install
pnpm dev      # localhost:8080
pnpm build    # ./dist
```

- Producción: `https://readflow.chess-mentor.com` ([ADR 0012](../docs/adr/0012-dominio-custom-amplify-en-cdk.md)).
- Auth: Cognito email + contraseña (SRP), [ADR 0006](../docs/adr/0006-login-email-password-srp-sin-hosted-ui.md). Local: copiar `.env.example` a `.env.local`.
- Datos: HTTP API (`PUBLIC_API_URL`), [spec](../docs/specs/api.md).
- Avisos en tiempo real: AppSync Events (`PUBLIC_EVENTS_ENDPOINT`), sin polling, [spec](../docs/specs/realtime.md).
