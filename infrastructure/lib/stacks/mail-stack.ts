import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { HostedZone, TxtRecord } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity, type IEmailIdentity } from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

export class MailStack extends Stack {
  readonly emailIdentity: IEmailIdentity;
  readonly senderAddress: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const mailDomain: unknown = this.node.tryGetContext('mailDomain');
    if (typeof mailDomain !== 'string' || mailDomain.length === 0) {
      throw new Error('Context "mailDomain" must be a non-empty domain string');
    }

    const zone = HostedZone.fromLookup(this, 'Zone', { domainName: mailDomain });

    this.emailIdentity = new EmailIdentity(this, 'Identity', {
      identity: Identity.publicHostedZone(zone),
    });

    new TxtRecord(this, 'Dmarc', {
      zone,
      recordName: '_dmarc',
      values: ['v=DMARC1; p=none;'],
    });

    this.senderAddress = `kindle@${mailDomain}`;

    new CfnOutput(this, 'SenderAddress', { value: this.senderAddress });
  }
}
