# Costos

Precios on-demand `us-east-1` del AWS Pricing MCP (`aws-pricing`), 2026-11-16. Free tier permanente aplicado.

Uso supuesto: 1 usuario, 10 EPUB/mes (2 MB), 1 GB en S3, 500 requests API, 10 envíos Kindle, 10 builds de 3 min, 0,2 GB servidos.

| Recurso | Costo/mes (USD) |
| -- | -- |
| Route 53 (1 hosted zone) | 0,50 |
| Amplify Hosting (30 min build + 0,2 GB servidos) | 0,33 |
| S3 (1 GB + requests) | 0,02 |
| SES (10 correos + adjuntos) | < 0,01 |
| API Gateway HTTP (500 req) | < 0,01 |
| Lambda ×4 (ARM, ~550 invocaciones) | 0,00 |
| DynamoDB (on-demand, PITR, streams) | < 0,01 |
| AppSync Events | < 0,01 |
| Cognito (Lite, 1 MAU) | 0,00 |
| SQS ×2 (DLQs) | 0,00 |
| CloudWatch (logs, 1 dashboard) | 0,00 |
| EventBridge (eventos S3, bus default) | 0,00 |

**Total: ~0,86 USD/mes**
