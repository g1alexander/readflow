import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IUserPoolClient, UserPool } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { getCorsOrigins } from '../context.js';

export interface ServerlessStackProps extends StackProps {
  table: ITable;
  bucket: IBucket;
  userPool: UserPool;
  userPoolClient: IUserPoolClient;
}

export class ServerlessStack extends Stack {
  readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ServerlessStackProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, 'ApiFunctionLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new Function(this, 'ApiFunction', {
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(join(__dirname, '../../../serverless/src'), {
        exclude: ['**/__pycache__'],
      }),
      handler: 'api.handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName,
      },
      logGroup,
    });
    props.table.grantReadWriteData(apiFunction);
    props.bucket.grantPut(apiFunction);

    const api = new HttpApi(this, 'HttpApi', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: getCorsOrigins(this),
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
        ],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    api.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });

    const authorizer = new HttpJwtAuthorizer('CognitoAuthorizer', props.userPool.userPoolProviderUrl, {
      jwtAudience: [props.userPoolClient.userPoolClientId],
    });
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFunction);

    api.addRoutes({
      path: '/books',
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });

    api.addRoutes({
      path: '/uploads',
      methods: [HttpMethod.POST],
      integration,
      authorizer,
    });

    this.apiUrl = api.apiEndpoint;

    new CfnOutput(this, 'ApiUrl', { value: this.apiUrl });
  }
}
