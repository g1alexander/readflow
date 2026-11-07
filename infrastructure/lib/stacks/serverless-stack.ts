import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IEventApi } from 'aws-cdk-lib/aws-appsync';
import type { IUserPoolClient, UserPool } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  Code,
  FilterCriteria,
  FilterRule,
  Function,
  Runtime,
  StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import type { IEmailIdentity } from 'aws-cdk-lib/aws-ses';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { join } from 'node:path';
import { resourceName } from '../config.js';
import { getCorsOrigins } from '../context.js';

export interface ServerlessStackProps extends StackProps {
  table: ITable;
  bucket: IBucket;
  userPool: UserPool;
  userPoolClient: IUserPoolClient;
  emailIdentity: IEmailIdentity;
  senderAddress: string;
  eventApi: IEventApi;
  eventsEndpoint: string;
}

export class ServerlessStack extends Stack {
  readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ServerlessStackProps) {
    super(scope, id, props);

    const functions = ['api', 'metadata', 'kindle', 'notify'];
    const code = (own: string) =>
      Code.fromAsset(join(__dirname, '../../../serverless/src'), {
        exclude: ['**/__pycache__', ...functions.filter((name) => name !== own)],
      });
    const environment = {
      TABLE_NAME: props.table.tableName,
      BUCKET_NAME: props.bucket.bucketName,
    };

    const lambdaResources = (service: string, id: string) => {
      const functionName = resourceName(service);
      return {
        functionName,
        role: new Role(this, `${id}Role`, {
          roleName: `${functionName}-role`,
          assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
          managedPolicies: [
            ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
          ],
        }),
        logGroup: new LogGroup(this, `${id}Logs`, {
          logGroupName: `/aws/lambda/${functionName}`,
          retention: RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      };
    };

    const apiFunction = new Function(this, 'ApiFunction', {
      ...lambdaResources('api', 'ApiFunction'),
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('api'),
      handler: 'api.handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment,
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
      queueName: resourceName('metadata-failures'),
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const metadataFunction = new Function(this, 'MetadataFunction', {
      ...lambdaResources('metadata', 'MetadataFunction'),
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('metadata'),
      handler: 'metadata.handler.handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
      environment,
      retryAttempts: 2,
      onFailure: new SqsDestination(metadataFailures),
    });
    props.table.grantWriteData(metadataFunction);
    props.bucket.grantRead(metadataFunction, 'users/*/book.epub');
    props.bucket.grantPut(metadataFunction, 'users/*/cover.*');

    new Rule(this, 'EpubUploaded', {
      ruleName: resourceName('epub-uploaded'),
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

    const kindleFailures = new Queue(this, 'KindleFailures', {
      queueName: resourceName('kindle-failures'),
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const kindleFunction = new Function(this, 'KindleFunction', {
      ...lambdaResources('kindle', 'KindleFunction'),
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('kindle'),
      handler: 'kindle.handler.handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
      environment: { ...environment, SENDER_ADDRESS: props.senderAddress },
    });
    props.table.grant(
      kindleFunction,
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:PutItem',
    );
    kindleFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [props.bucket.arnForObjects('users/*/books/*/book.epub')],
      }),
    );
    props.emailIdentity.grant(kindleFunction, 'ses:SendRawEmail');
    kindleFunction.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 1,
        retryAttempts: 2,
        bisectBatchOnError: true,
        onFailure: new SqsDlq(kindleFailures),
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entity: { S: FilterRule.isEqual('BOOK') },
                ingest: { S: FilterRule.isEqual('ready') },
                kindle: { M: { requestedAt: { S: FilterRule.exists() } } },
              },
            },
          }),
        ],
      }),
    );

    const notifyFunction = new Function(this, 'NotifyFunction', {
      ...lambdaResources('notify', 'NotifyFunction'),
      runtime: Runtime.PYTHON_3_13,
      architecture: Architecture.ARM_64,
      code: code('notify'),
      handler: 'notify.handler.handler',
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment: { EVENTS_ENDPOINT: props.eventsEndpoint },
    });
    props.eventApi.grantPublish(notifyFunction);
    notifyFunction.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 10,
        retryAttempts: 2,
        bisectBatchOnError: true,
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual('MODIFY'),
            dynamodb: { NewImage: { entity: { S: FilterRule.isEqual('BOOK') } } },
          }),
        ],
      }),
    );

    const api = new HttpApi(this, 'HttpApi', {
      apiName: resourceName('api'),
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
