import { useEffect, useMemo, useState } from 'react';

type StatusIndicator = 'none' | 'minor' | 'major' | 'critical' | 'maintenance' | string;

interface StatusPayload {
  page?: {
    name?: string;
    url?: string;
    updated_at?: string;
  };
  status?: {
    indicator?: StatusIndicator;
    description?: string;
  };
}

interface ServiceConfig {
  id: string;
  name: string;
  statusUrl: string;
  pageUrl: string;
}

interface ServiceState {
  service: ServiceConfig;
  loading: boolean;
  error: boolean;
  indicator: StatusIndicator;
  description: string;
  updatedAt: string | null;
}

const SERVICES: ServiceConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    statusUrl: 'https://www.githubstatus.com/api/v2/status.json',
    pageUrl: 'https://www.githubstatus.com',
  },
  {
    id: 'claude',
    name: 'Claude',
    statusUrl: 'https://status.claude.com/api/v2/status.json',
    pageUrl: 'https://status.claude.com',
  },
];

function initialState(service: ServiceConfig): ServiceState {
  return {
    service,
    loading: true,
    error: false,
    indicator: 'none',
    description: 'Checking status',
    updatedAt: null,
  };
}

function getStatusLabel(indicator: StatusIndicator): string {
  if (indicator === 'none') return 'Operational';
  if (indicator === 'minor') return 'Degraded';
  if (indicator === 'major') return 'Partial outage';
  if (indicator === 'critical') return 'Major outage';
  if (indicator === 'maintenance') return 'Maintenance';
  return 'Status issue';
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ServiceStatus() {
  const [states, setStates] = useState<ServiceState[]>(() => SERVICES.map(initialState));

  useEffect(() => {
    let cancelled = false;

    async function load(service: ServiceConfig) {
      try {
        const res = await fetch(service.statusUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
        const data = (await res.json()) as StatusPayload;
        if (cancelled) return;
        setStates((prev) =>
          prev.map((state) =>
            state.service.id === service.id
              ? {
                  service,
                  loading: false,
                  error: false,
                  indicator: data.status?.indicator ?? 'none',
                  description: data.status?.description ?? getStatusLabel(data.status?.indicator ?? 'none'),
                  updatedAt: data.page?.updated_at ?? null,
                }
              : state,
          ),
        );
      } catch {
        if (cancelled) return;
        setStates((prev) =>
          prev.map((state) =>
            state.service.id === service.id
              ? {
                  ...state,
                  loading: false,
                  error: true,
                  indicator: 'major',
                  description: 'Unable to check',
                }
              : state,
          ),
        );
      }
    }

    SERVICES.forEach((service) => {
      void load(service);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const healthyCount = useMemo(
    () => states.filter((state) => !state.loading && !state.error && state.indicator === 'none').length,
    [states],
  );

  return (
    <div className="section service-status-section">
      <div className="section-header">
        <span className="section-title">Service Status</span>
        <span className="section-badge">
          {healthyCount}/{states.length} ok
        </span>
      </div>

      <div className="service-status-grid">
        {states.map((state) => {
          const statusClass = state.loading
            ? 'is-loading'
            : state.error
              ? 'is-error'
              : `is-${state.indicator}`;
          const updated = formatUpdatedAt(state.updatedAt);

          return (
            <a
              key={state.service.id}
              className={`service-status-card ${statusClass}`}
              href={state.service.pageUrl}
              title={state.description}
            >
              <span className="service-status-dot" />
              <span className="service-status-main">
                <span className="service-status-name">{state.service.name}</span>
                <span className="service-status-description">
                  {state.loading ? 'Checking...' : state.description}
                </span>
              </span>
              <span className="service-status-meta">
                {state.loading ? '' : updated || getStatusLabel(state.indicator)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
