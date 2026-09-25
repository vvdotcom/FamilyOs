import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'familyos.session-cookie';
const API_URL_KEY = 'familyos.api-url';
const ENVELOPE_VERSION = 'application/json';

type Envelope<T> = { data: T };
type Account = {
  accountId: string;
  email: string;
  parentName: string;
  emailVerified: boolean;
  householdId: string;
  householdName: string;
};
type SessionReply = { authenticated: boolean; account: Account | null };
type SignUpReply = { verificationRequired: boolean; email: string; householdName: string };
type DevCodeReply = { purpose: string; code: string; expiresAt: string } | null;
type APIError = { error?: { message?: string } };

export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_FAMILYOS_API_URL?.trim() || 'http://127.0.0.1:8787';

export async function readSavedAPIURL(): Promise<string> {
  return (await SecureStore.getItemAsync(API_URL_KEY)) || DEFAULT_API_URL;
}

export async function saveAPIURL(value: string): Promise<string> {
  const normalized = normalizeAPIURL(value);
  await SecureStore.setItemAsync(API_URL_KEY, normalized);
  // A session issued by one server must never be forwarded to another server.
  await SecureStore.deleteItemAsync(SESSION_KEY);
  return normalized;
}

export function normalizeAPIURL(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid HTTPS URL or private local development address.');
  }
  const host = parsed.hostname.toLowerCase();
  const isPrivateIPv4 = (() => {
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
    return octets[0] === 10
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  })();
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.local');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Enter only the server address, without credentials or query text.');
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && (isLocalHost || isPrivateIPv4))) {
    throw new Error('Use HTTPS for hosted servers. HTTP is allowed only for a private local test server.');
  }
  return parsed.toString().replace(/\/$/, '');
}

export class FamilyOSAPI {
  private readonly baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = normalizeAPIURL(baseURL);
  }

  async signUp(email: string, password: string, parentName: string, householdName: string): Promise<SignUpReply> {
    return this.post('v1/auth/sign-up', { email, password, parentName, householdName });
  }

  async verifyEmail(email: string, code: string): Promise<Account> {
    return this.post('v1/auth/verify-email', { email, code }, true);
  }

  async resendVerification(email: string): Promise<void> {
    await this.post('v1/auth/resend-verification', { email });
  }

  async signIn(email: string, password: string): Promise<Account> {
    return this.post('v1/auth/sign-in', { email, password }, true);
  }

  async signOut(): Promise<void> {
    try {
      await this.post('v1/auth/sign-out', {}, false, true);
    } finally {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  }

  async session(): Promise<SessionReply> {
    const result = await this.request<SessionReply>('v1/auth/session', 'GET', undefined, true);
    if (!result.authenticated) await SecureStore.deleteItemAsync(SESSION_KEY);
    return result;
  }

  async forgotPassword(email: string): Promise<void> {
    await this.post('v1/auth/forgot-password', { email });
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.post('v1/auth/reset-password', { email, code, newPassword });
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  async localEmailCode(email: string, purpose: 'verify_email' | 'reset_password'): Promise<DevCodeReply> {
    const query = new URLSearchParams({ email, purpose });
    return this.request<DevCodeReply>(`v1/auth/dev-email/latest?${query.toString()}`, 'GET');
  }

  private async post<T>(path: string, body: object, createsSession = false, needsSession = false): Promise<T> {
    return this.request<T>(path, 'POST', body, needsSession, createsSession);
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: object,
    needsSession = false,
    createsSession = false,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: ENVELOPE_VERSION };
    if (body) headers['Content-Type'] = ENVELOPE_VERSION;
    if (needsSession) {
      const token = await SecureStore.getItemAsync(SESSION_KEY);
      if (token) headers.Cookie = `familyos_session=${token}`;
    }

    const response = await fetch(`${this.baseURL}/${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as Envelope<T> & APIError;
    if (!response.ok) {
      throw new Error(payload.error?.message || 'FamilyOS could not complete that request. Check the server and try again.');
    }

    if (createsSession) {
      // Native fetch exposes response cookies in React Native; keep the opaque session
      // in SecureStore and send it explicitly so it survives Expo Go app restarts.
      const setCookie = response.headers.get('set-cookie');
      const token = setCookie?.match(/(?:^|,\s*)familyos_session=([^;,\s]+)/)?.[1];
      if (!token) throw new Error('The server did not return a sign-in session. Please try again.');
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
    return payload.data;
  }
}
