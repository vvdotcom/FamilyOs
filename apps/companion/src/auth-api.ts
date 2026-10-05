import { Platform } from 'react-native';
import { SecureStore } from './storage';
import {
  APIRequestError,
  type AccessContext,
  type ChorePhotoResult,
  type ConnectedCalendar,
  type Household,
  type Edit,
  type ImportDraft,
  type ImportSource,
  type RecipeRequest,
  type GeneratedRecipeResult,
  type PairedTV,
  type PhotoMeta,
  type Proposal,
  type RedemptionRequest,
  type VoiceConnection,
} from './household';

const SESSION_KEY = 'familyos.session-cookie';
// While a parent unlock is active on a phone in child mode, the child session waits here.
const CHILD_SESSION_KEY = 'familyos.child-session';
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
type SessionReply = { authenticated: boolean; account: Account | null; sessionToken?: string; accessMode?: 'parent' | 'child' | null; memberId?: string | null; memberName?: string; elevated?: boolean };
type SignUpReply = { verificationRequired: boolean; email: string; householdName: string };
type DevCodeReply = { purpose: string; code: string; expiresAt: string } | null;
type APIError = { error?: { message?: string; code?: string } };

/**
 * The hosted web app is served by the Hometide API itself (at /app), so it always talks to the
 * origin it was opened from. That keeps sessions on one origin and needs no CORS setup.
 */
export const HOSTED_WEB = Platform.OS === 'web' && !__DEV__;

function pageOrigin(): string | null {
  const location = typeof window === 'undefined' ? undefined : window.location;
  return location && /^https?:$/.test(location.protocol) ? location.origin : null;
}

export const DEFAULT_API_URL = HOSTED_WEB
  ? pageOrigin() || 'https://hometide.up.railway.app'
  : __DEV__ && Platform.OS === 'web'
    ? process.env.EXPO_PUBLIC_FAMILYOS_API_URL || 'http://127.0.0.1:8787'
    : 'https://hometide.up.railway.app';

export async function readSavedAPIURL(): Promise<string> {
  if (HOSTED_WEB) return DEFAULT_API_URL;
  return (await SecureStore.getItemAsync(API_URL_KEY)) || DEFAULT_API_URL;
}

export async function saveAPIURL(value: string): Promise<string> {
  if (HOSTED_WEB) throw new Error('The web app always uses the Hometide server it was opened from.');
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
    throw new Error('The browser preview is for local testing only. Use Expo Go for a hosted Hometide account.');
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

  createImportDraft(body: ImportSource): Promise<{ draft: ImportDraft; drafts?: ImportDraft[]; household: Household }> {
    return this.post('v1/imports/drafts', body, false, true);
  }

  generateRecipe(body: RecipeRequest): Promise<GeneratedRecipeResult> {
    return this.post('v1/recipes/generate', body, false, true);
  }

  async resetParentAccessCode(newCode: string, password: string, idToken?: string): Promise<void> {
    await this.post('v1/access-code/reset', idToken ? { newCode, idToken } : { newCode, password }, false, true);
  }

  adjustStars(memberId: string, delta: number, code: string): Promise<Household> {
    return this.post('v1/stars/adjust', { memberId, delta, code }, false, true);
  }

  async revokeAllSessions(): Promise<void> {
    try {
      await this.post('v1/auth/sessions/revoke-all', {}, false, true);
    } finally {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.deleteItemAsync(CHILD_SESSION_KEY);
    }
  }

  decideProposal(id: string, action: 'confirm' | 'reject'): Promise<{ proposal: Proposal; household: Household }> {
    return this.post(`v1/proposals/${encodeURIComponent(id)}/decision`, { action }, false, true);
  }

  submitChorePhoto(choreId: string, memberId: string, contentBase64: string): Promise<ChorePhotoResult> {
    return this.post(`v1/chores/${encodeURIComponent(choreId)}/verification`, { memberId, contentBase64 }, false, true);
  }

  decideChorePhoto(id: string, action: 'approve' | 'reject' | 'retake', code: string): Promise<{ household: Household }> {
    return this.post(`v1/chores/verifications/${encodeURIComponent(id)}/decision`, { action, code }, false, true);
  }

  connectCalendar(label: string, url: string, memberIds: string[]): Promise<{ calendar: ConnectedCalendar; household: Household }> {
    return this.post('v1/calendars', { label, url, memberIds }, false, true);
  }

  syncCalendar(id: string): Promise<{ calendar: ConnectedCalendar; household: Household }> {
    return this.post(`v1/calendars/${encodeURIComponent(id)}/sync`, {}, false, true);
  }

  disconnectCalendar(id: string): Promise<Household> {
    return this.post(`v1/calendars/${encodeURIComponent(id)}/delete`, {}, false, true);
  }

  uploadPhoto(contentBase64: string, caption: string): Promise<{ photo: PhotoMeta; household: Household }> {
    return this.post('v1/photos', { contentBase64, caption }, false, true);
  }

  updatePhoto(id: string, patch: Partial<Pick<PhotoMeta, 'caption' | 'selected' | 'rotation' | 'order'>>): Promise<Household> {
    return this.post(`v1/photos/${encodeURIComponent(id)}/update`, patch, false, true);
  }

  deletePhoto(id: string): Promise<Household> {
    return this.post(`v1/photos/${encodeURIComponent(id)}/delete`, {}, false, true);
  }

  /** Private images need the session header; React Native Image supports request headers. */
  async imageSource(path: string): Promise<{ uri: string; headers?: Record<string, string> }> {
    const token = await SecureStore.getItemAsync(SESSION_KEY);
    return { uri: `${this.baseURL}/${path}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
  }

  voiceConnections(): Promise<{ connections: VoiceConnection[]; mcpUrl: string }> {
    return this.request('v1/voice/connections', 'GET', undefined, true);
  }

  createVoiceConnection(label: string, memberId?: string): Promise<{ connection: VoiceConnection; token: string; mcpUrl: string }> {
    return this.post('v1/voice/connections', memberId ? { label, memberId } : { label }, false, true);
  }

  async revokeVoiceConnection(id: string): Promise<void> {
    await this.post(`v1/voice/connections/${encodeURIComponent(id)}/revoke`, {}, false, true);
  }

  simulateVoice(utterance: string): Promise<{ reply: string; mode: 'rules' | 'bedrock'; toolCalls: string[]; proposalIds: string[]; label: string }> {
    return this.post('v1/voice/simulate', { utterance }, false, true);
  }

  async setParentAccessCode(code: string): Promise<void> {
    await this.post('v1/access-code', { code }, false, true);
  }

  async changeParentAccessCode(oldCode: string, newCode: string): Promise<void> {
    await this.post('v1/access-code/change', { oldCode, newCode }, false, true);
  }

  requestRedemption(memberId: string, rewardId: string): Promise<{ request: RedemptionRequest; household: Household }> {
    return this.post('v1/redemptions/request', { memberId, rewardId }, false, true);
  }

  decideRedemption(id: string, action: 'approve' | 'reject', code: string): Promise<{ request: RedemptionRequest; household: Household }> {
    return this.post(`v1/redemptions/${encodeURIComponent(id)}/decision`, { action, code }, false, true);
  }

  approveTV(code: string): Promise<PairedTV> {
    return this.post('v1/pairing/approve', { code }, false, true);
  }

  async accessCodeConfigured(): Promise<boolean> {
    const result = await this.request<{ configured: boolean }>('v1/access-code', 'GET', undefined, true);
    return result.configured;
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
      await SecureStore.deleteItemAsync(CHILD_SESSION_KEY);
    }
  }

  async session(): Promise<SessionReply> {
    const result = await this.request<SessionReply>('v1/auth/session', 'GET', undefined, true);
    if (!result.authenticated) await SecureStore.deleteItemAsync(SESSION_KEY);
    return result;
  }

  async accessContext(): Promise<AccessContext> {
    let result = await this.request<SessionReply>('v1/auth/session', 'GET', undefined, true);
    if (!result.authenticated && (await this.restoreChildSession())) {
      // An unlocked parent session expired after inactivity: fall back to the waiting child session.
      result = await this.request<SessionReply>('v1/auth/session', 'GET', undefined, true);
    }
    if (!result.authenticated) await SecureStore.deleteItemAsync(SESSION_KEY);
    return {
      accessMode: result.accessMode || (result.authenticated ? 'parent' : null),
      memberId: result.memberId || null,
      memberName: result.memberName,
      elevated: Boolean(result.elevated),
    };
  }

  /** Put the waiting child session back in place. Returns false when there is none. */
  private async restoreChildSession(): Promise<boolean> {
    const child = await SecureStore.getItemAsync(CHILD_SESSION_KEY);
    if (!child) return false;
    await SecureStore.setItemAsync(SESSION_KEY, child);
    await SecureStore.deleteItemAsync(CHILD_SESSION_KEY);
    return true;
  }

  /** End temporary parent access and return this phone to the child view. */
  async lockParentMode(): Promise<boolean> {
    if (!(await SecureStore.getItemAsync(CHILD_SESSION_KEY))) return false;
    await this.post('v1/auth/sign-out', {}, false, true).catch(() => undefined);
    return this.restoreChildSession();
  }

  async startChildSession(memberId: string): Promise<{ memberId: string; memberName: string }> {
    const result = await this.post<{ accessMode: 'child'; memberId: string; memberName: string; sessionToken: string }>(
      'v1/access/child-session', { memberId }, false, true,
    );
    if (!result.sessionToken) throw new Error('The server did not start a child session. Please try again.');
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
    await SecureStore.deleteItemAsync(CHILD_SESSION_KEY);
    return { memberId: result.memberId, memberName: result.memberName };
  }

  async returnToParentMode(code: string): Promise<void> {
    const child = await SecureStore.getItemAsync(SESSION_KEY);
    const result = await this.post<{ sessionToken: string }>('v1/access/parent-mode', { code }, false, true);
    if (!result.sessionToken) throw new Error('The server did not restore parent access. Please try again.');
    if (child) await SecureStore.setItemAsync(CHILD_SESSION_KEY, child);
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  }

  async deleteAccount(password: string, idToken?: string): Promise<void> {
    await this.post('v1/account/delete', idToken ? { confirm: 'DELETE', idToken } : { confirm: 'DELETE', password }, false, true);
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(CHILD_SESSION_KEY);
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
      throw new APIRequestError(
        payload.error?.message || 'Hometide could not complete that request. Check the server and try again.',
        response.status,
        payload.error?.code,
      );
    }

    if (createsSession) {
      // Native clients use an explicit bearer token because iOS fetch may hide Set-Cookie.
      // Keep the cookie fallback for older Hometide development servers.
      const setCookie = response.headers.get('set-cookie');
      const token = (payload.data as SessionReply)?.sessionToken
        || setCookie?.match(/(?:^|,\s*)familyos_session=([^;,\s]+)/)?.[1];
      if (!token) throw new Error('The server did not return a sign-in session. Please try again.');
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
    return payload.data;
  }
}
