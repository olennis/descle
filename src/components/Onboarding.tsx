import { useState, useEffect, useCallback } from 'react';

const STEPS = [
  {
    target: '.col-schedule',
    title: 'Schedule & Bookmarks',
    description: 'Google Calendar 일정과 크롬 북마크 링크를 한곳에서 확인하고 빠르게 접근하세요.',
  },
  {
    target: '.col-timetable',
    title: 'Time Table',
    description: '08시부터 19시까지 시간별 계획과 실제 실행을 나란히 기록하며 하루의 흐름을 비교하세요.',
  },
  {
    target: '.col-dashboard',
    title: 'Dev Dashboard',
    description: '서비스 상태와 함께 Jira 이슈, GitHub PR·리뷰 요청을 한눈에 확인하세요.',
  },
];

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(STEPS[step].target);
    if (!el) return;

    el.classList.add('onboarding-active');

    const rect = el.getBoundingClientRect();
    const tooltipW = 300;
    const gap = 20;
    const spaceRight = window.innerWidth - rect.right;

    const left =
      spaceRight > tooltipW + gap * 2
        ? rect.right + gap
        : rect.left - tooltipW - gap;

    setPos({
      top: rect.top + 80,
      left: Math.max(gap, left),
    });

    return () => {
      el.classList.remove('onboarding-active');
    };
  }, [step]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onComplete();
  }, [step, onComplete]);

  if (!pos) return null;

  const current = STEPS[step];

  return (
    <div className="onboarding-backdrop" onClick={onComplete}>
      <div
        key={step}
        className="onboarding-tooltip"
        onClick={(e) => e.stopPropagation()}
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
            />
          ))}
        </div>
        <div className="onboarding-title">{current.title}</div>
        <div className="onboarding-desc">{current.description}</div>
        <div className="onboarding-actions">
          <button className="onboarding-skip" onClick={onComplete}>
            건너뛰기
          </button>
          <button className="onboarding-next" onClick={next}>
            {step < STEPS.length - 1 ? '다음' : '시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
