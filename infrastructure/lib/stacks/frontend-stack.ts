import * as amplify from '@aws-cdk/aws-amplify-alpha';
import {
  CfnDynamicReference,
  CfnDynamicReferenceService,
  CfnOutput,
  SecretValue,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild';
import type { Construct } from 'constructs';
import { config } from '../config.js';
import { GitHubAppSourceCodeProvider } from '../constructs/github-app-source-code-provider.js';

export interface FrontendStackProps extends StackProps {
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
  eventsEndpoint: string;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { appRoot, branch, nodeVersion, pnpmVersion } = config.frontend;
    const appDomain = this.contextString('appDomain');
    const appSubdomain = this.contextString('appSubdomain');

    const app = new amplify.App(this, 'FrontendApp', {
      appName: config.appName,
      platform: amplify.Platform.WEB,
      sourceCodeProvider: new GitHubAppSourceCodeProvider({
        owner: config.github.owner,
        repository: config.github.repository,
        accessToken: SecretValue.cfnDynamicReference(
          new CfnDynamicReference(CfnDynamicReferenceService.SSM, config.github.tokenParameterName),
        ),
      }),
      environmentVariables: {
        AMPLIFY_MONOREPO_APP_ROOT: appRoot,
        AMPLIFY_DIFF_DEPLOY: 'true',
        PUBLIC_COGNITO_USER_POOL_ID: props.userPoolId,
        PUBLIC_COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
        PUBLIC_API_URL: props.apiUrl,
        PUBLIC_EVENTS_ENDPOINT: props.eventsEndpoint,
      },
      buildSpec: BuildSpec.fromObjectToYaml({
        version: 1,
        applications: [
          {
            appRoot,
            frontend: {
              phases: {
                preBuild: {
                  commands: [
                    `nvm install ${nodeVersion}`,
                    `nvm use ${nodeVersion}`,
                    'corepack enable',
                    `corepack prepare pnpm@${pnpmVersion} --activate`,
                    'pnpm install --frozen-lockfile',
                  ],
                },
                build: {
                  commands: ['pnpm build'],
                },
              },
              artifacts: {
                baseDirectory: 'dist',
                files: ['**/*'],
              },
              cache: {
                paths: ['node_modules/**/*'],
              },
            },
          },
        ],
      }),
      customRules: [
        new amplify.CustomRule({
          source: '/<*>',
          target: '/404.html',
          status: amplify.RedirectStatus.NOT_FOUND,
        }),
      ],
    });

    const main = app.addBranch(branch, {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    app.addDomain(appDomain).mapSubDomain(main, appSubdomain);

    new CfnOutput(this, 'AmplifyAppId', { value: app.appId });
    new CfnOutput(this, 'AmplifyDefaultDomain', { value: app.defaultDomain });
    new CfnOutput(this, 'MainBranchUrl', {
      value: `https://${main.branchName}.${app.defaultDomain}`,
    });
    new CfnOutput(this, 'AppUrl', { value: `https://${appSubdomain}.${appDomain}` });
  }

  private contextString(key: string): string {
    const value: unknown = this.node.tryGetContext(key);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Context "${key}" must be a non-empty string`);
    }
    return value;
  }
}
