import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AppSyncAuthorizationType, Code, EventApi, type IEventApi } from 'aws-cdk-lib/aws-appsync';
import type { IUserPool } from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import { resourceName } from '../config.js';

export interface RealtimeStackProps extends StackProps {
  userPool: IUserPool;
}

export const EVENTS_NAMESPACE = 'readflow';

const onSubscribe = `
export function onSubscribe(ctx) {
  if (ctx.info.channel.path !== '/${EVENTS_NAMESPACE}/users/' + ctx.identity.sub) {
    util.unauthorized();
  }
}
`;

export class RealtimeStack extends Stack {
  readonly api: IEventApi;
  readonly eventsEndpoint: string;

  constructor(scope: Construct, id: string, props: RealtimeStackProps) {
    super(scope, id, props);

    const api = new EventApi(this, 'EventApi', {
      apiName: resourceName('events'),
      authorizationConfig: {
        authProviders: [
          {
            authorizationType: AppSyncAuthorizationType.USER_POOL,
            cognitoConfig: { userPool: props.userPool },
          },
          { authorizationType: AppSyncAuthorizationType.IAM },
        ],
        connectionAuthModeTypes: [AppSyncAuthorizationType.USER_POOL, AppSyncAuthorizationType.IAM],
        defaultSubscribeAuthModeTypes: [AppSyncAuthorizationType.USER_POOL],
        defaultPublishAuthModeTypes: [AppSyncAuthorizationType.IAM],
      },
    });
    api.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const namespace = api.addChannelNamespace('Namespace', {
      channelNamespaceName: EVENTS_NAMESPACE,
      code: Code.fromInline(onSubscribe),
    });
    namespace.applyRemovalPolicy(RemovalPolicy.DESTROY);

    this.api = api;
    this.eventsEndpoint = `https://${api.httpDns}/event`;

    new CfnOutput(this, 'EventsEndpoint', { value: this.eventsEndpoint });
  }
}
