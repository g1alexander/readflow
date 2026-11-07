# 0014 — Los stacks storage y auth no se borran con `cdk destroy`

- **Status:** accepted
- **Date:** 2026-11-07
- **Scope:** infrastructure

## Context

Hasta ahora todo era `DESTROY` (ADR 0004, ADR 0006), así que `cdk destroy --all` borraba la tabla, el bucket (EPUB, portadas y highlights) y el user pool. Aunque la tabla sobreviviera, recrear el pool les da a los usuarios otro `sub`, y los datos `USER#<sub>` quedan sin dueño. La tabla, el bucket y el pool tienen nombre fijo (ADR 0013): si quedan huérfanos fuera de un stack, el siguiente deploy falla con "already exists".

## Decision

Los stacks `g1-readflow-storage` y `g1-readflow-auth` tienen `terminationProtection`, y la tabla, el bucket y el user pool usan `RemovalPolicy.RETAIN`. El bucket no tiene `autoDeleteObjects`.

- `cdk destroy --all` borra los stacks que dependen de estos dos y después falla en storage y en auth. Los datos y los stacks siguen vivos, y el siguiente deploy funciona sin pasos manuales.
- `RETAIN` es el respaldo por si alguien desactiva la protección del stack: el recurso queda huérfano en vez de borrarse.
- Para borrar de verdad: desactivar la protección del stack, borrar el stack y después borrar los recursos a mano.

## Rejected alternatives

- **Solo `RETAIN`** — el destroy deja recursos huérfanos con nombre fijo, y el siguiente deploy falla hasta hacer `cdk import` o borrarlos a mano.
- **Proteger solo storage** — destruir auth cambia el `sub` y deja huérfanos los datos de todos los usuarios.
- **`deletionProtection` en la tabla** — protege contra el borrado desde la consola o la CLI, que no es el riesgo que se busca cubrir.

## Consequences

- Los datos y los usuarios sobreviven a un `cdk destroy --all`.
- `cdk destroy --all` termina con error en storage y en auth, y es lo esperado.
