import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  Dashboard,
  GraphWidget,
  LogQueryVisualizationType,
  LogQueryWidget,
  type Metric,
  Stats,
} from 'aws-cdk-lib/aws-cloudwatch';
import type { Function } from 'aws-cdk-lib/aws-lambda';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { resourceName } from '../config.js';

export interface ObservabilityStackProps extends StackProps {
  api: HttpApi;
  functions: Record<string, Function>;
  failureQueues: Record<string, Queue>;
  streamFunctions: Record<string, Function>;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const functions = Object.entries(props.functions);
    const perFunction = (title: string, metric: (fn: Function) => Metric) =>
      new GraphWidget({
        title,
        width: 8,
        left: functions.map(([name, fn]) => metric(fn).with({ label: name })),
      });

    const dashboard = new Dashboard(this, 'Dashboard', { dashboardName: resourceName('dashboard') });
    dashboard.applyRemovalPolicy(RemovalPolicy.DESTROY);

    dashboard.addWidgets(
      perFunction('Lambda invocaciones', (fn) => fn.metricInvocations()),
      perFunction('Lambda errores', (fn) => fn.metricErrors()),
      perFunction('Lambda duración p95', (fn) => fn.metricDuration({ statistic: Stats.p(95) })),
    );

    dashboard.addWidgets(
      new GraphWidget({ title: 'API requests', width: 8, left: [props.api.metricCount()] }),
      new GraphWidget({
        title: 'API errores',
        width: 8,
        left: [
          props.api.metricClientError().with({ label: '4xx' }),
          props.api.metricServerError().with({ label: '5xx' }),
        ],
      }),
      new GraphWidget({
        title: 'API latencia p95',
        width: 8,
        left: [props.api.metricLatency({ statistic: Stats.p(95) })],
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Mensajes en colas de fallos',
        width: 12,
        left: Object.entries(props.failureQueues).map(([name, queue]) =>
          queue.metricApproximateNumberOfMessagesVisible({ statistic: Stats.MAXIMUM, label: name }),
        ),
      }),
      new GraphWidget({
        title: 'Streams IteratorAge (ms)',
        width: 12,
        left: Object.entries(props.streamFunctions).map(([name, fn]) =>
          fn.metric('IteratorAge', { statistic: Stats.MAXIMUM, label: name }),
        ),
      }),
    );

    dashboard.addWidgets(
      new LogQueryWidget({
        title: 'Últimos ERROR/WARN',
        width: 24,
        height: 8,
        view: LogQueryVisualizationType.TABLE,
        logGroupNames: functions.map(([, fn]) => fn.logGroup.logGroupName),
        queryLines: [
          'fields @timestamp, @log, level, message, bookId, reason',
          'filter level in ["WARN", "WARNING", "ERROR", "CRITICAL", "FATAL"]',
          'sort @timestamp desc',
          'limit 50',
        ],
      }),
    );
  }
}
