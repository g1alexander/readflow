# frontend

Astro 7 (SSG) + Tailwind 4. Docs: https://docs.astro.build

- Dev server en background: `astro dev --background`; `astro dev stop|status|logs`.
- Tokens de diseño en `src/styles/global.css` (`@theme`).
- `Base.astro` recibe `auth="guest" | "private"` para el guard de sesión.
- Variables `PUBLIC_COGNITO_*`: en Amplify las inyecta CDK; local en `.env.local`.
