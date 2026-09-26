import {
  CalendarEvent,
  Chore,
  Conflict,
  FamilyBriefing,
  FamilyMember,
  HouseholdSnapshot,
  ProposedAction,
  Routine,
} from '@familyos/domain';
import { clearTVDeviceToken, getTVDeviceToken, setTVDeviceToken } from './tvDeviceSession';

export interface FamilyAgentContext {
  date: string;
  timezone: string;
  members: Array<Pick<FamilyMember, 'id' | 'name' | 'role'>>;
  events: Array<Pick<CalendarEvent, 'id' | 'title' | 'startAt' | 'endAt' | 'memberIds' | 'responsibleMemberId'>>;
  chores: Array<Pick<Chore, 'id' | 'title' | 'status' | 'assignedToMemberId'>>;
  routines: Array<{
    name: string;
    period: Routine['period'];
    memberId: string;
    completedSteps: number;
    totalSteps: number;
  }>;
  conflicts: Array<Pick<Conflict, 'id' | 'type' | 'title' | 'message' | 'suggestedMemberId'>>;
  weather?: { condition: string; temperatureF: number };
}

interface Envelope<T> {
  data: T;
  meta: { request_id: string; [key: string]: unknown };
}

export interface ConfirmedActionResult {
  action: ProposedAction;
  event: CalendarEvent;
  actionHistory: Array<Record<string, unknown>>;
}

export class FamilyAgentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FamilyAgentError';
  }
}

const apiBase = (process.env.EXPO_PUBLIC_FAMILYOS_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Envelope<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const tvToken = await getTVDeviceToken();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(tvToken ? { Authorization: `Bearer ${tvToken}` } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => undefined)) as
      | Envelope<T>
      | { error?: { message?: string } }
      | undefined;
    if (!response.ok) {
      throw new FamilyAgentError(
        body && 'error' in body
          ? body.error?.message || 'FamilyOS could not complete that request.'
          : 'FamilyOS could not complete that request.',
        response.status,
      );
    }
    if (!body || !('data' in body) || !('meta' in body))
      throw new FamilyAgentError('FamilyOS returned an invalid response.');
    return body;
  } catch (error) {
    if (error instanceof FamilyAgentError) throw error;
    throw new FamilyAgentError('The FamilyOS service is unavailable.');
  } finally {
    clearTimeout(timeout);
  }
}

export const familyAgentClient = {
  getHealth: () =>
    request<{ status: string; ai_provider: string; bedrock_configured: boolean; model_configured: boolean }>('/health'),
  getHousehold: () => request<HouseholdSnapshot>('/v1/household'),
  createPairingChallenge: (deviceName = 'FamilyOS TV') =>
    request<{ challengeId: string; code: string; pollingToken: string; expiresAt: string }>(
      '/v1/pairing/challenges',
      { method: 'POST', body: JSON.stringify({ deviceName }) },
    ),
  claimPairing: async (challengeId: string, pollingToken: string) => {
    const response = await request<{ status: 'pending' | 'approved'; expiresAt?: string; deviceId?: string; deviceToken?: string }>(
      `/v1/pairing/challenges/${encodeURIComponent(challengeId)}/claim`,
      { method: 'POST', body: JSON.stringify({ pollingToken }) },
    );
    if (response.data.deviceToken) await setTVDeviceToken(response.data.deviceToken);
    return response;
  },
  tvDeviceToken: getTVDeviceToken,
  unpairTV: async () => {
    await request<{ unpaired: boolean }>('/v1/device/unpair', { method: 'POST', body: '{}' });
    await clearTVDeviceToken();
  },
  clearTVDeviceToken,
  getEvents: (from?: string, to?: string) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const suffix = query.toString();
    return request<CalendarEvent[]>(`/v1/events${suffix ? `?${suffix}` : ''}`);
  },
  getChores: () => request<Chore[]>('/v1/chores'),
  getRoutines: () => request<Routine[]>('/v1/routines'),
  getConflicts: () => request<Conflict[]>('/v1/conflicts'),
  getActionHistory: () => request<ProposedAction[]>('/v1/actions/history'),
  getBriefing: () => request<FamilyBriefing>('/v1/briefing'),
  createBriefing: (context: FamilyAgentContext) =>
    request<FamilyBriefing>('/v1/briefing', { method: 'POST', body: JSON.stringify(context) }, 20000),
  proposeAction: (body: { conflictId: string; eventId: string; targetMemberId: string }) =>
    request<ProposedAction>('/v1/actions/propose', { method: 'POST', body: JSON.stringify(body) }),
  confirmAction: (id: string) =>
    request<ConfirmedActionResult>(`/v1/actions/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  cancelAction: (id: string) =>
    request<ProposedAction>(`/v1/actions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  resetDemo: () => request<HouseholdSnapshot>('/v1/demo/reset', { method: 'POST' }),
};

export function createFamilyAgentContext(
  household: HouseholdSnapshot,
  conflicts: Conflict[],
  now: Date,
  weather?: { condition: string; temperatureF: number },
): FamilyAgentContext {
  return {
    date: new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: household.family.timezone,
    }).format(now),
    timezone: household.family.timezone,
    members: household.members.map(({ id, name, role }) => ({ id, name, role })),
    events: household.events.map(({ id, title, startAt, endAt, memberIds, responsibleMemberId }) => ({
      id,
      title,
      startAt,
      endAt,
      memberIds,
      ...(responsibleMemberId ? { responsibleMemberId } : {}),
    })),
    chores: household.chores.map(({ id, title, status, assignedToMemberId }) => ({
      id,
      title,
      status,
      ...(assignedToMemberId ? { assignedToMemberId } : {}),
    })),
    routines: household.routines.map((routine) => ({
      name: routine.name,
      period: routine.period,
      memberId: routine.memberId,
      completedSteps: routine.steps.filter((step) => step.completed).length,
      totalSteps: routine.steps.length,
    })),
    conflicts: conflicts.map(({ id, type, title, message, suggestedMemberId }) => ({
      id,
      type,
      title,
      message,
      ...(suggestedMemberId ? { suggestedMemberId } : {}),
    })),
    ...(weather ? { weather } : {}),
  };
}
