import { App } from 'aws-cdk-lib';
import { config } from '../lib/config.js';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

new FrontendStack(app, 'ReadflowFrontend', { env });
