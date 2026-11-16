import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarEvent, TimeTableEntry } from '../types';
import { useChromeStorage } from '../hooks/useChromeStorage';
import {
  getTimeTableEntries, setTimeTableEntries,
  getCalendarEvents, setCalendarEvents,
} from '../services/storage';
import './TimeTable.css';

type Track = 'plan' | 'do';

const START_HOUR = 8;
const END_HOUR = 19;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const TRACKS: Array<{ track: Track; title: string; label: string; placeholder: string }> = [
  { track: 'plan', title: 'PLAN', label: '계획', placeholder: '계획' },
  { track: 'do', title: 'DO', label: '실행', placeholder: '실행 기록' },
];

const EMPTY_ENTRY = (date: string): TimeTableEntry => ({
  date,
  plan: {},
  do: {},
  updatedAt: 0,
});

const ONBOARDING_ENTRY: TimeTableEntry = {
  date: '',
  plan: { 9: '메일 · 메신저 정리', 10: '기획안 검토', 11: '기획안 검토', 14: '코드 리뷰', 16: '배포 준비' },
  do: { 9: '메일 정리', 10: '기획안 1차 피드백 반영', 11: '긴급 이슈 대응' },
  updatedAt: Date.now(),
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function moveDate(key: string, amount: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function formatDate(key: string): { day: string; full: string } {
  const date = fromDateKey(key);
  return {
    day: date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase(),
    full: date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function countFilled(record: Record<number, string>): number {
  return HOURS.filter((h) => record[h]?.trim()).length;
}

function useCurrentHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return hour;
}

export default function TimeTable({ isOnboarding }: { isOnboarding?: boolean }) {
  const today = toDateKey(new Date());
  const currentHour = useCurrentHour();
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries, loading] = useChromeStorage<Record<string, TimeTableEntry>>(
    'timeTableEntries',
    getTimeTableEntries,
    setTimeTableEntries,
    {},
  );
  // 캘린더 캐시는 background가 오늘 일정만 저장하므로 오늘 날짜에서만 계획 칸에 겹쳐 보여준다.
  const [calendarEvents] = useChromeStorage<CalendarEvent[]>(
    'calendarEvents',
    getCalendarEvents,
    setCalendarEvents,
    [],
  );

  const entry = isOnboarding
    ? ONBOARDING_ENTRY
    : entries[selectedDate] ?? EMPTY_ENTRY(selectedDate);
  const formattedDate = useMemo(() => formatDate(selectedDate), [selectedDate]);
  const isToday = selectedDate === today;
  const disabled = loading && !isOnboarding;

  const eventsByHour = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    if (isOnboarding) return map;
    for (const event of calendarEvents) {
      const start = new Date(event.start);
      if (toDateKey(start) !== selectedDate) continue;
      const list = map.get(start.getHours()) ?? [];
      list.push(event);
      map.set(start.getHours(), list);
    }
    return map;
  }, [calendarEvents, selectedDate, isOnboarding]);

  const planCount = countFilled(entry.plan);
  const doCount = countFilled(entry.do);

  const updateCell = useCallback((track: Track, hour: number, value: string) => {
    if (isOnboarding) return;
    void setEntries((current) => {
      const prev = current[selectedDate] ?? EMPTY_ENTRY(selectedDate);
      return {
        ...current,
        [selectedDate]: {
          ...prev,
          [track]: { ...prev[track], [hour]: value },
          updatedAt: Date.now(),
        },
      };
    });
  }, [isOnboarding, selectedDate, setEntries]);

  return (
    <div className="timetable">
      <header className="tt-header">
        <div>
          <div className="tt-eyebrow">TIME TABLE</div>
          <h1 className="tt-date">
            <span>{formattedDate.full}</span>
            <small>{formattedDate.day}</small>
          </h1>
        </div>

        <div className="tt-date-controls" aria-label="날짜 이동">
          <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, -1))} aria-label="이전 날짜">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" className="tt-today-button" onClick={() => setSelectedDate(today)} disabled={isToday}>
            오늘
          </button>
          <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, 1))} aria-label="다음 날짜">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </header>

      <div className="tt-board">
        <div className="tt-row tt-row-head">
          <span />
          {TRACKS.map(({ track, title, label }) => (
            <div key={track} className={`tt-track-title is-${track}`}>
              <span className="tt-track-letter">{title.charAt(0)}</span>
              <strong>{title}</strong>
              <small>{label}</small>
              <span className="tt-track-count">
                {track === 'plan' ? planCount : doCount} / {HOURS.length}
              </span>
            </div>
          ))}
        </div>

        {HOURS.map((hour) => {
          const isNow = isToday && hour === currentHour;
          const isPast = selectedDate < today || (isToday && hour < currentHour);
          const plan = entry.plan[hour] ?? '';
          const done = entry.do[hour] ?? '';
          const events = eventsByHour.get(hour) ?? [];

          return (
            <div key={hour} className={`tt-row${isNow ? ' is-now' : ''}${isPast ? ' is-past' : ''}`}>
              <span className="tt-hour">{formatHour(hour)}</span>

              <div className="tt-cell is-plan">
                {events.map((event) => (
                  <span key={event.id} className="tt-event" title={event.summary}>
                    {formatTime(event.start)} {event.summary}
                  </span>
                ))}
                <input
                  type="text"
                  value={plan}
                  onChange={(e) => updateCell('plan', hour, e.target.value)}
                  placeholder={TRACKS[0].placeholder}
                  disabled={disabled}
                  aria-label={`${formatHour(hour)} 계획`}
                />
              </div>

              <div className="tt-cell is-do">
                <input
                  type="text"
                  value={done}
                  onChange={(e) => updateCell('do', hour, e.target.value)}
                  placeholder={TRACKS[1].placeholder}
                  disabled={disabled}
                  aria-label={`${formatHour(hour)} 실행`}
                />
                {plan.trim() && !done.trim() && !isOnboarding && (
                  <button
                    type="button"
                    className="tt-copy"
                    onClick={() => updateCell('do', hour, plan)}
                    title="계획대로 실행 — 계획을 실행 칸에 복사"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="tt-footer">
        <span className="tt-saved-dot" />
        {entry.updatedAt ? '작성 내용은 자동으로 저장됩니다' : '시간별 계획을 먼저 적어보세요'}
      </footer>
    </div>
  );
}
