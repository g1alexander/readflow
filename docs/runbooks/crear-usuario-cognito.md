# Crear un usuario en Cognito

El User Pool no tiene registro público (`selfSignUpEnabled: false`) y el login es por email. Los usuarios se crean por CLI, y el reset de contraseña también se hace por CLI. Ver [ADR 0006](../adr/0006-login-email-password-srp-sin-hosted-ui.md).

El frontend no maneja `NEW_PASSWORD_REQUIRED`, así que el usuario tiene que quedar `CONFIRMED`, con una contraseña permanente.

## 1. Obtener el User Pool

```sh
POOL_ID=$(aws cloudformation describe-stacks --stack-name g1-readflow-auth --region us-east-1 --profile alex \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
```

## 2. Crear el usuario

```sh
EMAIL=<email>
aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --region us-east-1 --profile alex \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS
```

## 3. Fijar la contraseña

```sh
aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --region us-east-1 --profile alex \
  --username "$EMAIL" --password '<password>' --permanent
```

Este mismo comando sirve para resetear la contraseña de un usuario existente.

Esperado: `aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --region us-east-1 --profile alex --username "$EMAIL" --query UserStatus` devuelve `"CONFIRMED"`.

No hace falta crear nada en DynamoDB. Los ajustes del usuario se guardan con el primer `PUT /settings`. Hasta que configure el email de Kindle, los envíos devuelven `409 kindle_email_missing`.

## Si falla

| Síntoma | Causa probable |
| --- | --- |
| `UsernameExistsException` | El usuario ya existe; para cambiarle la contraseña, saltar al paso 3 |
| `InvalidPasswordException` | La contraseña no cumple la política por defecto de Cognito: 8+ caracteres, con mayúscula, minúscula, número y símbolo |
| Toast "Paso de inicio de sesión no soportado: CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" | Falta el paso 3: el usuario quedó en `FORCE_CHANGE_PASSWORD` |
