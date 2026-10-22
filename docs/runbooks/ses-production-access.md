# SES: production access y remitente aprobado en Kindle

Pasos manuales para que readflow pueda enviar EPUB a una dirección `@kindle.com` (ALE-11). Requiere `ReadflowMail` desplegado y la hosted zone delegada ([runbook](route53-hosted-zone-dominio-externo.md)).

## 1. Verificar la identidad

1. Consola AWS → **SES (us-east-1) → Configuration → Identities → `chess-mentor.com`**.
2. **Identity status** = _Verified_ y **DKIM** = _Successful_. Suele tardar minutos tras el deploy; hasta 72 h.

```sh
aws sesv2 get-email-identity --email-identity chess-mentor.com --region us-east-1 \
  --query '{verified: VerifiedForSendingStatus, dkim: DkimAttributes.Status}'
```

## 2. Prueba en sandbox

En sandbox solo se envía a destinatarios verificados.

1. **Identities → Create identity → Email address** con un correo propio; confirmar el enlace que llega.
2. **Identities → `chess-mentor.com` → Send test email**: `From` = `kindle@chess-mentor.com`, `To` = el correo verificado.
3. En el correo recibido, ver encabezados: `dkim=pass` y `dmarc=pass`.

## 3. Pedir production access

Consola → **SES → Account dashboard → Request production access**, o:

```sh
aws sesv2 put-account-details --region us-east-1 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://main.<app-id>.amplifyapp.com \
  --contact-language EN \
  --use-case-description "<texto de abajo>"
```

Texto de caso de uso:

> Readflow is a personal, single-user reading library. When I mark an EPUB as "Reading", the app sends that one file to my own Send-to-Kindle address (@kindle.com) from kindle@chess-mentor.com. Recipients are only my own Kindle address, which cannot be verified in the sandbox. Expected volume: under 10 emails per month. No marketing, no mailing lists, no third-party recipients. The domain is verified with DKIM and publishes DMARC. Bounces and complaints would only come from my own address and are monitored in the SES console.

AWS responde por correo, normalmente en 24 h. Si piden más detalle, responder en el mismo caso de soporte.

```sh
aws sesv2 get-account --region us-east-1 --query ProductionAccessEnabled
```

## 4. Aprobar el remitente en Amazon

1. amazon.com → **Cuenta → Contenido y dispositivos → Preferencias → Configuración de documentos personales: https://www.amazon.com/hz/mycd/preferences/myx#/home/settings/payment**.
2. **Lista de e-mails aprobados para documentos personales → Agregar una dirección nueva**: `kindle@chess-mentor.com`.
3. En la misma sección, anotar la dirección _Enviar a Kindle_ del dispositivo (`...@kindle.com`): es el `kindleEmail` de Settings.

## 5. Prueba final

Con production access activo: **Send test email** desde `kindle@chess-mentor.com` a la `@kindle.com`, con un EPUB adjunto. Debe aparecer en la biblioteca del Kindle en unos minutos.
