# Probar la API con un access token

Valida la cadena token → authorizer → Lambda → DynamoDB (ALE-14). Requiere `ReadflowServerless` desplegado y un usuario en el User Pool.

## 1. URL de la API

```sh
API_URL=$(aws cloudformation describe-stacks --stack-name ReadflowServerless --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
```

## 2. Access token

1. Iniciar sesión en el front (local o Amplify).
2. DevTools → **Application → Local Storage** (o **Session Storage** si no se marcó "recordarme") → el origen del front.
3. Copiar el valor de la key `CognitoIdentityServiceProvider.<clientId>.<usuario>.accessToken` (no la de `idToken`).

```sh
TOKEN='<access token>'
```

El token expira en 1 h; si da `401`, recargar el front y copiarlo de nuevo. No pegarlo en issues, commits ni chats.

## 3. Llamadas

```sh
curl -i "${API_URL}books"
```

Esperado: `401 {"message":"Unauthorized"}` (lo responde API Gateway; la Lambda no se invoca).

```sh
curl -i -H "Authorization: Bearer $TOKEN" "${API_URL}books"
```

Esperado: `200 {"books": []}` sin libros cargados.

## Si falla

| Síntoma | Causa probable |
| --- | --- |
| `401` con token | Se usó el ID token, o expiró |
| `500 {"error":{"code":"internal",...}}` | Ver logs: CloudWatch → log group de `ApiFunction` en `ReadflowServerless` |
| `429` | Throttling del stage (10 rps / burst 20) |
| CORS en el navegador | El origen no está en el context `corsOrigins`; actualizar `cdk.json` y desplegar `ReadflowServerless` |
