import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { MailStack } from '../lib/stacks/mail-stack.js';

const env = { account: '123456789012', region: 'us-east-1' };
const mailDomain = 'example.com';

describe('MailStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App({ context: { mailDomain } });
    const stack = new MailStack(app, 'TestMail', { env });
    template = Template.fromStack(stack);
  });

  it('creates a domain identity with Easy DKIM', () => {
    template.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: mailDomain,
      DkimAttributes: Match.absent(),
    });
    template.resourcePropertiesCountIs(
      'AWS::Route53::RecordSet',
      { Type: 'CNAME' },
      3,
    );
  });

  it('publishes a DMARC p=none record', () => {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: `_dmarc.${mailDomain}.`,
      Type: 'TXT',
      ResourceRecords: ['"v=DMARC1; p=none;"'],
    });
  });

  it('exports the sender address', () => {
    template.hasOutput('SenderAddress', { Value: `kindle@${mailDomain}` });
  });

  it('fails without mailDomain in the context', () => {
    const app = new App();
    expect(() => new MailStack(app, 'NoDomain', { env })).toThrow(/mailDomain/);
  });
});
