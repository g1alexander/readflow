# 0007 — El remitente de SES es `kindle@` de un dominio propio con DNS en Route 53

- **Status:** accepted
- **Date:** 2026-10-22
- **Scope:** infrastructure, mail

## Context

El envío a Kindle (ALE-18) sale por SES hacia una dirección `@kindle.com`. Amazon solo acepta remitentes de la *Approved Personal Document E-mail List* y rechaza correos que fallan DMARC. En sandbox SES solo envía a destinatarios verificados, y una `@kindle.com` no se puede verificar: hace falta production access, que AWS aprueba a mano. El único usuario es el dueño.

## Decision

SES envía desde `kindle@chess-mentor.com`, con identidad de dominio verificada por Easy DKIM.

- El dominio está registrado fuera de AWS; su DNS se delega a una hosted zone pública de Route 53 creada a mano ([runbook](../runbooks/route53-hosted-zone-dominio-externo.md)), fuera de CDK.
- `MailStack` importa la zona con `HostedZone.fromLookup` (context `mailDomain` en `cdk.json`), crea `ses.EmailIdentity` con `Identity.publicHostedZone` (los CNAME de DKIM) y un TXT `_dmarc` con `p=none`.
- `cdk.context.json` no se commitea: se regenera en cada synth con credenciales AWS.
- `MailStack` expone `emailIdentity` y `senderAddress`; la Lambda de envío los recibe por props.

## Rejected alternatives

- **Identidad de email Gmail vía SES** — el `From` `@gmail.com` firmado por SES falla DMARC de Gmail (`p=quarantine`/`reject`) y Amazon lo descarta.
- **SMTP de Gmail desde la Lambda** — saca el envío de SES, exige guardar una app password y queda sujeto a los límites de Gmail.
- **Hosted zone creada en CDK** — con `RemovalPolicy.DESTROY`, destruir `MailStack` cambia los nameservers y obliga a re-delegar en el registrador.
- **Dominio registrado en Route 53** — se descartó porque el dominio ya existe en otro registrador.

## Consequences

- USD 0.50/mes de hosted zone; el dominio se paga en el registrador externo.
- La zona debe existir antes del primer `cdk synth`; sin ella `fromLookup` falla. Sin `cdk.context.json` local, el synth necesita credenciales AWS.
- Production access y la aprobación del remitente en Amazon son pasos manuales: [`ses-production-access.md`](../runbooks/ses-production-access.md).
- Sin custom MAIL FROM: el `Return-Path` es de `amazonses.com`; DMARC se alinea por DKIM.
