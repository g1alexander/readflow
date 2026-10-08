# Mejoras

## Status 404 real en rutas inexistentes

**Estado actual (ALE-8):** la regla de Amplify `/<*>` → `/404.html` usa `RedirectStatus.NOT_FOUND` (`404`). Una ruta inexistente responde `302` → `/404.html` y esa página se sirve con `200`. La URL del navegador cambia a `/404.html`. Las rutas sin barra final pasan antes por un `301` a `/ruta/`.

**Impacto:** bajo mientras la app sea personal y no esté indexada. Un crawler o un monitor ve `200`, no `404`.

**Posible solución:** cambiar el status a `RedirectStatus.NOT_FOUND_REWRITE` (`404-200`) en `infrastructure/lib/stacks/frontend-stack.ts`. Debería servir `404.html` conservando la URL original y responder `404`. No está verificado: validar con `curl -I` tras el deploy.
