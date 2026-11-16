import type { DevDashboardConfig } from '../types';

export interface GithubPull {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string;                       // 'owner/name'
  draft: boolean;
  updatedAt: string;
  jiraKeys: string[];                 // 제목에서 추출한 Jira 이슈 키
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;             // 'new' | 'indeterminate' | 'done'
  priority: string | null;
  type: string;
  url: string;
  updatedAt: string;
}

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;                      // 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  count: number;                      // statsPeriod 내 이벤트 수
  userCount: number;
  project: string;
  url: string;
  lastSeen: string;
}

export interface DevDashboardData {
  fetchedAt: number;
  github: { myPulls: GithubPull[]; reviewRequests: GithubPull[] } | null;
  jira: { issues: JiraIssue[] } | null;
  // 이전 버전 캐시에는 sentry 필드가 없을 수 있다
  sentry?: { issues: SentryIssue[]; total: number } | null;
  githubError: string | null;
  jiraError: string | null;
  sentryError?: string | null;
}

export const GITHUB_ORIGIN = 'https://api.github.com/*';
export const JIRA_ORIGIN = 'https://*.atlassian.net/*';
export const SENTRY_ORIGINS = ['https://sentry.io/*', 'https://*.sentry.io/*'];

const GITHUB_API = 'https://api.github.com';
const JIRA_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
const SENTRY_QUERY = 'is:unresolved';
const SENTRY_PERIOD = '24h';
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

const hasPermissionsApi = typeof chrome !== 'undefined' && !!chrome.permissions;

/* ── helpers ─────────────────────────────────────────── */

export function extractJiraKeys(text: string): string[] {
  return [...new Set(text.match(JIRA_KEY_RE) ?? [])];
}

export function normalizeJiraDomain(input: string): string {
  return input.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function normalizeSentryHost(input: string): string {
  return input.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'sentry.io';
}

export function jiraBrowseUrl(domain: string, key: string): string {
  return `https://${normalizeJiraDomain(domain)}/browse/${key}`;
}

export function hasGithubConfig(config: DevDashboardConfig): boolean {
  return !!config.githubToken.trim();
}

export function hasJiraConfig(config: DevDashboardConfig): boolean {
  return !!(config.jiraDomain.trim() && config.jiraEmail.trim() && config.jiraToken.trim());
}

export function hasSentryConfig(config: DevDashboardConfig): boolean {
  return !!(config.sentryOrg.trim() && config.sentryToken.trim());
}

/* ── permissions ─────────────────────────────────────── */

// optional_host_permissions — 사용자가 연동을 저장할 때만 요청한다.
// (필수 권한으로 추가하면 스토어 업데이트 시 기존 사용자의 확장이 비활성화된다)
export async function requestOrigins(origins: string[]): Promise<boolean> {
  if (!hasPermissionsApi || origins.length === 0) return true;
  return chrome.permissions.request({ origins });
}

async function hasOrigin(...origins: string[]): Promise<boolean> {
  if (!hasPermissionsApi) return true;
  return chrome.permissions.contains({ origins });
}

/* ── GitHub ──────────────────────────────────────────── */

async function searchPulls(token: string, query: string): Promise<GithubPull[]> {
  const params = new URLSearchParams({ q: query, sort: 'updated', order: 'desc', per_page: '20' });
  const res = await fetch(`${GITHUB_API}/search/issues?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('GitHub 토큰이 유효하지 않습니다');
    if (res.status === 403) throw new Error('GitHub API 한도 초과 또는 권한 부족');
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data = await res.json();
  return (data.items ?? []).map((item: any): GithubPull => ({
    id: item.id,
    number: item.number,
    title: item.title ?? '',
    url: item.html_url,
    repo: String(item.repository_url ?? '').split('/').slice(-2).join('/'),
    draft: !!item.draft,
    updatedAt: item.updated_at,
    jiraKeys: extractJiraKeys(item.title ?? ''),
  }));
}

async function fetchGithub(config: DevDashboardConfig) {
  if (!(await hasOrigin(GITHUB_ORIGIN))) throw new Error('GitHub 접근 권한이 필요합니다');
  const token = config.githubToken.trim();
  const [myPulls, reviewRequests] = await Promise.all([
    searchPulls(token, 'is:open is:pr author:@me archived:false'),
    searchPulls(token, 'is:open is:pr review-requested:@me archived:false'),
  ]);
  return { myPulls, reviewRequests };
}

/* ── Jira ────────────────────────────────────────────── */

async function fetchJira(config: DevDashboardConfig) {
  if (!(await hasOrigin(JIRA_ORIGIN))) throw new Error('Jira 접근 권한이 필요합니다');
  const domain = normalizeJiraDomain(config.jiraDomain);
  const params = new URLSearchParams({
    jql: JIRA_JQL,
    fields: 'summary,status,priority,issuetype,updated',
    maxResults: '30',
  });
  const res = await fetch(`https://${domain}/rest/api/3/search/jql?${params}`, {
    headers: {
      Authorization: `Basic ${btoa(`${config.jiraEmail.trim()}:${config.jiraToken.trim()}`)}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Jira 인증 정보를 확인해주세요');
    throw new Error(`Jira API error: ${res.status}`);
  }
  const data = await res.json();
  const issues = (data.issues ?? []).map((item: any): JiraIssue => ({
    key: item.key,
    summary: item.fields?.summary ?? '',
    status: item.fields?.status?.name ?? '',
    statusCategory: item.fields?.status?.statusCategory?.key ?? 'new',
    priority: item.fields?.priority?.name ?? null,
    type: item.fields?.issuetype?.name ?? '',
    url: jiraBrowseUrl(domain, item.key),
    updatedAt: item.fields?.updated ?? '',
  }));
  return { issues };
}

/* ── Sentry ──────────────────────────────────────────── */

async function fetchSentry(config: DevDashboardConfig) {
  if (!(await hasOrigin(...SENTRY_ORIGINS))) throw new Error('Sentry 접근 권한이 필요합니다');
  const host = normalizeSentryHost(config.sentryHost);
  const org = encodeURIComponent(config.sentryOrg.trim());
  const params = new URLSearchParams({
    query: SENTRY_QUERY,
    statsPeriod: SENTRY_PERIOD,
    sort: 'freq',
    limit: '20',
  });
  const res = await fetch(`https://${host}/api/0/organizations/${org}/issues/?${params}`, {
    headers: { Authorization: `Bearer ${config.sentryToken.trim()}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Sentry 토큰 또는 권한(event:read)을 확인해주세요');
    if (res.status === 404) throw new Error('Sentry organization slug를 확인해주세요');
    throw new Error(`Sentry API error: ${res.status}`);
  }
  const data = await res.json();
  const issues = (Array.isArray(data) ? data : []).map((item: any): SentryIssue => ({
    id: String(item.id),
    shortId: item.shortId ?? '',
    title: item.title ?? '',
    culprit: item.culprit ?? '',
    level: item.level ?? 'error',
    count: Number(item.count) || 0,
    userCount: Number(item.userCount) || 0,
    project: item.project?.slug ?? '',
    url: item.permalink ?? '',
    lastSeen: item.lastSeen ?? '',
  }));
  // X-Hits: limit과 무관한 전체 매칭 이슈 수 (없으면 받은 개수로 대체)
  const total = Number(res.headers.get('X-Hits')) || issues.length;
  return { issues, total };
}

/* ── aggregate ───────────────────────────────────────── */

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function loadDevDashboard(config: DevDashboardConfig): Promise<DevDashboardData> {
  const [github, jira, sentry] = await Promise.allSettled([
    hasGithubConfig(config) ? fetchGithub(config) : Promise.resolve(null),
    hasJiraConfig(config) ? fetchJira(config) : Promise.resolve(null),
    hasSentryConfig(config) ? fetchSentry(config) : Promise.resolve(null),
  ]);
  return {
    fetchedAt: Date.now(),
    github: github.status === 'fulfilled' ? github.value : null,
    jira: jira.status === 'fulfilled' ? jira.value : null,
    sentry: sentry.status === 'fulfilled' ? sentry.value : null,
    githubError: github.status === 'rejected' ? toMessage(github.reason) : null,
    jiraError: jira.status === 'rejected' ? toMessage(jira.reason) : null,
    sentryError: sentry.status === 'rejected' ? toMessage(sentry.reason) : null,
  };
}
