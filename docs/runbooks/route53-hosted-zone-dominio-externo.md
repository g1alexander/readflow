# Crear una hosted zone en Route 53 con el dominio en otro registrador

Para cuando el dominio está comprado fuera de AWS (GoDaddy, Namecheap, Cloudflare…) y se quiere que su DNS lo maneje Route 53. En readflow se usa con `chess-mentor.com`, el dominio remitente de SES (ALE-11).

La zona se crea a mano, fuera de CDK: así los nameservers no cambian aunque se destruya y recree un stack. CDK la importa con `HostedZone.fromLookup`.

Costo: USD 0.50/mes por hosted zone desde que se crea.

## Antes de empezar

Cambiar los nameservers mueve **todo** el DNS del dominio a Route 53. Si el dominio tiene registros en uso en el registrador (web, correo, verificaciones), cópialos a la hosted zone antes del paso 3, o dejarán de resolver.

## 1. Crear la hosted zone

1. Consola AWS → **Route 53 → Hosted zones → Create hosted zone**. Route 53 es global; la región no importa.
2. **Domain name:** `<dominio>` (por ejemplo `chess-mentor.com`).
3. **Type:** `Public hosted zone`.
4. **Create hosted zone**.

## 2. Copiar los nameservers

1. Abre la zona. Trae 2 registros: **NS** y **SOA**.
2. Copia los 4 valores del registro **NS**, del estilo:

   ```
   ns-123.awsdns-45.com.
   ns-678.awsdns-12.net.
   ns-901.awsdns-34.org.
   ns-2345.awsdns-56.co.uk.
   ```

3. Si el registrador no acepta el punto final, quítalo.

## 3. Delegar en el registrador

1. Panel del registrador → sección **Nameservers** / **DNS** del dominio.
2. Elige **Custom nameservers** (usar DNS propios), no los del registrador.
3. Pega los 4 NS de AWS, uno por campo, y guarda.

## 4. Verificar

```sh
dig NS <dominio> +short
```

- Devuelve los 4 `awsdns-...` → listo.
- Siguen los del registrador → esperar; suele tardar de minutos a horas, máximo 48 h.

Una vez propagado, `cdk synth` puede resolver la zona con `fromLookup`.
