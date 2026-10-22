export const config = {
  region: 'us-east-1',
  appName: 'readflow',
  github: {
    owner: 'g1alexander',
    repository: 'readflow',
    tokenSecretName: 'readflow/github-token',
  },
  storage: {
    bucketName: 'g1-readflowstorage-epub',
  },
  frontend: {
    appRoot: 'frontend',
    branch: 'main',
    nodeVersion: '22',
    pnpmVersion: '11.22.0',
  },
} as const;
