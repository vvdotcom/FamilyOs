import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { HometideAiStack } from '../lib/ai-stack';
import { ALEXA_REDIRECTS, HometideAuthStack } from '../lib/auth-stack';

const env = { account: '123456789012', region: 'us-west-2' };

describe('HometideAi', () => {
  const template = Template.fromStack(new HometideAiStack(new App(), 'Ai', { env }));

  test('creates one AgentCore Memory with a per-household routines namespace', () => {
    template.resourceCountIs('AWS::BedrockAgentCore::Memory', 1);
    template.hasResourceProperties('AWS::BedrockAgentCore::Memory', {
      Name: 'hometide_family_memory',
      EventExpiryDuration: 90,
      MemoryStrategies: [{ SemanticMemoryStrategy: Match.objectLike({ Namespaces: ['/households/{actorId}/routines'] }) }],
    });
    template.hasResource('AWS::BedrockAgentCore::Memory', { DeletionPolicy: 'Retain' });
  });

  test('the API identity can only invoke Nova models and use that one memory', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap((policy: any) => policy.Properties.PolicyDocument.Statement);
    const actions = statements.flatMap((statement: any) => [].concat(statement.Action));
    expect(actions.sort()).toEqual([
      'bedrock-agentcore:CreateEvent', 'bedrock-agentcore:ListEvents', 'bedrock-agentcore:ListMemoryRecords',
      'bedrock-agentcore:RetrieveMemoryRecords', 'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream',
    ].sort());
    const resources = JSON.stringify(statements.map((statement: any) => statement.Resource));
    expect(resources).not.toContain('"*"');
    expect(resources).toContain('foundation-model/amazon.nova-lite-v1:0');
    expect(resources).toContain('MemoryArn');
  });

  test('the access key goes to Secrets Manager, not to an output', () => {
    template.resourceCountIs('AWS::IAM::AccessKey', 1);
    template.hasResourceProperties('AWS::SecretsManager::Secret', { Name: 'hometide/api-ai-credentials' });
    const outputs = JSON.stringify(template.toJSON().Outputs);
    expect(outputs).not.toContain('SecretAccessKey');
  });
});

describe('HometideAuth', () => {
  const template = Template.fromStack(new HometideAuthStack(new App(), 'Auth', { env }));

  test('mirrors the live parent pool and protects it', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'Userpool-nvippm',
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      MfaConfiguration: 'OFF',
      DeletionProtection: 'ACTIVE',
      UserPoolTier: 'ESSENTIALS',
      Policies: { PasswordPolicy: Match.objectLike({ MinimumLength: 8, RequireSymbols: true, TemporaryPasswordValidityDays: 7 }) },
    });
    template.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'us-west-28isguybvq', ManagedLoginVersion: 2 });
  });

  test('companion client: public, code grant, short tokens', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'FamilyOSCompanion',
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      RefreshTokenValidity: 7200,
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
    });
  });

  test('Alexa client: confidential, code grant, one-year refresh, all three Alexa redirects', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'Alexa',
      GenerateSecret: true,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['email', 'openid'],
      CallbackURLs: ALEXA_REDIRECTS,
      RefreshTokenValidity: 525600,
    });
  });
});
