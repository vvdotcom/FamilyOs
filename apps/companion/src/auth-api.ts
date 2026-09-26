import { Platform } from 'react-native';
import { SecureStore } from './storage';
import type { Household, Edit, PairedTV } from './household';

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
type SessionReply = { authenticated: boolean; account: Account | null; sessionToken?: string };
type SignUpReply = { verificationRequired: boolean; email: string; householdName: string };
type DevCodeReply = { purpose: string; code: string; expiresAt: string } | null;
type APIError = { error?: { message?: string } };

export const DEFAULT_API_URL = __DEV__ && Platform.OS === 'web'
  ? process.env.EXPO_PUBLIC_FAMILYOS_API_URL || 'http://127.0.0.1:8787'
  : 'https://familyos-api-production.up.railway.app';

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
  if (__DEV__ && Platform.OS === 'web' && !isLocalHost && !isPrivateIPv4) {
    throw new Error('The browser preview is for local testing only. Use Expo Go for a hosted FamilyOS account.');
  }
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

  get usesCognito(): boolean {
    return this.baseURL.startsWith('https://');
  }

  household(): Promise<Household> {
    return this.request('v1/household', 'GET', undefined, true);
  }

  editHousehold(edit: Edit): Promise<Household> {
    return this.post('v1/companion/edit', edit, false, true);
  }

  approveTV(code: string): Promise<PairedTV> {
    return this.post('v1/pairing/approve', { code }, false, true);
  }

  pairedTVs(): Promise<PairedTV[]> {
    return this.request('v1/devices', 'GET', undefined, true);
  }

  async unpairTV(deviceId: string): Promise<void> {
    await this.post(`v1/devices/${encodeURIComponent(deviceId)}/revoke`, {}, false, true);
  }

  async exchangeCognitoSession(
    idToken: string,
    parentName: string,
    householdName: string,
  ): Promise<Account> {
    return this.createSession('v1/auth/exchange', { idToken, parentName, householdName });
  }

  async signUp(email: string, password: string, parentName: string, householdName: string): Promise<SignUpReply> {
    return this.post('v1/auth/sign-up', { email, password, parentName, householdName });
  }

  async verifyEmail(email: string, code: string): Promise<Account> {
    return this.createSession('v1/auth/verify-email', { email, code });
  }

  async resendVerification(email: string): Promise<void> {
    await this.post('v1/auth/resend-verification', { email });
  }

  async signIn(email: string, password: string): Promise<Account> {
    return this.createSession('v1/auth/sign-in', { email, password });
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

  private async createSession(path: string, body: object): Promise<Account> {
    const session = await this.post<SessionReply>(path, body, true);
    if (!session.authenticated || !session.account) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      throw new Error('The server did not return an authenticated account. Please try again.');
    }
    return session.account;
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
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (createsSession) headers['X-FamilyOS-Session-Transport'] = 'bearer';

    const response = await fetch(`${this.baseURL}/${path}`, {
      method,
      headers,
      credentials: 'omit',
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as Envelope<T> & APIError;
    if (!response.ok) {
      throw new Error(payload.error?.message || 'FamilyOS could not complete that request. Check the server and try again.');
    }

    if (createsSession) {
      // Native clients use an explicit bearer token because iOS fetch may hide Set-Cookie.
      // Keep the cookie fallback for older FamilyOS development servers.
      const setCookie = response.headers.get('set-cookie');
      const token = (payload.data as SessionReply)?.sessionToken
        || setCookie?.match(/(?:^|,\s*)familyos_session=([^;,\s]+)/)?.[1];
      if (!token) throw new Error('The server did not return a sign-in session. Please try again.');
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
    return payload.data;
  }
}
