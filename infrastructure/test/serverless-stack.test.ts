import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
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
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
  });
}

describe('ServerlessStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App({ context: { corsOrigins } });
    template = Template.fromStack(createServerless(app, 'TestServerless'));
  });

  it('runs the api Lambda on Python 3.13 arm64 with the table name', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.13',
      Architectures: ['arm64'],
      Handler: 'api.handler.handler',
      Environment: { Variables: { TABLE_NAME: { 'Fn::ImportValue': Match.anyValue() } } },
      LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('ApiFunctionLogs') } },
    });
  });

  it('keeps the Lambda logs one week and deletes them with the stack', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('grants read-only access to the table', () => {
    const [policy] = Object.values(template.findResources('AWS::IAM::Policy'));
    const actions: string[] = policy.Properties.PolicyDocument.Statement.flatMap(
      (statement: { Action: string | string[] }) => statement.Action,
    );
    expect(actions).toContain('dynamodb:Query');
    expect(actions.some((action) => /Put|Update|Delete|Write/.test(action))).toBe(false);
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

  it('protects GET /books with the authorizer', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /books',
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
