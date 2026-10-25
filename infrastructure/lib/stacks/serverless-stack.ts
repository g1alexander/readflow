import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IUserPoolClient, UserPool } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { config } from '../config.js';
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

    const code = (otherFunction: string) =>
      Code.fromAsset(join(__dirname, '../../../serverless/src'), {
        exclude: ['**/__pycache__', otherFunction],
      });
    const environment = {
      TABLE_NAME: props.table.tableName,
      BUCKET_NAME: props.bucket.bucketName,
    };

    const logGroup = new LogGroup(this, 'ApiFunctionLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new Function(this, 'ApiFunction', {
      functionName: `${config.appName}-api`,
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('metadata'),
      handler: 'api.handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment,
      logGroup,
    });
    props.table.grantReadWriteData(apiFunction);
    props.bucket.grantPut(apiFunction);
    apiFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [props.bucket.arnForObjects('users/*/cover.*')],
      }),
    );
    apiFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:DeleteObject'],
        resources: [props.bucket.arnForObjects('users/*/books/*')],
      }),
    );
    apiFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [props.bucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': 'users/*' } },
      }),
    );

    const metadataFailures = new Queue(this, 'MetadataFailures', {
      queueName: `${config.appName}-metadata-failures`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const metadataFunction = new Function(this, 'MetadataFunction', {
      functionName: `${config.appName}-metadata`,
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('api'),
      handler: 'metadata.handler.handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
      environment,
      logGroup: new LogGroup(this, 'MetadataFunctionLogs', {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      retryAttempts: 2,
      onFailure: new SqsDestination(metadataFailures),
    });
    props.table.grantWriteData(metadataFunction);
    props.bucket.grantRead(metadataFunction, 'users/*/book.epub');
    props.bucket.grantPut(metadataFunction, 'users/*/cover.*');

    new Rule(this, 'EpubUploaded', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [props.bucket.bucketName] },
          object: { key: [{ wildcard: 'users/*/books/*/book.epub' }] },
        },
      },
      targets: [new LambdaFunction(metadataFunction)],
    });

    const api = new HttpApi(this, 'HttpApi', {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: getCorsOrigins(this),
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
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

    const routes: [string, HttpMethod[]][] = [
      ['/books', [HttpMethod.GET]],
      ['/books/{id}', [HttpMethod.GET, HttpMethod.PATCH, HttpMethod.DELETE]],
      ['/books/{id}/kindle', [HttpMethod.POST]],
      ['/uploads', [HttpMethod.POST]],
      ['/settings', [HttpMethod.GET, HttpMethod.PUT]],
      ['/authors', [HttpMethod.GET]],
    ];
    for (const [path, methods] of routes) {
      api.addRoutes({ path, methods, integration, authorizer });
    }

    this.apiUrl = api.apiEndpoint;

    new CfnOutput(this, 'ApiUrl', { value: this.apiUrl });
  }
}
