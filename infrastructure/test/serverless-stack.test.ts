import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { MailStack } from '../lib/stacks/mail-stack.js';
import { RealtimeStack } from '../lib/stacks/realtime-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const env = { account: '123456789012', region: 'us-east-1' };
const corsOrigins = ['http://localhost:4321', 'https://main.example.amplifyapp.com'];

function createServerless(app: App, id: string) {
  const storage = new StorageStack(app, `${id}Storage`, { env });
  const auth = new AuthStack(app, `${id}Auth`, { env });
  const mail = new MailStack(app, `${id}Mail`, { env });
  const realtime = new RealtimeStack(app, `${id}Realtime`, { env, userPool: auth.userPool });
  return new ServerlessStack(app, id, {
    env,
    table: storage.table,
    bucket: storage.bucket,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    emailIdentity: mail.emailIdentity,
    senderAddress: mail.senderAddress,
    eventApi: realtime.api,
    eventsEndpoint: realtime.eventsEndpoint,
  });
}

describe('ServerlessStack', () => {
  let template: Template;
  let outdir: string;

  beforeAll(() => {
    const app = new App({ context: { corsOrigins, mailDomain: 'example.com' } });
    template = Template.fromStack(createServerless(app, 'TestServerless'));
    outdir = app.synth().directory;
  });

  it.each([
    ['readflow-api', 'api'],
    ['readflow-metadata', 'metadata'],
    ['readflow-kindle', 'kindle'],
    ['readflow-notify', 'notify'],
  ])('names %s and packages only its own code plus common', (name, own) => {
    const [fn] = Object.values(
      template.findResources('AWS::Lambda::Function', { Properties: { FunctionName: name } }),
    );
    const assetDir = join(outdir, `asset.${fn.Properties.Code.S3Key.replace('.zip', '')}`);
    expect(existsSync(join(assetDir, own, 'handler.py'))).toBe(true);
    expect(existsSync(join(assetDir, 'common', 'ulid.py'))).toBe(true);
    for (const other of ['api', 'metadata', 'kindle', 'notify'].filter((dir) => dir !== own)) {
      expect(existsSync(join(assetDir, other))).toBe(false);
    }
  });

  it('runs the api Lambda on Python 3.13 arm64 with the table and bucket names', () => {
    template.resourceCountIs('AWS::Lambda::Function', 4);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.13',
      Architectures: ['arm64'],
      Handler: 'api.handler.handler',
      Environment: {
        Variables: {
          TABLE_NAME: { 'Fn::ImportValue': Match.anyValue() },
          BUCKET_NAME: { 'Fn::ImportValue': Match.anyValue() },
        },
      },
      LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('ApiFunctionLogs') } },
    });
  });

  it('runs the metadata Lambda with 512 MB and 60 s', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.13',
      Architectures: ['arm64'],
      Handler: 'metadata.handler.handler',
      MemorySize: 512,
      Timeout: 60,
      Environment: {
        Variables: {
          TABLE_NAME: { 'Fn::ImportValue': Match.anyValue() },
          BUCKET_NAME: { 'Fn::ImportValue': Match.anyValue() },
        },
      },
      LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('MetadataFunctionLogs') } },
    });
  });

  it('keeps the Lambda logs one week and deletes them with the stack', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 4);
    template.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
    template.allResources('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  function statementsOf(role: string) {
    const [policy] = Object.values(template.findResources('AWS::IAM::Policy')).filter(
      (resource) => resource.Properties.Roles[0].Ref.startsWith(role),
    );
    return policy.Properties.PolicyDocument.Statement as {
      Action: string | string[];
      Resource: unknown;
      Condition?: unknown;
    }[];
  }

  function actionsOf(role: string) {
    return statementsOf(role).flatMap((statement) => statement.Action);
  }

  it('grants the api table read/write and S3 only on the paths it uses', () => {
    const statements = statementsOf('ApiFunctionServiceRole');
    const actions = statements.flatMap((statement) => statement.Action);
    expect(actions).toEqual(
      expect.arrayContaining(['dynamodb:Query', 'dynamodb:PutItem', 's3:PutObject']),
    );
    const s3 = (action: string) =>
      JSON.stringify(statements.filter((statement) => statement.Action === action));
    expect(s3('s3:GetObject')).toContain('/users/*/cover.*');
    expect(s3('s3:DeleteObject')).toContain('/users/*/books/*');
    expect(statements).toContainEqual(
      expect.objectContaining({
        Action: 's3:ListBucket',
        Condition: { StringLike: { 's3:prefix': 'users/*' } },
      }),
    );
    expect(
      actions.filter((action) => /^s3:(Get|Delete|List)/.test(action)).sort(),
    ).toEqual(['s3:DeleteObject', 's3:GetObject', 's3:ListBucket']);
  });

  it('grants metadata table writes, EPUB reads and cover puts only', () => {
    const actions = actionsOf('MetadataFunctionServiceRole');
    expect(actions).toEqual(
      expect.arrayContaining([
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        's3:GetObject*',
        's3:PutObject',
        'sqs:SendMessage',
      ]),
    );
    expect(actions.some((action) => /^(dynamodb:(Query|Scan)|s3:Delete)/.test(action))).toBe(
      false,
    );
    const s3Resources = JSON.stringify(
      statementsOf('MetadataFunctionServiceRole').filter((statement) =>
        [statement.Action].flat().some((action) => action.startsWith('s3:')),
      ),
    );
    expect(s3Resources).toContain('/users/*/book.epub');
    expect(s3Resources).toContain('/users/*/cover.*');
  });

  it('sends failed metadata events to SQS after 2 retries', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'readflow-metadata-failures',
      MessageRetentionPeriod: 1209600,
    });
    template.hasResource('AWS::SQS::Queue', { DeletionPolicy: 'Delete' });
    template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      FunctionName: { Ref: Match.stringLikeRegexp('MetadataFunction') },
      MaximumRetryAttempts: 2,
      DestinationConfig: {
        OnFailure: {
          Destination: { 'Fn::GetAtt': [Match.stringLikeRegexp('MetadataFailures'), 'Arn'] },
        },
      },
    });
  });

  it('triggers the metadata Lambda on EPUB uploads', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['aws.s3'],
        'detail-type': ['Object Created'],
        detail: {
          bucket: { name: [{ 'Fn::ImportValue': Match.anyValue() }] },
          object: { key: [{ wildcard: 'users/*/books/*/book.epub' }] },
        },
      },
      Targets: [
        { Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('MetadataFunction'), 'Arn'] } },
      ],
    });
  });

  it('runs the kindle Lambda with 512 MB, 60 s and the sender address', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'readflow-kindle',
      Runtime: 'python3.13',
      Architectures: ['arm64'],
      Handler: 'kindle.handler.handler',
      MemorySize: 512,
      Timeout: 60,
      Environment: {
        Variables: {
          TABLE_NAME: { 'Fn::ImportValue': Match.anyValue() },
          BUCKET_NAME: { 'Fn::ImportValue': Match.anyValue() },
          SENDER_ADDRESS: 'kindle@example.com',
        },
      },
      LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('KindleFunctionLogs') } },
    });
  });

  it('consumes the table stream with the spec filter and a failure queue', () => {
    template.resourceCountIs('AWS::SQS::Queue', 2);
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'readflow-kindle-failures',
      MessageRetentionPeriod: 1209600,
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FunctionName: { Ref: Match.stringLikeRegexp('KindleFunction') },
      EventSourceArn: { 'Fn::ImportValue': Match.stringLikeRegexp('StreamArn') },
      StartingPosition: 'LATEST',
      BatchSize: 1,
      MaximumRetryAttempts: 2,
      BisectBatchOnFunctionError: true,
      DestinationConfig: {
        OnFailure: {
          Destination: { 'Fn::GetAtt': [Match.stringLikeRegexp('KindleFailures'), 'Arn'] },
        },
      },
      FilterCriteria: {
        Filters: [
          {
            Pattern: JSON.stringify({
              eventName: ['MODIFY'],
              dynamodb: {
                NewImage: {
                  entity: { S: ['BOOK'] },
                  ingest: { S: ['ready'] },
                  kindle: { M: { requestedAt: { S: [{ exists: true }] } } },
                },
              },
            }),
          },
        ],
      },
    });
  });

  it('feeds notify from the stream with BOOK modifications and lets it publish events', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'readflow-notify',
      Handler: 'notify.handler.handler',
      Environment: { Variables: { EVENTS_ENDPOINT: Match.anyValue() } },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FunctionName: { Ref: Match.stringLikeRegexp('NotifyFunction') },
      EventSourceArn: { 'Fn::ImportValue': Match.stringLikeRegexp('StreamArn') },
      StartingPosition: 'LATEST',
      MaximumRetryAttempts: 2,
      BisectBatchOnFunctionError: true,
      FilterCriteria: {
        Filters: [
          {
            Pattern: JSON.stringify({
              eventName: ['MODIFY'],
              dynamodb: { NewImage: { entity: { S: ['BOOK'] } } },
            }),
          },
        ],
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      Roles: [{ Ref: Match.stringLikeRegexp('NotifyFunctionServiceRole') }],
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'appsync:EventPublish' }),
        ]),
      },
    });
  });

  it('grants kindle item reads/writes, EPUB reads and raw SES sends on the identity only', () => {
    const statements = statementsOf('KindleFunctionServiceRole');
    const actions = statements.flatMap((statement) => statement.Action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:PutItem',
        'dynamodb:GetRecords',
        's3:GetObject',
        'ses:SendRawEmail',
        'sqs:SendMessage',
      ]),
    );
    expect(
      actions.some((action) =>
        /^(dynamodb:(Query|Scan|Delete|BatchWrite)|s3:(Put|Delete|List)|ses:SendEmail$)/.test(
          action,
        ),
      ),
    ).toBe(false);
    const resourcesOf = (action: string) =>
      JSON.stringify(statements.filter((statement) => [statement.Action].flat().includes(action)));
    expect(resourcesOf('s3:GetObject')).toContain('/users/*/books/*/book.epub');
    expect(resourcesOf('ses:SendRawEmail')).toContain(':identity/');
  });

  it('validates Cognito access tokens with a JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: [{ 'Fn::ImportValue': Match.stringLikeRegexp('WebClient') }],
        Issuer: { 'Fn::ImportValue': Match.stringLikeRegexp('ProviderURL') },
      },
    });
  });

  it.each([
    'GET /books',
    'GET /books/{id}',
    'PATCH /books/{id}',
    'DELETE /books/{id}',
    'POST /books/{id}/kindle',
    'POST /uploads',
    'GET /settings',
    'PUT /settings',
    'GET /authors',
  ])('protects %s with the authorizer', (routeKey) => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 9);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: routeKey,
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: Match.stringLikeRegexp('CognitoAuthorizer') },
    });
  });

  it('allows CORS from the configured origins', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: corsOrigins,
        AllowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        AllowHeaders: ['authorization', 'content-type'],
      },
    });
  });

  it('throttles the default stage', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it('exports the API url without a trailing slash', () => {
    template.hasOutput('ApiUrl', {
      Value: { 'Fn::GetAtt': [Match.stringLikeRegexp('HttpApi'), 'ApiEndpoint'] },
    });
  });
});
