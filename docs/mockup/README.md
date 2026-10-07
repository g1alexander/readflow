# Readflow — mockup en HTML, CSS y JS

> Referencia histórica. El front real está en `frontend/` (Astro, ver `frontend/README.md`). Ahí no se usa JSZip: la metadata del EPUB la extrae la Lambda tras subir a S3.

Abre `index.html` en el navegador. No necesita instalación ni servidor.

## Archivos

- `index.html`: iniciar sesión
- `tablero.html`: tablero con los 6 estados (arrastrar y soltar en escritorio, pestañas y pulsación larga en móvil)
- `subir.html`: subir uno o varios EPUB y leer su título, autor y portada
- `libro.html?id=…`: detalle del libro, estado, envío al Kindle y notas
- `styles.css`: paleta pastel, tipografías y componentes (variables en `:root`)
- `app.js`: datos, estados, envío al Kindle y lectura de EPUB

## Qué funciona ya

- Mover libros entre estados, con búsqueda por título o autor.
- Lectura real de metadata y portada del EPUB en el navegador (usa JSZip desde cdnjs).
- Los datos se guardan en el `localStorage` del navegador.

## Qué falta conectar (busca `// BACKEND:` en app.js)

- Autenticación real del login.
- Guardar los EPUB en un servidor (hoy solo se guarda la metadata).
- El envío al Kindle: está simulado. El servidor debe mandar el EPUB por email a tu
  dirección de Send to Kindle, que además debe tener tu remitente en la lista aprobada de Amazon.
- Importar highlights y exportar a Obsidian o GitHub.

Para empezar de cero con los datos de ejemplo, borra la clave `readflow:books:v1` del localStorage.
