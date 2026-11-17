import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DevDashboardConfig } from '../types';
import { useChromeStorage } from '../hooks/useChromeStorage';
import {
  getDevDashboardConfig, setDevDashboardConfig,
  getDevDashboardCache, setDevDashboardCache,
  EMPTY_DEV_DASHBOARD_CONFIG,
} from '../services/storage';
import {
  DevDashboardData, GithubPull, JiraIssue, SentryIssue,
  GITHUB_ORIGIN, JIRA_ORIGIN, SENTRY_ORIGINS,
  hasGithubConfig, hasJiraConfig, hasSentryConfig,
  jiraBrowseUrl, loadDevDashboard, normalizeJiraDomain, normalizeSentryHost, requestOrigins,
} from '../services/devDashboard';
import './DevDashboard.css';

// GitHub search API 한도(30req/min)를 고려해 새 탭마다 호출하지 않고 캐시를 재사용한다.
const CACHE_TTL_MS = 3 * 60 * 1000;
const STALE_CHECK_MS = 60 * 1000;
const TAB_KEY = 'devDashboardTab';
const VIEW_KEY = 'devDashboardView';

type Tab = 'jira' | 'github' | 'sentry';
type View = 'tabs' | 'cards';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'jira', label: 'Jira' },
  { id: 'github', label: 'GitHub' },
  { id: 'sentry', label: 'Sentry' },
];

function loadTab(): Tab {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    if (raw === 'jira' || raw === 'github' || raw === 'sentry') return raw;
  } catch { /* ignore */ }
  return 'jira';
}

function loadView(): View {
  try {
    if (localStorage.getItem(VIEW_KEY) === 'cards') return 'cards';
  } catch { /* ignore */ }
  return 'tabs';
}

const ONBOARDING_DOMAIN = 'your-team.atlassian.net';

const ONBOARDING_DATA: DevDashboardData = {
  fetchedAt: Date.now(),
  github: {
    myPulls: [
      { id: 1, number: 128, title: 'DESC-42 타임테이블 뷰 추가', url: '#', repo: 'team/descle', draft: false, updatedAt: '', jiraKeys: ['DESC-42'] },
      { id: 2, number: 131, title: 'DESC-45 북마크 패널 이동', url: '#', repo: 'team/descle', draft: true, updatedAt: '', jiraKeys: ['DESC-45'] },
    ],
    reviewRequests: [
      { id: 3, number: 77, title: 'API 응답 캐시 정책 변경', url: '#', repo: 'team/api', draft: false, updatedAt: '', jiraKeys: [] },
    ],
  },
  jira: {
    issues: [
      { key: 'DESC-42', summary: '타임테이블 뷰 추가', status: 'In Progress', statusCategory: 'indeterminate', priority: 'High', type: 'Story', url: '#', updatedAt: '' },
      { key: 'DESC-45', summary: '북마크 패널 이동', status: 'In Review', statusCategory: 'indeterminate', priority: 'Medium', type: 'Task', url: '#', updatedAt: '' },
      { key: 'DESC-51', summary: '다크모드 대비 개선', status: 'To Do', statusCategory: 'new', priority: 'Low', type: 'Bug', url: '#', updatedAt: '' },
    ],
  },
  sentry: {
    total: 3,
    issues: [
      { id: 's1', shortId: 'WEB-3F', title: "TypeError: Cannot read properties of undefined (reading 'map')", culprit: 'src/pages/Search.tsx', level: 'error', count: 214, userCount: 87, project: 'web', url: '#', lastSeen: '' },
      { id: 's2', shortId: 'API-1C', title: 'TimeoutError: upstream request timed out', culprit: 'GET /v1/reservations', level: 'fatal', count: 42, userCount: 19, project: 'api', url: '#', lastSeen: '' },
      { id: 's3', shortId: 'WEB-41', title: 'ResizeObserver loop limit exceeded', culprit: 'window', level: 'warning', count: 12, userCount: 9, project: 'web', url: '#', lastSeen: '' },
    ],
  },
  githubError: null,
  jiraError: null,
  sentryError: null,
};

function formatFetchedAt(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(ts);
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export default function DevDashboard({ isOnboarding }: { isOnboarding?: boolean }) {
  const [config, setConfig, configLoading] = useChromeStorage<DevDashboardConfig>(
    'devDashboardConfig',
    getDevDashboardConfig,
    setDevDashboardConfig,
    EMPTY_DEV_DASHBOARD_CONFIG,
  );
  const [cache, setCache, cacheLoading] = useChromeStorage<DevDashboardData | null>(
    'devDashboardCache',
    getDevDashboardCache,
    setDevDashboardCache,
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(loadTab);
  const [view, setView] = useState<View>(loadView);

  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

  const enabled: Record<Tab, boolean> = {
    jira: !!isOnboarding || hasJiraConfig(config),
    github: !!isOnboarding || hasGithubConfig(config),
    sentry: !!isOnboarding || hasSentryConfig(config),
  };
  const configured = enabled.jira || enabled.github || enabled.sentry;
  const data = isOnboarding ? ONBOARDING_DATA : cache;
  const jiraDomain = isOnboarding ? ONBOARDING_DOMAIN : config.jiraDomain;

  const refreshingRef = useRef(false);
  const refresh = useCallback(async (target: DevDashboardConfig) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await setCache(await loadDevDashboard(target));
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [setCache]);

  // 마운트 시 + 탭이 보이는 동안 주기적으로 캐시 신선도 확인
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  useEffect(() => {
    if (isOnboarding || configLoading || cacheLoading) return;
    if (!hasGithubConfig(config) && !hasJiraConfig(config) && !hasSentryConfig(config)) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      const fetchedAt = cacheRef.current?.fetchedAt ?? 0;
      if (Date.now() - fetchedAt > CACHE_TTL_MS) void refresh(config);
    };
    refreshIfStale();
    const timer = window.setInterval(refreshIfStale, STALE_CHECK_MS);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [isOnboarding, configLoading, cacheLoading, config, refresh]);

  const handleSave = useCallback(async (next: DevDashboardConfig) => {
    const normalized = {
      ...next,
      jiraDomain: normalizeJiraDomain(next.jiraDomain),
      sentryHost: normalizeSentryHost(next.sentryHost),
    };
    const origins = [
      ...(hasGithubConfig(normalized) ? [GITHUB_ORIGIN] : []),
      ...(hasJiraConfig(normalized) ? [JIRA_ORIGIN] : []),
      ...(hasSentryConfig(normalized) ? SENTRY_ORIGINS : []),
    ];
    // permissions.request는 사용자 제스처 안에서 호출해야 하므로 저장 클릭 직후 먼저 요청한다.
    const granted = await requestOrigins(origins);
    await setConfig(normalized);
    setSettingsOpen(false);
    if (granted) await refresh(normalized);
  }, [setConfig, refresh]);

  const pulls = useMemo(
    () => [...(data?.github?.myPulls ?? []), ...(data?.github?.reviewRequests ?? [])],
    [data],
  );
  const pullsByJiraKey = useMemo(() => {
    const map = new Map<string, GithubPull[]>();
    for (const pull of pulls) {
      for (const key of pull.jiraKeys) {
        const list = map.get(key) ?? [];
        if (!list.some((p) => p.id === pull.id)) list.push(pull);
        map.set(key, list);
      }
    }
    return map;
  }, [pulls]);

  const issues = data?.jira?.issues ?? [];
  const myPulls = data?.github?.myPulls ?? [];
  const reviewRequests = data?.github?.reviewRequests ?? [];
  const sentryIssues = data?.sentry?.issues ?? [];

  const tabCounts: Record<Tab, number | null> = {
    jira: data?.jira ? issues.length : null,
    github: data?.github ? reviewRequests.length + myPulls.length : null,
    sentry: data?.sentry ? data.sentry.total : null,
  };
  const tabErrors: Record<Tab, string | null> = {
    jira: data?.jiraError ?? null,
    github: data?.githubError ?? null,
    sentry: data?.sentryError ?? null,
  };

  if (configLoading) return null;

  const loadingText = refreshing ? 'Loading...' : '데이터 없음';

  const renderPanel = (id: Tab) => (
    !enabled[id] ? (
      <div className="dd-connect">
        <p>{TABS.find((t) => t.id === id)?.label} 연동이 필요합니다</p>
        {!settingsOpen && (
          <button type="button" className="dd-btn-primary" onClick={() => setSettingsOpen(true)}>
            연동하기
          </button>
        )}
      </div>
    ) : tabErrors[id] ? (
      <p className="dd-error">{tabErrors[id]}</p>
    ) : id === 'jira' ? (
      <>
        <div className="dd-kpis">
          <Kpi label="할 일" value={data?.jira ? issues.filter((i) => i.statusCategory === 'new').length : null} />
          <Kpi label="진행 중" value={data?.jira ? issues.filter((i) => i.statusCategory === 'indeterminate').length : null} tone="accent" />
        </div>
        <div className="dd-group">
          <div className="dd-group-title">내 이슈</div>
          {!data?.jira ? (
            <p className="dd-empty">{loadingText}</p>
          ) : issues.length === 0 ? (
            <p className="dd-empty">할당된 미완료 이슈가 없습니다</p>
          ) : (
            <ul className="dd-list">
              {issues.map((issue) => (
                <IssueRow key={issue.key} issue={issue} pulls={pullsByJiraKey.get(issue.key) ?? []} />
              ))}
            </ul>
          )}
        </div>
      </>
    ) : id === 'github' ? (
      <>
        <div className="dd-kpis">
          <Kpi label="리뷰 요청" value={data?.github ? reviewRequests.length : null} tone={reviewRequests.length > 0 ? 'warn' : undefined} />
          <Kpi label="내 PR" value={data?.github ? myPulls.length : null} />
        </div>
        <PullGroup
          title="리뷰 요청"
          pulls={reviewRequests}
          empty="대기 중인 리뷰가 없습니다"
          loading={!data?.github}
          loadingText={loadingText}
          jiraDomain={enabled.jira ? jiraDomain : null}
        />
        <PullGroup
          title="내 Pull Request"
          pulls={myPulls}
          empty="열린 PR이 없습니다"
          loading={!data?.github}
          loadingText={loadingText}
          jiraDomain={enabled.jira ? jiraDomain : null}
        />
      </>
    ) : (
      <>
        <div className="dd-kpis">
          <Kpi label="미해결 (24h)" value={data?.sentry ? data.sentry.total : null} />
          <Kpi
            label="fatal · error"
            value={data?.sentry ? sentryIssues.filter((i) => i.level === 'fatal' || i.level === 'error').length : null}
            tone={sentryIssues.some((i) => i.level === 'fatal') ? 'danger' : undefined}
          />
        </div>
        <div className="dd-group">
          <div className="dd-group-title">이벤트 많은 순</div>
          {!data?.sentry ? (
            <p className="dd-empty">{loadingText}</p>
          ) : sentryIssues.length === 0 ? (
            <p className="dd-empty">최근 24시간 미해결 이슈가 없습니다</p>
          ) : (
            <ul className="dd-list">
              {sentryIssues.map((issue) => (
                <SentryRow key={issue.id} issue={issue} />
              ))}
            </ul>
          )}
        </div>
      </>
    )
  );

  return (
    <div className="section dev-dashboard">
      <div className="section-header">
        <span className="section-title">Dev Dashboard</span>
        <div className="dd-header-actions">
          {data && configured && (
            <span className="section-badge">{formatFetchedAt(data.fetchedAt)}</span>
          )}
          {configured && !isOnboarding && (
            <button
              type="button"
              className={`dd-icon-btn${refreshing ? ' is-spinning' : ''}`}
              onClick={() => void refresh(config)}
              disabled={refreshing}
              title={data ? `새로고침 (마지막 갱신 ${formatFetchedAt(data.fetchedAt)})` : '새로고침'}
            >
              <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
            </button>
          )}
          <div className="dd-view-toggle" role="radiogroup" aria-label="보기 방식">
            <button
              type="button"
              role="radio"
              aria-checked={view === 'tabs'}
              className={`dd-icon-btn${view === 'tabs' ? ' is-active' : ''}`}
              onClick={() => setView('tabs')}
              title="탭 뷰"
            >
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M9 4v5" /></svg>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'cards'}
              className={`dd-icon-btn${view === 'cards' ? ' is-active' : ''}`}
              onClick={() => setView('cards')}
              title="카드 뷰"
            >
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            </button>
          </div>
          {!isOnboarding && (
            <button
              type="button"
              className={`dd-icon-btn${settingsOpen ? ' is-active' : ''}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="연동 설정"
            >
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {settingsOpen && (
        <SettingsForm initial={config} onSave={handleSave} onCancel={() => setSettingsOpen(false)} />
      )}

      {view === 'tabs' ? (
        <>
          <div className="dd-tabs" role="tablist">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`dd-tab${tab === id ? ' is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
                <TabBadge error={tabErrors[id]} count={enabled[id] ? tabCounts[id] : null} />
              </button>
            ))}
          </div>
          <div className="dd-panel" role="tabpanel">
            {renderPanel(tab)}
          </div>
        </>
      ) : (
        <div className="dd-cards">
          {TABS.map(({ id, label }) => (
            <section key={id} className={`dd-card${enabled[id] ? '' : ' is-disabled'}`}>
              <header className="dd-card-header">
                <span className="dd-card-title">{label}</span>
                <TabBadge error={tabErrors[id]} count={enabled[id] ? tabCounts[id] : null} />
              </header>
              {renderPanel(id)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── sub components ──────────────────────────────────── */

function TabBadge({ error, count }: { error: string | null; count: number | null }) {
  if (error) return <span className="dd-tab-badge is-error" title={error}>!</span>;
  if (count === null) return null;
  return <span className="dd-tab-badge">{count}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: number | null; tone?: 'accent' | 'warn' | 'danger' }) {
  return (
    <div className={`dd-kpi${tone ? ` is-${tone}` : ''}`}>
      <span className="dd-kpi-value">{value ?? '–'}</span>
      <span className="dd-kpi-label">{label}</span>
    </div>
  );
}

function IssueRow({ issue, pulls }: { issue: JiraIssue; pulls: GithubPull[] }) {
  return (
    <li className="dd-item">
      <a className="dd-item-main" href={issue.url} title={issue.summary}>
        <span className={`dd-status-dot is-${issue.statusCategory}`} />
        <span className="dd-key">{issue.key}</span>
        <span className="dd-item-title">{issue.summary}</span>
        <span className={`dd-pill is-${issue.statusCategory}`}>{issue.status}</span>
      </a>
      {pulls.length > 0 && (
        <div className="dd-links">
          {pulls.map((pull) => (
            <a key={pull.id} className="dd-chip" href={pull.url} title={pull.title}>
              <PrIcon />
              #{pull.number}
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

function SentryRow({ issue }: { issue: SentryIssue }) {
  return (
    <li className="dd-item">
      <a className="dd-item-main is-stacked" href={issue.url} title={issue.title}>
        <span className="dd-item-line">
          <span className={`dd-level-dot is-${issue.level}`} title={issue.level} />
          <span className="dd-item-title">{issue.title}</span>
        </span>
        <span className="dd-item-meta">
          <span className="dd-key">{issue.shortId}</span>
          {issue.culprit && <span className="dd-culprit">{issue.culprit}</span>}
          <span className="dd-stat" title="이벤트">{formatCount(issue.count)} events</span>
          <span className="dd-stat" title="영향 사용자">{formatCount(issue.userCount)} users</span>
        </span>
      </a>
    </li>
  );
}

function PullGroup({
  title, pulls, empty, loading, loadingText, jiraDomain,
}: {
  title: string;
  pulls: GithubPull[];
  empty: string;
  loading: boolean;
  loadingText: string;
  jiraDomain: string | null;
}) {
  return (
    <div className="dd-group">
      <div className="dd-group-title">{title}</div>
      {loading ? (
        <p className="dd-empty">{loadingText}</p>
      ) : pulls.length === 0 ? (
        <p className="dd-empty">{empty}</p>
      ) : (
        <ul className="dd-list">
          {pulls.map((pull) => (
            <li key={pull.id} className="dd-item">
              <a className="dd-item-main" href={pull.url} title={pull.title}>
                <PrIcon draft={pull.draft} />
                <span className="dd-item-title">{pull.title}</span>
                <span className="dd-repo">{pull.repo}#{pull.number}</span>
              </a>
              {jiraDomain && pull.jiraKeys.length > 0 && (
                <div className="dd-links">
                  {pull.jiraKeys.map((key) => (
                    <a key={key} className="dd-chip" href={jiraBrowseUrl(jiraDomain, key)}>
                      {key}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrIcon({ draft }: { draft?: boolean }) {
  return (
    <svg className={`dd-pr-icon${draft ? ' is-draft' : ''}`} viewBox="0 0 24 24">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5v7" />
      <path d="M18 15.5V9a3 3 0 0 0-3-3h-4" />
      <path d="m13 3.5-2.5 2.5L13 8.5" />
    </svg>
  );
}

function SettingsForm({
  initial, onSave, onCancel,
}: {
  initial: DevDashboardConfig;
  onSave: (config: DevDashboardConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const update = (field: keyof DevDashboardConfig) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dd-settings">
      <p className="dd-settings-hint">토큰은 이 브라우저의 chrome.storage.local에만 저장됩니다.</p>

      <div className="dd-settings-title">Jira Cloud</div>
      <label className="dd-field">
        <span>Site</span>
        <input type="text" value={draft.jiraDomain} onChange={update('jiraDomain')} placeholder="your-team.atlassian.net" />
      </label>
      <label className="dd-field">
        <span>Email</span>
        <input type="email" value={draft.jiraEmail} onChange={update('jiraEmail')} placeholder="me@company.com" />
      </label>
      <label className="dd-field">
        <span>API token</span>
        <input type="password" value={draft.jiraToken} onChange={update('jiraToken')} placeholder="id.atlassian.com에서 발급" />
      </label>

      <div className="dd-settings-title">GitHub</div>
      <label className="dd-field">
        <span>Personal access token</span>
        <input type="password" value={draft.githubToken} onChange={update('githubToken')} placeholder="ghp_… / github_pat_…" />
      </label>

      <div className="dd-settings-title">Sentry</div>
      <label className="dd-field">
        <span>Host</span>
        <input type="text" value={draft.sentryHost} onChange={update('sentryHost')} placeholder="sentry.io (EU: de.sentry.io)" />
      </label>
      <label className="dd-field">
        <span>Organization slug</span>
        <input type="text" value={draft.sentryOrg} onChange={update('sentryOrg')} placeholder="my-org" />
      </label>
      <label className="dd-field">
        <span>Auth token</span>
        <input type="password" value={draft.sentryToken} onChange={update('sentryToken')} placeholder="sntryu_… (event:read 권한)" />
      </label>

      <div className="dd-settings-actions">
        <button type="button" className="dd-btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="dd-btn-primary"
          onClick={() => void submit()}
          disabled={saving || (!hasGithubConfig(draft) && !hasJiraConfig(draft) && !hasSentryConfig(draft))}
        >
          {saving ? 'Saving...' : 'Save & Connect'}
        </button>
      </div>
    </div>
  );
}
