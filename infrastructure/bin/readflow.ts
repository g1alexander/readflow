import { App } from 'aws-cdk-lib';
import { config } from '../lib/config.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

const auth = new AuthStack(app, 'ReadflowAuth', { env });

new FrontendStack(app, 'ReadflowFrontend', {
  env,
  userPoolId: auth.userPool.userPoolId,
  userPoolClientId: auth.userPoolClient.userPoolClientId,
});
