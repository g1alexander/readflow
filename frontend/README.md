# frontend

Astro 7 (SSG) + Tailwind 4 + TypeScript.

```sh
pnpm install
pnpm dev      # localhost:8080
pnpm build    # ./dist
```

- Auth: Cognito email + contraseña (SRP), [ADR 0006](../docs/adr/0006-login-email-password-srp-sin-hosted-ui.md). Local: copiar `.env.example` a `.env.local`.
- Datos: falsos en `localStorage`, sin backend aún.
