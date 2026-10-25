import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const env = { account: '123456789012', region: 'us-east-1' };
const corsOrigins = ['http://localhost:4321', 'https://main.example.amplifyapp.com'];

describe('StorageStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App({ context: { corsOrigins } });
    const stack = new StorageStack(app, 'TestStorage', { env });
    template = Template.fromStack(stack);
  });

  it('creates the single table from the data model spec', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'readflow',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      GlobalSecondaryIndexes: Match.absent(),
      TimeToLiveSpecification: Match.absent(),
      DeletionProtectionEnabled: Match.absent(),
    });
  });

  it('deletes the table when the stack is destroyed', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('creates a private, SSE-S3 bucket without versioning or lifecycle', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'g1-readflowstorage-epub',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      VersioningConfiguration: Match.absent(),
      LifecycleConfiguration: Match.absent(),
    });
  });

  it('allows PUT and GET from the configured origins', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [
          {
            AllowedMethods: ['PUT', 'GET'],
            AllowedOrigins: corsOrigins,
            AllowedHeaders: ['content-type'],
          },
        ],
      },
    });
  });

  it('denies requests without TLS', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: 's3:*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('sends bucket events to EventBridge', () => {
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      NotificationConfiguration: { EventBridgeConfiguration: {} },
    });
  });

  it('deletes the bucket and its objects when the stack is destroyed', () => {
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
    template.resourceCountIs('Custom::S3AutoDeleteObjects', 1);
  });

  it('exports the table and bucket names', () => {
    template.hasOutput('TableName', {});
    template.hasOutput('BucketName', {});
  });

  it('fails without corsOrigins in the context', () => {
    const app = new App();
    expect(() => new StorageStack(app, 'NoCors', { env })).toThrow(/corsOrigins/);
  });
});
