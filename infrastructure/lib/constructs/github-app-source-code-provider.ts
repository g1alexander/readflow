import type { App, ISourceCodeProvider, SourceCodeProviderConfig } from '@aws-cdk/aws-amplify-alpha';
import type { SecretValue } from 'aws-cdk-lib';

export interface GitHubAppSourceCodeProviderProps {
  readonly owner: string;
  readonly repository: string;
  readonly accessToken: SecretValue;
}

export class GitHubAppSourceCodeProvider implements ISourceCodeProvider {
  constructor(private readonly props: GitHubAppSourceCodeProviderProps) {}

  bind(_app: App): SourceCodeProviderConfig {
    return {
      repository: `https://github.com/${this.props.owner}/${this.props.repository}`,
      accessToken: this.props.accessToken,
    };
  }
}
