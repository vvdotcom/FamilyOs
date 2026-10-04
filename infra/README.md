# Hometide infrastructure (AWS CDK)

The Hometide API runs on Railway. This CDK app holds the AWS pieces it uses, as code:

| Stack | What it creates |
|---|---|
| `HometideAi` | Amazon Bedrock AgentCore Memory (`hometide_family_memory`, semantic strategy, namespace `/households/{actorId}/routines`, 90-day raw events), an IAM user that can only invoke the Nova models and use that memory, and its access key in Secrets Manager (`hometide/api-ai-credentials`). |
| `HometideAuth` | The Cognito user pool for parents (email sign-in, Essentials tier, deletion protection, RETAIN), the hosted sign-in domain (managed login v2), the companion app client, and the Alexa account-linking client. It mirrors the live pool `us-west-2_8isgUyBvQ`. |

## Test

```bash
cd infra
npm install
npm test          # assertion tests for both stacks (no AWS account needed)
npx cdk synth     # CloudFormation templates in cdk.out/
```

## Deploy the AI stack

Needs AWS credentials for the account (CloudShell works) and a bootstrapped CDK environment.

```bash
npx cdk deploy HometideAi
```

Then copy the four values from Secrets Manager into Railway (Variables), and redeploy the API:

```bash
aws secretsmanager get-secret-value --secret-id hometide/api-ai-credentials --query SecretString --output text
```

| Railway variable | From the secret |
|---|---|
| `AWS_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` |
| `AWS_REGION` | `AWS_REGION` |
| `HOMETIDE_AGENTCORE_MEMORY_ID` | `HOMETIDE_AGENTCORE_MEMORY_ID` |

Keep `AWS_BEARER_TOKEN_BEDROCK` if it is already set: Bedrock calls keep using the API key, and AgentCore Memory
uses the IAM key. Check it end to end from `services/family-agent` with:

```bash
FAMILYOS_AI_PROVIDER=bedrock HOMETIDE_AGENTCORE_MEMORY_ID=<id> python scripts/live_agent_check.py
```

## Adopt the live Cognito pool (optional)

`HometideAuth` describes the pool that already exists, so it must be **imported**, not deployed as a new pool:

```bash
npx cdk import HometideAuth
```

CDK asks for the physical id of each resource: the user pool (`us-west-2_8isgUyBvQ`), the domain
(`us-west-28isguybvq`), and the two app clients (from `aws cognito-idp list-user-pool-clients`). Run
`npx cdk diff HometideAuth` afterwards and read it before any later deploy: token lifetimes are written in minutes
here and in days in the console, which is the same setting. The pool and domain are retained if the stack is ever
deleted.
