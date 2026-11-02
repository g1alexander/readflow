import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { RealtimeStack } from '../lib/stacks/realtime-stack.js';

describe('RealtimeStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const env = { account: '123456789012', region: 'us-east-1' };
    const auth = new AuthStack(app, 'TestAuth', { env });
    const stack = new RealtimeStack(app, 'TestRealtime', { env, userPool: auth.userPool });
    template = Template.fromStack(stack);
  });

  it('subscribes with the user pool and publishes only with IAM', () => {
    template.hasResourceProperties('AWS::AppSync::Api', {
      EventConfig: {
        AuthProviders: Match.arrayWith([
          Match.objectLike({ AuthType: 'AMAZON_COGNITO_USER_POOLS' }),
          { AuthType: 'AWS_IAM' },
        ]),
        DefaultSubscribeAuthModes: [{ AuthType: 'AMAZON_COGNITO_USER_POOLS' }],
        DefaultPublishAuthModes: [{ AuthType: 'AWS_IAM' }],
      },
    });
  });

  it('rejects subscriptions to channels of other users', () => {
    const [namespace] = Object.values(
      template.findResources('AWS::AppSync::ChannelNamespace', {
        Properties: { Name: 'readflow' },
      }),
    );
    const code: string = namespace.Properties.CodeHandlers;
    expect(code).toContain("ctx.info.channel.path !== '/readflow/users/' + ctx.identity.sub");
    expect(code).toContain('util.unauthorized()');
  });

  it('is destroyed with the stack', () => {
    template.hasResource('AWS::AppSync::Api', { DeletionPolicy: 'Delete' });
    template.hasResource('AWS::AppSync::ChannelNamespace', { DeletionPolicy: 'Delete' });
  });

  it('exposes the HTTP events endpoint', () => {
    template.hasOutput('EventsEndpoint', {
      Value: {
        'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [Match.anyValue(), 'Dns.Http'] }, '/event']],
      },
    });
  });
});
