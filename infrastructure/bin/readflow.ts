import { App } from 'aws-cdk-lib';
import { config, resourceName } from '../lib/config.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';
import { MailStack } from '../lib/stacks/mail-stack.js';
import { RealtimeStack } from '../lib/stacks/realtime-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

const storage = new StorageStack(app, resourceName('storage'), { env });

const mail = new MailStack(app, resourceName('mail'), { env });

const auth = new AuthStack(app, resourceName('auth'), { env });

const realtime = new RealtimeStack(app, resourceName('realtime'), { env, userPool: auth.userPool });

const serverless = new ServerlessStack(app, resourceName('serverless'), {
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

new FrontendStack(app, resourceName('frontend'), {
  env,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
  apiUrl: serverless.apiUrl,
  eventsEndpoint: realtime.eventsEndpoint,
});
