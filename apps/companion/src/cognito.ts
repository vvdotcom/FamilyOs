// Public Cognito APIs work in Expo Go without a browser redirect or AWS credentials.
// Passwords travel only to this AWS HTTPS endpoint and are never persisted here.
export class CognitoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CognitoError';
  }
}

type AuthReply = {
  AuthenticationResult?: { IdToken?: string };
  ChallengeName?: string;
  Session?: string;
};
type Delivery = { CodeDeliveryDetails?: { Destination?: string }; UserConfirmed?: boolean };

const messages: Record<string, string> = {
  NotAuthorizedException: 'The email or password is incorrect, or this sign-in is not permitted.',
  UserNotFoundException: 'The email or password is incorrect.',
  UserNotConfirmedException: 'Verify your email before signing in. Enter the code from your email, or request a new one.',
  UsernameExistsException: 'An account already uses this email. Sign in or verify your email to continue.',
  InvalidPasswordException: 'Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.',
  CodeMismatchException: 'That code is incorrect. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Request a new code.',
  TooManyRequestsException: 'Too many attempts. Wait a moment and try again.',
  LimitExceededException: 'The email or request limit was reached. Please try again later.',
  CodeDeliveryFailureException: 'The verification email could not be delivered. Please try again later.',
  PasswordResetRequiredException: 'Reset your password before signing in.',
};

export class CognitoAccounts {
  private readonly endpoint: string;

  constructor(private readonly clientId: string, region: string) {
    if (!clientId || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
      throw new Error('FamilyOS account sign-in is not configured.');
    }
    this.endpoint = `https://cognito-idp.${region}.amazonaws.com/`;
  }

  private async request<T>(operation: string, body: object): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST', credentials: 'omit', signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`,
        },
        body: JSON.stringify({ ClientId: this.clientId, ...body }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const code = String(payload.__type || 'CognitoRequestFailed').split('#').pop()!;
        const message = code === 'NotAuthorizedException' && /sign.?up.*not permitted/i.test(payload.message || '')
          ? 'New account registration is not enabled yet. Please contact the FamilyOS administrator.'
          : messages[code] || 'Account setup could not be completed. Please try again or contact the FamilyOS administrator.';
        throw new CognitoError(code, message);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof CognitoError) throw error;
      throw new Error('Cannot reach account services. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
    }
  }

  signUp(email: string, password: string): Promise<Delivery> {
    return this.request('SignUp', {
      Username: email.trim(), Password: password,
      UserAttributes: [{ Name: 'email', Value: email.trim() }],
    });
  }

  async confirm(email: string, code: string): Promise<void> {
    await this.request('ConfirmSignUp', { Username: email.trim(), ConfirmationCode: code.trim() });
  }

  resend(email: string): Promise<Delivery> {
    return this.request('ResendConfirmationCode', { Username: email.trim() });
  }

  async signIn(email: string, password: string): Promise<string> {
    const username = email.trim();
    let result = await this.request<AuthReply>('InitiateAuth', {
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: password },
    });
    if (result.ChallengeName === 'PASSWORD' && result.Session) {
      result = await this.request<AuthReply>('RespondToAuthChallenge', {
        ChallengeName: 'PASSWORD', Session: result.Session,
        ChallengeResponses: { USERNAME: username, PASSWORD: password },
      });
    }
    if (result.ChallengeName) {
      throw new CognitoError('AdditionalChallengeRequired', 'This account requires additional verification that is not supported in this preview yet. Contact the FamilyOS administrator.');
    }
    if (!result.AuthenticationResult?.IdToken) {
      throw new Error('Account services did not return a sign-in token. Please try again.');
    }
    return result.AuthenticationResult.IdToken;
  }

  forgotPassword(email: string): Promise<Delivery> {
    return this.request('ForgotPassword', { Username: email.trim() });
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await this.request('ConfirmForgotPassword', {
      Username: email.trim(), ConfirmationCode: code.trim(), Password: password,
    });
  }
}
