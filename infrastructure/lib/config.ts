export const config = {
  region: 'us-east-1',
  prefix: 'g1-readflow',
  github: {
    owner: 'g1alexander',
    repository: 'readflow',
    tokenParameterName: '/g1-readflow/github-token',
  },
  frontend: {
    appRoot: 'frontend',
    branch: 'main',
    nodeVersion: '24',
    pnpmVersion: '11.22.0',
  },
} as const;

export const resourceName = (service: string) => `${config.prefix}-${service}`;
