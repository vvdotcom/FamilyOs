import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/** Models the Hometide API may call. Nova Lite runs the voice agent, briefings, imports and chore-photo checks. */
export const BEDROCK_MODELS = ['amazon.nova-lite-v1:0', 'amazon.nova-micro-v1:0', 'amazon.nova-pro-v1:0'];

export interface HometideAiProps extends StackProps {
  /** How long raw AgentCore Memory events are kept, in days (extracted routines stay in long-term memory). */
  readonly eventExpiryDays?: number;
}

/**
 * The AI side of Hometide on AWS:
 *  - Amazon Bedrock AgentCore Memory: the family's learned routines, one namespace per household (hashed id).
 *  - A least-privilege IAM identity for the API (hosted on Railway) to call Bedrock and that memory.
 * The access key lands in AWS Secrets Manager; copy it into the API's environment, never into the repo.
 */
export class HometideAiStack extends Stack {
  readonly memory: agentcore.CfnMemory;
  readonly apiUser: iam.User;

  constructor(scope: Construct, id: string, props: HometideAiProps = {}) {
    super(scope, id, props);
    Tags.of(this).add('app', 'hometide');

    this.memory = new agentcore.CfnMemory(this, 'FamilyMemory', {
      name: 'hometide_family_memory',
      description: "Routines Hometide learned from each family's calendar, and the family's decisions about them.",
      eventExpiryDuration: props.eventExpiryDays ?? 90,
      memoryStrategies: [
        {
          semanticMemoryStrategy: {
            name: 'household_routines',
            description: 'Facts about who usually does what, and when, for one household.',
            namespaces: ['/households/{actorId}/routines'],
          },
        },
      ],
    });
    this.memory.applyRemovalPolicy(RemovalPolicy.RETAIN);

    this.apiUser = new iam.User(this, 'ApiUser', { userName: 'hometide-api-ai' });
    const region = Stack.of(this).region;
    this.apiUser.addToPolicy(new iam.PolicyStatement({
      sid: 'InvokeNovaModels',
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        // Cross-region inference profiles (us.amazon.nova-*) and the models they route to in any US region.
        ...BEDROCK_MODELS.map((model) => `arn:aws:bedrock:*:${this.account}:inference-profile/us.${model}`),
        ...BEDROCK_MODELS.map((model) => `arn:aws:bedrock:*::foundation-model/${model}`),
      ],
    }));
    this.apiUser.addToPolicy(new iam.PolicyStatement({
      sid: 'FamilyMemory',
      actions: [
        'bedrock-agentcore:CreateEvent',
        'bedrock-agentcore:ListEvents',
        'bedrock-agentcore:RetrieveMemoryRecords',
        'bedrock-agentcore:ListMemoryRecords',
      ],
      resources: [this.memory.attrMemoryArn],
    }));

    const key = new iam.AccessKey(this, 'ApiKey', { user: this.apiUser });
    const secret = new secretsmanager.Secret(this, 'ApiKeySecret', {
      secretName: 'hometide/api-ai-credentials',
      description: 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for the Hometide API (Railway).',
      secretObjectValue: {
        AWS_ACCESS_KEY_ID: SecretValue.unsafePlainText(key.accessKeyId),
        AWS_SECRET_ACCESS_KEY: key.secretAccessKey,
        AWS_REGION: SecretValue.unsafePlainText(region),
        HOMETIDE_AGENTCORE_MEMORY_ID: SecretValue.unsafePlainText(this.memory.attrMemoryId),
      },
    });

    new CfnOutput(this, 'MemoryId', { value: this.memory.attrMemoryId, description: 'Set as HOMETIDE_AGENTCORE_MEMORY_ID' });
    new CfnOutput(this, 'ApiCredentialsSecret', { value: secret.secretName });
    new CfnOutput(this, 'EventRetention', { value: Duration.days(props.eventExpiryDays ?? 90).toHumanString() });
  }
}
