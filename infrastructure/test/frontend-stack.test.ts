import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { FrontendStack } from '../lib/stacks/frontend-stack.js';

describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new FrontendStack(app, 'TestFrontend', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  it('connects the repo through the GitHub App access token, not OAuth', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      Repository: 'https://github.com/g1alexander/readflow',
      AccessToken: Match.stringLikeRegexp('resolve:secretsmanager:readflow/github-token'),
      OauthToken: Match.absent(),
      Platform: 'WEB',
    });
  });

  it('sets the monorepo app root and diff deploy', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      EnvironmentVariables: Match.arrayWith([
        { Name: 'AMPLIFY_MONOREPO_APP_ROOT', Value: 'frontend' },
        { Name: 'AMPLIFY_DIFF_DEPLOY', Value: 'true' },
      ]),
    });
  });

  it('builds the frontend app root with pnpm and publishes dist', () => {
    const [app] = Object.values(template.findResources('AWS::Amplify::App'));
    const buildSpec: string = app.Properties.BuildSpec;
    expect(buildSpec).toContain('appRoot: frontend');
    expect(buildSpec).toContain('pnpm install --frozen-lockfile');
    expect(buildSpec).toContain('baseDirectory: dist');
  });

  it('creates main as the production branch with auto build', () => {
    template.resourceCountIs('AWS::Amplify::Branch', 1);
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'main',
      EnableAutoBuild: true,
      Stage: 'PRODUCTION',
    });
  });
});
