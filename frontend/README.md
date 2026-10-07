# Readflow — frontend

Astro 7 (SSG) + Tailwind 4 + TypeScript. Port de `docs/mockup/` (ALE-5).

## Comandos

| Comando | Acción |
| :-- | :-- |
| `pnpm install` | Instala dependencias |
| `pnpm dev` | Servidor local en `localhost:4321` |
| `pnpm build` | Build estático en `./dist/` |
| `pnpm preview` | Sirve el build |

## Rutas

| Ruta | Página |
| :-- | :-- |
| `/` | Login |
| `/tablero` | Tablero con los 6 estados |
| `/subir` | Subida de EPUB |
| `/libro?id=…` | Detalle del libro |

## Estructura

- `src/styles/global.css`: tokens en `@theme` y variables del patrón `data-state`.
- `src/layouts/Base.astro`, `src/components/`: layout y componentes.
- `src/scripts/`: `store.ts` (estados, datos, Kindle simulado), `ui.ts` (iconos, clases, toast), y un script por página (`login`, `board`, `upload`, `detail`).

## Estado

Datos falsos en `localStorage` (`readflow:books:v1`). Sin backend todavía. Puntos de integración:

- `login.ts` → Cognito.
- `store.ts` load/save/addBooks → API.
- `upload.ts` → presigned URL de S3. La metadata del EPUB la extrae la Lambda tras la subida, no el navegador.
- `sendToKindle` → `POST /books/:id/send-to-kindle`.
