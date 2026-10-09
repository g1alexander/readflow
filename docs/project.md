# Readflow

## Canvas del proyecto

**Nombre del proyecto:** Readflow

**Problema que resuelve:** Gestiono mi biblioteca y mi proceso de lectura con varias herramientas y automatizaciones sueltas. Readflow centraliza ese flujo en una sola app web: subo el libro, sigo en qué estado de lectura está y llega al Kindle sin pasos manuales.

**Quién lo usa:** Solo yo. Un único usuario.

**Funcionalidad 1 — Gestión de libros:** subir uno o varios archivos EPUB, extraer automáticamente su metadata (título, autor, portada) y agregarlos a la biblioteca personal.

**Funcionalidad 2 — Estados de lectura:** organizar los libros en To Read, Up Next, Reading, On Hold, Finished y Dropped, y moverlos entre estados durante el proceso de lectura.

**Funcionalidad 3 — Envío al Kindle:** almacenar los EPUB y enviarlos automáticamente por email al Kindle cuando un libro pasa a Reading.

**Funcionalidad 4 (opcional) — Notas de lectura:** importar los highlights generados en Kindle, procesarlos y guardarlos como documentos Markdown en Obsidian/GitHub. El mecanismo de importación está por definir; hoy lo hago manual con un agente.

**Funcionalidad 5 (opcional):** —

**Frontend (tecnología):** Astro + TypeScript, sitio estático (SSG) desplegado con AWS Amplify Hosting.

**Backend (lenguaje):** Python sobre AWS Lambda.

**Servicios de AWS que usa:**

| Servicio | Para qué |
| --- | --- |
| Route 53 | DNS del dominio propio |
| Amplify Hosting | Build, CDN y deploy continuo del sitio Astro estático |
| Cognito | Login (User Pool). Emite el JWT que valida la API |
| API Gateway (HTTP API) | Puerta de entrada de la API, con JWT authorizer de Cognito |
| Lambda | Lógica de negocio: URL prefirmada, CRUD de libros y estados, extracción de metadata, envío al Kindle |
| DynamoDB | Tabla `readflow` (single-table): libros, autores, historial y ajustes. Streams habilitado. Ver [modelo de datos](./specs/modelo-de-datos.md) |
| S3 | Almacenamiento de los EPUB |
| SES | Envío del email con el EPUB adjunto al Kindle |
| CloudWatch | Logs y métricas |

## Decisiones de arquitectura

Ver el diagrama en [`architecture.drawio`](./architecture.drawio).

- **Subida con URL prefirmada.** El EPUB viaja directo del navegador a S3 sin pasar por Lambda ni API Gateway, así evito el límite de payload de ~6 MB y no pago tiempo de cómputo por mover bytes.
- **Envío al Kindle event-driven.** El cambio de estado a Reading queda en DynamoDB y Streams dispara la Lambda que arma el correo, en vez de enviarlo dentro de la misma llamada a la API. Si SES falla se reintenta sin romper la respuesta al usuario.
- **SES en vez de SNS.** SNS no envía adjuntos ni entrega a direcciones que no confirmaron la suscripción, así que no sirve para el envío al Kindle.
- **Python en el backend** aunque el frontend sea TypeScript: `ebooklib` resuelve el parseo del EPUB directamente, y empaquetar dependencias con binarios en layers de Lambda es parte de lo que quiero aprender.

## Pendientes por definir

- Cómo se exportan los highlights desde el Kindle para la funcionalidad 4. Lo resuelvo al final, es opcional.

## Brief inicial

Respuestas a las preguntas del brief:

- ¿Cuál es tu nivel de experiencia?
  Trabajo en frontend, backend y AWS. En este último llevo mes y medio y es justo lo que quiero profundizar más
- ¿Qué problema resuelve tu webapp?
  Tengo un sistema personal que he ido construyendo para gestionar mi biblioteca y mi proceso de lectura utilizando diferentes herramientas y automatizaciones. El objetivo del proyecto es llevar este sistema a una app web centralizando un poco más el flujo y aprovechándolo como un proyecto práctico para aprender AWS
- ¿Quién la va a usar?
  por ahora es solo para mí
- ¿Qué funcionalidades principales va a tener?
  - Gestión de libros: subir uno o varios archivos EPUB, extraer automáticamente su metadata y agregarlos a la biblioteca personal.
  - Gestión del estado de lectura: organizar los libros según su estado (To Read, Up Next, Reading, On Hold, Finished y Dropped) y moverlos entre estos estados durante el proceso de lectura.
  - Envío al Kindle: almacenar los EPUB y permitir enviarlos automáticamente al Kindle mediante correo electrónico cuando un libro pasa a Reading.
  - Gestión de notas de lectura: importar las notas y highlights generados en Kindle, procesarlos y almacenarlos como documentos Markdown en Obsidian/GitHub.
    Con esta última una salvedad, es algo que me gustaría. Actualmente lo hago manual y lo corro via un agente, entonces lo voy a poner como deseable, porque no lo tengo muy claro aún.
- ¿Qué tecnologías pensás usar?
  Astro y TypeScript
