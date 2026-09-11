import { useCallback, useMemo, useState } from 'react';
import type { PdsEntry } from '../types';
import { useChromeStorage } from '../hooks/useChromeStorage';
import { getPdsEntries, setPdsEntries } from '../services/storage';
import './PdsDiary.css';

type PdsField = 'plan' | 'do' | 'see';

const EMPTY_ENTRY = (date: string): PdsEntry => ({
  date,
  plan: '',
  do: '',
  see: '',
  updatedAt: 0,
});

const ONBOARDING_ENTRY: PdsEntry = {
  date: '',
  plan: '가장 중요한 업무 한 가지 끝내기\n오후 미팅 전에 기획안 검토하기',
  do: '집중 시간 90분 확보\n기획안 1차 피드백 반영',
  see: '오전 집중력이 좋았다. 내일은 메신저를 끄고 더 일찍 시작해 보자.',
  updatedAt: Date.now(),
};

const SECTIONS: Array<{
  field: PdsField;
  label: string;
  title: string;
  prompt: string;
  placeholder: string;
}> = [
  {
    field: 'plan',
    label: 'P',
    title: 'PLAN',
    prompt: '오늘 무엇을 이루고 싶나요?',
    placeholder: '오늘의 목표와 우선순위를 적어보세요.',
  },
  {
    field: 'do',
    label: 'D',
    title: 'DO',
    prompt: '실제로 무엇을 했나요?',
    placeholder: '실행한 일과 진행 상황을 기록하세요.',
  },
  {
    field: 'see',
    label: 'S',
    title: 'SEE',
    prompt: '무엇을 배우고 느꼈나요?',
    placeholder: '잘한 점, 아쉬운 점, 내일의 힌트를 남겨보세요.',
  },
];

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

export default function PdsDiary({ isOnboarding }: { isOnboarding?: boolean }) {
  const today = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries, loading] = useChromeStorage<Record<string, PdsEntry>>(
    'pdsEntries',
    getPdsEntries,
    setPdsEntries,
    {},
  );

  const entry = isOnboarding
    ? ONBOARDING_ENTRY
    : entries[selectedDate] ?? EMPTY_ENTRY(selectedDate);
  const formattedDate = useMemo(() => formatDate(selectedDate), [selectedDate]);
  const isToday = selectedDate === today;
  const completedSections = SECTIONS.filter(({ field }) => entry[field].trim()).length;

  const updateField = useCallback((field: PdsField, value: string) => {
    if (isOnboarding) return;
    void setEntries((current) => ({
      ...current,
      [selectedDate]: {
        ...(current[selectedDate] ?? EMPTY_ENTRY(selectedDate)),
        [field]: value,
        updatedAt: Date.now(),
      },
    }));
  }, [isOnboarding, selectedDate, setEntries]);

  return (
    <div className="pds-diary">
      <header className="pds-header">
        <div>
          <div className="pds-eyebrow">PDS DIARY</div>
          <h1 className="pds-date">
            <span>{formattedDate.full}</span>
            <small>{formattedDate.day}</small>
          </h1>
        </div>

        <div className="pds-date-controls" aria-label="날짜 이동">
          <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, -1))} aria-label="이전 날짜">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" className="pds-today-button" onClick={() => setSelectedDate(today)} disabled={isToday}>
            오늘
          </button>
          <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, 1))} aria-label="다음 날짜">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </header>

      <div className="pds-progress" aria-label={`${completedSections}개 영역 작성 완료`}>
        <div className="pds-progress-copy">
          <span>오늘의 기록</span>
          <strong>{completedSections} / 3</strong>
        </div>
        <div className="pds-progress-track">
          <span style={{ width: `${(completedSections / 3) * 100}%` }} />
        </div>
      </div>

      <div className="pds-sections">
        {SECTIONS.map((section) => (
          <section className={`pds-section pds-section-${section.field}`} key={section.field}>
            <div className="pds-section-heading">
              <span className="pds-section-letter">{section.label}</span>
              <div>
                <h2>{section.title}</h2>
                <p>{section.prompt}</p>
              </div>
            </div>
            <textarea
              value={entry[section.field]}
              onChange={(event) => updateField(section.field, event.target.value)}
              placeholder={loading && !isOnboarding ? '기록을 불러오는 중...' : section.placeholder}
              disabled={loading && !isOnboarding}
              rows={4}
              aria-label={`${section.title} 기록`}
            />
          </section>
        ))}
      </div>

      <footer className="pds-footer">
        <span className="pds-saved-dot" />
        {entry.updatedAt ? '작성 내용은 자동으로 저장됩니다' : '첫 기록을 시작해 보세요'}
      </footer>
    </div>
  );
}
