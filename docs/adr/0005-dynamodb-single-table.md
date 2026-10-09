# 0005 — Los datos viven en una sola tabla de DynamoDB, `readflow`, con claves genéricas

- **Status:** accepted
- **Date:** 2026-10-08
- **Scope:** storage, backend

## Context

Readflow guarda libros, autores (normalizados para que dos libros del mismo autor usen el mismo nombre), el historial de cada libro y los ajustes del usuario. Tres Lambdas escriben sobre esos datos, y la de envío a Kindle reacciona a un DynamoDB Stream. DynamoDB no tiene joins: las consultas se resuelven con el diseño de claves, y cambiar las claves de una tabla con datos implica migrarla.

## Decision

Todas las entidades viven en una tabla `readflow` con `PK`/`SK` genéricas y un atributo `entity` como discriminador.

- Libros, autores y ajustes van en la partición del usuario (`USER#<sub>`). El tablero es un único Query `begins_with(SK, "BOOK#")`.
- Los eventos del historial van en una partición por libro (`BOOK#<ulid>` / `EVENT#<ulid>`), así el tablero no los lee.
- Sin GSI mientras el tablero cargue todos los libros de una vez.

Detalle completo: [`docs/specs/modelo-de-datos.md`](../specs/modelo-de-datos.md).

## Rejected alternatives

- **Una tabla por entidad (Books, Authors, BookEvents)** — se parece a SQL y es más fácil de leer al principio, pero son tres tablas que configurar (Stream, PITR, permisos IAM), y el detalle de un libro necesita llamadas a varias tablas sin ganar nada.
- **Eventos junto al libro (`USER#<sub>` / `BOOK#<id>#EVENT#<ts>`)** — el detalle sale en un solo Query, pero el Query del tablero también devuelve todos los eventos, y DynamoDB cobra la lectura aunque se filtren. Crece con el uso, y el tablero es la consulta más frecuente.
- **Historial como lista dentro del item del libro** — cada evento reescribe el item entero (y emite un registro de Stream), y el item crece sin límite hacia los 400 KB.
- **GSI por estado desde el inicio** — duplica escrituras para una consulta (una columna sola) que la UI no hace.

## Consequences

- El tablero es 1 Query y el detalle, 2 llamadas en paralelo.
- El Stream ve todas las entidades: el consumidor filtra por `entity = BOOK` y compara la imagen vieja con la nueva en código.
- Se lee peor en la consola de AWS (claves `USER#…`/`BOOK#…`); la spec es el mapa.
- Renombrar un autor implica actualizar la copia de su nombre en cada libro.
- Agregar entidades (highlights) no requiere migrar: es un prefijo de SK nuevo.
