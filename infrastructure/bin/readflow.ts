import { App } from 'aws-cdk-lib';
import { config } from '../lib/config.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

new StorageStack(app, 'ReadflowStorage', { env });

const auth = new AuthStack(app, 'ReadflowAuth', { env });

new FrontendStack(app, 'ReadflowFrontend', {
  env,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
});
