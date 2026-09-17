import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry, LogTag, ProcFx } from '../engine/types';
import { cn } from '../utils/cn';

const TAG_LABEL: Record<LogTag, string> = {
  fs: 'FS',
  net: 'NET',
  git: 'GIT',
  npm: 'NPM',
  proc: 'PROC',
  sys: 'SYS',
};

export const EventLog = memo(function EventLog({
  entries,
  isOpen,
  onToggle,
}: {
  entries: LogEntry[];
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [filter, setFilter] = useState<'ALL' | LogTag>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const filteredEntries = useMemo(() => {
    if (filter === 'ALL') return entries;
    return entries.filter(e => e.tag === filter);
  }, [entries, filter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: entries.length, fs: 0, git: 0, net: 0, proc: 0 };
    for (const e of entries) {
      if (map[e.tag] !== undefined) map[e.tag]++;
    }
    return map;
  }, [entries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredEntries]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    userScrolledUpRef.current = !isAtBottom;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-panel)] font-mono text-[11px]">
      {/* 28px Diagnostics Header Bar */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3">
        <div className="flex items-center gap-1">
          <span className="mr-2 font-sans text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Diagnostics
          </span>
          {(['ALL', 'fs', 'git', 'net', 'proc'] as const).map(tab => {
            const label = tab === 'ALL' ? 'ALL' : TAG_LABEL[tab];
            const count = counts[tab] ?? 0;
            const active = filter === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'chip rounded px-1.5 py-0.5 text-[9.5px] transition-colors',
                  active
                    ? 'border border-[var(--border-strong)] bg-[var(--surface-hover)] font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                )}
              >
                {label} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {onToggle && (
          <button
            onClick={onToggle}
            className="chip rounded px-1 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title={isOpen ? 'Collapse diagnostics' : 'Expand diagnostics'}
            aria-label={isOpen ? 'Collapse diagnostics' : 'Expand diagnostics'}
          >
            {isOpen ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-1"
      >
        {filteredEntries.map(e => {
          const isError = e.color === '#f2708a' || e.text.includes('error') || e.text.includes('fatal');
          const isSuccess = e.color === '#3fdc9b' || e.text.includes('commit') || e.text.includes('saved');
          const isWarning = e.color === '#f5b454';

          return (
            <div key={e.id} className="flex items-baseline gap-2.5 leading-snug">
              <span className="shrink-0 text-[10px] text-[var(--text-muted)] select-none">
                {e.time}
              </span>
              <span className="shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1 py-0.2 text-[8.5px] font-medium text-[var(--text-secondary)]">
                {TAG_LABEL[e.tag] ?? e.tag.toUpperCase()}
              </span>
              <span
                className={cn(
                  'min-w-0 break-words',
                  isError
                    ? 'text-[var(--semantic-error)]'
                    : isSuccess
                      ? 'text-[var(--semantic-success)]'
                      : isWarning
                        ? 'text-[var(--semantic-warning)]'
                        : 'text-[var(--text-primary)]'
                )}
              >
                {e.text}
              </span>
            </div>
          );
        })}

        {!filteredEntries.length && (
          <div className="py-6 text-center text-[10.5px] text-[var(--text-muted)] italic">
            No diagnostic events recorded
          </div>
        )}
      </div>
    </div>
  );
});

export const ProcessStrip = memo(function ProcessStrip({ procs }: { procs: ProcFx[] }) {
  if (!procs.length) return null;

  return (
    <div className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-1.5 font-mono text-[10px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--text-muted)] font-sans uppercase tracking-wider text-[9px] font-semibold mr-1">
          Active Jobs:
        </span>
        {procs.map(p => (
          <div
            key={p.pid}
            className="flex items-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-0.5 text-[var(--text-secondary)]"
          >
            <span className="text-[var(--text-muted)]">{p.pid}</span>
            <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
            <span className="h-1 w-8 overflow-hidden rounded bg-[var(--border-default)]">
              <span className="block h-full w-2/3 bg-[var(--semantic-info)]" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
