import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, it } from 'vitest';
import { AuthStack } from '../lib/stacks/auth-stack.js';

describe('AuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AuthStack(app, 'TestAuth', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  it('creates an admin-only pool that signs in by email', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'LITE',
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      UsernameAttributes: ['email'],
      UsernameConfiguration: { CaseSensitive: false },
    });
  });

  it('deletes the pool when the stack is destroyed', () => {
    template.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('creates a public SRP-only client without OAuth', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
      AllowedOAuthFlows: Match.absent(),
    });
  });

  it('does not create any user', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolUser', 0);
  });

  it('exports the ids and the issuer for the API', () => {
    template.hasOutput('UserPoolId', {});
    template.hasOutput('UserPoolClientId', {});
    template.hasOutput('IssuerUrl', {});
  });
});
