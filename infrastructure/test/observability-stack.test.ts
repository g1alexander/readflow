import { App, Stack } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { Template } from 'aws-cdk-lib/assertions';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';

describe('ObservabilityStack', () => {
  let template: Template;
  let body: string;

  beforeAll(() => {
    const app = new App();
    const env = { account: '123456789012', region: 'us-east-1' };
    const source = new Stack(app, 'TestSource', { env });
    const fn = (name: string) =>
      new Function(source, name, {
        functionName: `fn-${name}`,
        runtime: Runtime.PYTHON_3_13,
        handler: 'index.handler',
        code: Code.fromInline('def handler(event, context): pass'),
        logGroup: new LogGroup(source, `${name}Logs`),
      });
    const functions = {
      api: fn('api'),
      metadata: fn('metadata'),
      kindle: fn('kindle'),
      notify: fn('notify'),
    };
    const stack = new ObservabilityStack(app, 'TestObservability', {
      env,
      api: new HttpApi(source, 'Api'),
      functions,
      failureQueues: {
        metadata: new Queue(source, 'MetadataFailures', { queueName: 'metadata-failures' }),
        kindle: new Queue(source, 'KindleFailures', { queueName: 'kindle-failures' }),
      },
      streamFunctions: { kindle: functions.kindle, notify: functions.notify },
    });
    template = Template.fromStack(stack);
    const [dashboard] = Object.values(template.findResources('AWS::CloudWatch::Dashboard'));
    body = JSON.stringify(dashboard.Properties.DashboardBody);
  });

  it('creates one dashboard named g1-readflow-dashboard and deletes it with the stack', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    template.hasResource('AWS::CloudWatch::Dashboard', {
      Properties: { DashboardName: 'g1-readflow-dashboard' },
      DeletionPolicy: 'Delete',
    });
  });

  it('charts invocations, errors and p95 duration of every Lambda', () => {
    for (const metric of ['Invocations', 'Errors', 'Duration']) {
      expect(body).toContain(`"AWS/Lambda\\",\\"${metric}\\"`);
    }
    expect(body).toContain('p95');
  });

  it('charts requests, 4xx, 5xx and latency of the API', () => {
    for (const metric of ['Count', '4xx', '5xx', 'Latency']) {
      expect(body).toContain(`"AWS/ApiGateway\\",\\"${metric}\\"`);
    }
  });

  it('charts the failure queues and the stream iterator age', () => {
    expect(body).toContain('ApproximateNumberOfMessagesVisible');
    expect(body).toContain('IteratorAge');
  });

  it('queries ERROR and WARN logs of the four Lambdas', () => {
    expect(body).toContain('filter level in');
    for (const name of ['api', 'metadata', 'kindle', 'notify']) {
      expect(body).toMatch(new RegExp(`SOURCE '[^}]+${name}Logs`));
    }
  });
});
