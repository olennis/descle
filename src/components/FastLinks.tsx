import { useState } from 'react';
import type { FastLink } from '../types';
import { MAX_FAST_LINKS } from '../types';
import { useChromeStorage } from '../hooks/useChromeStorage';
import { getFastLinks, setFastLinks } from '../services/storage';
import './FastLinks.css';

type Draft = { name: string; subtitle: string; url: string };
const EMPTY_DRAFT: Draft = { name: '', subtitle: '', url: '' };

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function getFaviconUrl(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  } catch {
    return '';
  }
}

function getHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function FastLinks({ isOnboarding }: { isOnboarding?: boolean }) {
  const [links, setLinks, loading] = useChromeStorage<FastLink[]>('fastLinks', getFastLinks, setFastLinks, []);
  // null = 닫힘, 'new' = 추가, 그 외 = 수정 중인 링크 id
  const [editing, setEditing] = useState<string | null>(null);

  const canAdd = !loading && links.length < MAX_FAST_LINKS;

  const save = (draft: Draft) => {
    const url = normalizeUrl(draft.url);
    if (!url || !draft.name.trim()) return;
    const next = { name: draft.name.trim(), subtitle: draft.subtitle.trim(), url };
    void setLinks((prev) =>
      editing === 'new'
        ? [...prev, { id: crypto.randomUUID(), ...next }].slice(0, MAX_FAST_LINKS)
        : prev.map((link) => (link.id === editing ? { ...link, ...next } : link)),
    );
    setEditing(null);
  };

  const remove = (id: string) => {
    void setLinks((prev) => prev.filter((link) => link.id !== id));
    if (editing === id) setEditing(null);
  };

  // 온보딩 중에는 등록된 링크가 없으므로 영역 자체를 숨긴다.
  if (isOnboarding) return null;

  return (
    <div className="fast-links">
      {links.map((link) =>
        editing === link.id ? (
          <FastLinkForm
            key={link.id}
            initial={{ name: link.name, subtitle: link.subtitle, url: link.url }}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div key={link.id} className="fl-card-wrap">
            <a className="fl-card" href={link.url} target="_blank" rel="noopener noreferrer">
              <Favicon url={link.url} name={link.name} />
              <div className="fl-text">
                <div className="fl-name">{link.name}</div>
                <div className="fl-sub">{link.subtitle || getHost(link.url)}</div>
              </div>
              <ChevronIcon />
            </a>
            <div className="fl-actions">
              <button type="button" onClick={() => setEditing(link.id)} title="수정" aria-label={`${link.name} 수정`}>
                <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
              <button type="button" onClick={() => remove(link.id)} title="삭제" aria-label={`${link.name} 삭제`}>
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
          </div>
        ),
      )}

      {editing === 'new' ? (
        <FastLinkForm initial={EMPTY_DRAFT} onSave={save} onCancel={() => setEditing(null)} />
      ) : canAdd && (
        <button type="button" className="fl-add" onClick={() => setEditing('new')}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          Fast link 추가
          <span className="fl-add-count">{links.length} / {MAX_FAST_LINKS}</span>
        </button>
      )}
    </div>
  );
}

function FastLinkForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const urlValid = normalizeUrl(draft.url) !== null;
  const valid = !!draft.name.trim() && urlValid;
  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  return (
    <form
      className="fl-form"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSave(draft); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <input autoFocus value={draft.name} onChange={set('name')} placeholder="이름 (예: 사내 위키)" maxLength={30} />
      <input value={draft.url} onChange={set('url')} placeholder="URL (예: wiki.company.com)" />
      <input value={draft.subtitle} onChange={set('subtitle')} placeholder="설명 (선택)" maxLength={40} />
      {draft.url.trim() && !urlValid && <p className="fl-form-error">올바른 URL이 아닙니다</p>}
      <div className="fl-form-actions">
        <button type="button" className="fl-btn-ghost" onClick={onCancel}>취소</button>
        <button type="submit" className="fl-btn-primary" disabled={!valid}>저장</button>
      </div>
    </form>
  );
}

function Favicon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url);
  if (failed || !src) return <span className="fl-icon fl-initial">{name.charAt(0).toUpperCase()}</span>;
  return <img className="fl-icon" src={src} alt="" onError={() => setFailed(true)} />;
}

function ChevronIcon() {
  return (
    <svg className="fl-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
  );
}
