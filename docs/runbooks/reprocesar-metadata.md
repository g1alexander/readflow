# Reprocesar la metadata de un EPUB

Cuando un libro se queda en `pending`: la Lambda `metadata` falló 3 veces por algo que no es el EPUB (throttling, timeout, permisos, bug) y el evento quedó en la cola `readflow-metadata-failures` (14 días). Ver [ADR 0009](../adr/0009-lambda-metadata-eventbridge-parser-stdlib.md).

## 1. Ver los fallos

```sh
QUEUE_URL=$(aws sqs get-queue-url --queue-name readflow-metadata-failures --region us-east-1 \
  --query QueueUrl --output text)
aws sqs receive-message --queue-url "$QUEUE_URL" --region us-east-1 \
  --max-number-of-messages 10 --visibility-timeout 300 > failures.json
jq '.Messages[] | .Body | fromjson | {error: .responsePayload.errorMessage, key: .requestPayload.detail.object.key}' failures.json
```

Cada mensaje trae el evento original (`requestPayload`) y el error (`responsePayload`). También están en CloudWatch, en el log group de la Lambda `readflow-metadata`.

## 2. Corregir la causa

Desplegar el fix o esperar a que pase el problema transitorio.

## 3. Reprocesar

```sh
jq -c '.Messages[0].Body | fromjson | .requestPayload' failures.json > event.json
aws lambda invoke --function-name readflow-metadata --region us-east-1 \
  --payload fileb://event.json response.json && cat response.json
```

Esperado: `null` en `response.json` y el libro en `ready` (o `failed` si el EPUB es inválido). Si el libro ya no está `pending`, la Lambda lo ignora.

## 4. Borrar el mensaje

```sh
aws sqs delete-message --queue-url "$QUEUE_URL" --region us-east-1 \
  --receipt-handle "$(jq -r '.Messages[0].ReceiptHandle' failures.json)"
rm failures.json event.json response.json
```

Los archivos tienen keys con el `sub` del usuario: no pegarlos en issues ni chats.
