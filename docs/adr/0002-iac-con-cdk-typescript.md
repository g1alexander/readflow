# 0002 — La infraestructura se define con AWS CDK en TypeScript

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** infrastructure

## Context

Los recursos (Cognito, API Gateway HTTP API, Lambda, DynamoDB con Streams, S3, SES, Amplify) deben estar en código para poder recrearlos y revisarlos. El frontend ya está en TypeScript y las Lambdas en Python.

## Decision

`infrastructure/` es una app de AWS CDK v2 en TypeScript, desplegada con `cdk deploy` desde GitHub Actions autenticado por OIDC (rol IAM, sin access keys).

## Rejected alternatives

- **CDK en Python** — mismo lenguaje que las Lambdas, pero menos ejemplos y tipado más débil en los constructs; TypeScript es el lenguaje de referencia de CDK.
- **Terraform** — agrega HCL y gestión de state propia; CDK sobre CloudFormation es más directo para aprender AWS.
- **SAM / Serverless Framework** — centrados en Lambda; Amplify y Cognito quedarían a medias.
- **Consola a mano** — no reproducible ni revisable.

## Consequences

- Dos lenguajes en el repo: TS (front + infra) y Python (Lambdas).
- Requiere `cdk bootstrap` una vez por cuenta/región.
- El estado vive en CloudFormation: cambios manuales en consola generan drift.
