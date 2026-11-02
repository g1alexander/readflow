interface ImportMetaEnv {
  readonly PUBLIC_COGNITO_USER_POOL_ID: string;
  readonly PUBLIC_COGNITO_USER_POOL_CLIENT_ID: string;
  readonly PUBLIC_API_URL: string;
  readonly PUBLIC_EVENTS_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
