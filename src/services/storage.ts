import {
  Todo, LinkGroup, FastLink, CalendarEvent, Routine, PdsEntry, TimeTableEntry, DevDashboardConfig,
  DEFAULT_LINK_GROUPS,
} from '../types';
import type { DevDashboardData } from './devDashboard';

const STORAGE_KEYS = {
  todos: 'todos',
  routines: 'routines',
  pdsEntries: 'pdsEntries',
  timeTableEntries: 'timeTableEntries',
  devDashboardConfig: 'devDashboardConfig',
  devDashboardCache: 'devDashboardCache',
  linkGroups: 'linkGroups',
  fastLinks: 'fastLinks',
  calendarEvents: 'calendarEvents',
  calendarLastFetched: 'calendarLastFetched',
  oauthConnected: 'oauthConnected',
  userEmail: 'userEmail',
  userProfileImage: 'userProfileImage',
  onboardingCompleted: 'onboardingCompleted',
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// chrome.storage.local.get()은 값 타입을 모르므로({[key]: unknown}) 키별 타입을 여기서 한 번만 단언한다.
async function getItem<T>(key: StorageKey, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? fallback;
}

async function setItem<T>(key: StorageKey, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getTodos(): Promise<Todo[]> {
  return getItem(STORAGE_KEYS.todos, []);
}

export async function setTodos(todos: Todo[]): Promise<void> {
  await setItem(STORAGE_KEYS.todos, todos);
}

export async function getRoutines(): Promise<Routine[]> {
  return getItem(STORAGE_KEYS.routines, []);
}

export async function setRoutines(routines: Routine[]): Promise<void> {
  await setItem(STORAGE_KEYS.routines, routines);
}

export async function getPdsEntries(): Promise<Record<string, PdsEntry>> {
  return getItem(STORAGE_KEYS.pdsEntries, {});
}

export async function setPdsEntries(entries: Record<string, PdsEntry>): Promise<void> {
  await setItem(STORAGE_KEYS.pdsEntries, entries);
}

export async function getTimeTableEntries(): Promise<Record<string, TimeTableEntry>> {
  return getItem(STORAGE_KEYS.timeTableEntries, {});
}

export async function setTimeTableEntries(entries: Record<string, TimeTableEntry>): Promise<void> {
  await setItem(STORAGE_KEYS.timeTableEntries, entries);
}

export const EMPTY_DEV_DASHBOARD_CONFIG: DevDashboardConfig = {
  githubToken: '',
  jiraDomain: '',
  jiraEmail: '',
  jiraToken: '',
  sentryHost: 'sentry.io',
  sentryOrg: '',
  sentryToken: '',
};

export async function getDevDashboardConfig(): Promise<DevDashboardConfig> {
  // 이전 버전에서 저장된 설정에 새 필드(sentry*)가 없을 수 있어 기본값과 병합한다.
  const stored = await getItem<Partial<DevDashboardConfig>>(STORAGE_KEYS.devDashboardConfig, {});
  return { ...EMPTY_DEV_DASHBOARD_CONFIG, ...stored };
}

export async function setDevDashboardConfig(config: DevDashboardConfig): Promise<void> {
  await setItem(STORAGE_KEYS.devDashboardConfig, config);
}

export async function getDevDashboardCache(): Promise<DevDashboardData | null> {
  return getItem(STORAGE_KEYS.devDashboardCache, null);
}

export async function setDevDashboardCache(data: DevDashboardData | null): Promise<void> {
  await setItem(STORAGE_KEYS.devDashboardCache, data);
}

export async function getFastLinks(): Promise<FastLink[]> {
  return getItem(STORAGE_KEYS.fastLinks, []);
}

export async function setFastLinks(links: FastLink[]): Promise<void> {
  await setItem(STORAGE_KEYS.fastLinks, links);
}

export async function getLinkGroups(): Promise<LinkGroup[]> {
  const groups = await getItem<LinkGroup[]>(STORAGE_KEYS.linkGroups, []);
  if (groups.length === 0) {
    await setLinkGroups(DEFAULT_LINK_GROUPS);
    return DEFAULT_LINK_GROUPS;
  }
  return groups;
}

export async function setLinkGroups(groups: LinkGroup[]): Promise<void> {
  await setItem(STORAGE_KEYS.linkGroups, groups);
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return getItem(STORAGE_KEYS.calendarEvents, []);
}

export async function setCalendarEvents(events: CalendarEvent[]): Promise<void> {
  await setItem(STORAGE_KEYS.calendarEvents, events);
}

export async function getCalendarLastFetched(): Promise<number | null> {
  return getItem(STORAGE_KEYS.calendarLastFetched, null);
}

export async function setCalendarLastFetched(timestamp: number): Promise<void> {
  await setItem(STORAGE_KEYS.calendarLastFetched, timestamp);
}

export async function getOAuthConnected(): Promise<boolean> {
  return getItem(STORAGE_KEYS.oauthConnected, false);
}

export async function setOAuthConnected(connected: boolean): Promise<void> {
  await setItem(STORAGE_KEYS.oauthConnected, connected);
}

export async function getUserEmail(): Promise<string | null> {
  return getItem(STORAGE_KEYS.userEmail, null);
}

export async function setUserEmail(email: string | null): Promise<void> {
  await setItem(STORAGE_KEYS.userEmail, email);
}

export async function getUserProfileImage(): Promise<string | null> {
  return getItem(STORAGE_KEYS.userProfileImage, null);
}

export async function setUserProfileImage(url: string | null): Promise<void> {
  await setItem(STORAGE_KEYS.userProfileImage, url);
}

export async function getOnboardingCompleted(): Promise<boolean> {
  return getItem(STORAGE_KEYS.onboardingCompleted, false);
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  await setItem(STORAGE_KEYS.onboardingCompleted, completed);
}

export { STORAGE_KEYS };
