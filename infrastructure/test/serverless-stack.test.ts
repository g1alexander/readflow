import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const env = { account: '123456789012', region: 'us-east-1' };
const corsOrigins = ['http://localhost:4321', 'https://main.example.amplifyapp.com'];

function createServerless(app: App, id: string) {
  const storage = new StorageStack(app, `${id}Storage`, { env });
  const auth = new AuthStack(app, `${id}Auth`, { env });
  return new ServerlessStack(app, id, {
    env,
    table: storage.table,
    bucket: storage.bucket,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
  });
}

describe('ServerlessStack', () => {
  let template: Template;
  let outdir: string;

  beforeAll(() => {
    const app = new App({ context: { corsOrigins } });
    template = Template.fromStack(createServerless(app, 'TestServerless'));
    outdir = app.synth().directory;
  });

  it.each([
    ['readflow-api', 'api', 'metadata'],
    ['readflow-metadata', 'metadata', 'api'],
  ])('names %s and packages only its own code plus common', (name, own, other) => {
    const [fn] = Object.values(
      template.findResources('AWS::Lambda::Function', { Properties: { FunctionName: name } }),
    );
    const assetDir = join(outdir, `asset.${fn.Properties.Code.S3Key.replace('.zip', '')}`);
    expect(existsSync(join(assetDir, own, 'handler.py'))).toBe(true);
    expect(existsSync(join(assetDir, 'common', 'ulid.py'))).toBe(true);
    expect(existsSync(join(assetDir, other))).toBe(false);
  });

  it('runs the api Lambda on Python 3.13 arm64 with the table and bucket names', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
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
    template.resourceCountIs('AWS::Logs::LogGroup', 2);
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
    }[];
  }

  function actionsOf(role: string) {
    return statementsOf(role).flatMap((statement) => statement.Action);
  }

  it('grants the api table read/write and S3 put, without S3 read or delete', () => {
    const actions = actionsOf('ApiFunctionServiceRole');
    expect(actions).toEqual(
      expect.arrayContaining(['dynamodb:Query', 'dynamodb:PutItem', 's3:PutObject']),
    );
    expect(actions.some((action) => /^s3:(Get|Delete)/.test(action))).toBe(false);
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

  it.each(['GET /books', 'POST /uploads'])('protects %s with the authorizer', (routeKey) => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 2);
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
        AllowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
