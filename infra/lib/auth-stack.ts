import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/** Alexa account-linking redirect URLs for the Hometide skill (all three Alexa regions). */
export const ALEXA_REDIRECTS = ['alexa.amazon.co.jp', 'layla.amazon.com', 'pitangui.amazon.com']
  .map((host) => `https://${host}/api/skill/link/M3DY2JKSW5GI2I`);

export interface HometideAuthProps extends StackProps {
  /** Hosted sign-in domain prefix (the live pool uses the Cognito default prefix). */
  readonly domainPrefix?: string;
  /** Where the companion web app receives the sign-in code. */
  readonly companionCallbacks?: string[];
  /** Existing pool name, kept so `cdk import` can adopt the live pool without replacing it. */
  readonly userPoolName?: string;
}

/**
 * Hometide sign-in: one Cognito user pool for parents, used by the phone and web app, the TV pairing flow, the
 * Alexa skill (account linking) and the MCP server (OAuth 2.1 bearer tokens).
 *
 * This mirrors the live pool (us-west-2_8isgUyBvQ). It is RETAINed and deletion-protected; adopt the live pool
 * with `cdk import HometideAuth` (see infra/README.md) rather than deploying a second pool.
 */
export class HometideAuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly companionClient: cognito.UserPoolClient;
  readonly alexaClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: HometideAuthProps = {}) {
    super(scope, id, props);
    Tags.of(this).add('app', 'hometide');

    this.userPool = new cognito.UserPool(this, 'Parents', {
      userPoolName: props.userPoolName ?? 'Userpool-nvippm',
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 8, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      email: cognito.UserPoolEmail.withCognito(),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const domain = this.userPool.addDomain('HostedSignIn', {
      cognitoDomain: { domainPrefix: props.domainPrefix ?? 'us-west-28isguybvq' },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    this.companionClient = this.userPool.addClient('Companion', {
      userPoolClientName: 'FamilyOSCompanion',
      generateSecret: false,
      authFlows: { user: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PHONE],
        callbackUrls: props.companionCallbacks ?? ['https://d84l1y8p4kdic.cloudfront.net'],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(5),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // Alexa account linking: confidential client, authorization-code grant, long-lived refresh tokens so the
    // family links once. The MCP server accepts this client's access tokens (FAMILYOS_MCP_COGNITO_CLIENT_IDS).
    this.alexaClient = this.userPool.addClient('Alexa', {
      userPoolClientName: 'Alexa',
      generateSecret: true,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID],
        callbackUrls: ALEXA_REDIRECTS,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      refreshTokenValidity: Duration.days(365),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'HostedSignInDomain', { value: domain.baseUrl() });
    new CfnOutput(this, 'CompanionClientId', { value: this.companionClient.userPoolClientId });
    new CfnOutput(this, 'AlexaClientId', { value: this.alexaClient.userPoolClientId });
  }
}
