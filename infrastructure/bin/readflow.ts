import { App } from 'aws-cdk-lib';
import { config } from '../lib/config.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';
import { MailStack } from '../lib/stacks/mail-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

const storage = new StorageStack(app, 'ReadflowStorage', { env });

new MailStack(app, 'ReadflowMail', { env });

const auth = new AuthStack(app, 'ReadflowAuth', { env });

const serverless = new ServerlessStack(app, 'ReadflowServerless', {
  env,
  table: storage.table,
  bucket: storage.bucket,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});

new FrontendStack(app, 'ReadflowFrontend', {
  env,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
  apiUrl: serverless.apiUrl,
});
