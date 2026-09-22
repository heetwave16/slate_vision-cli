import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type {
  DiffFileView, GitPayload, NetworkPayload, NpmPayload, PipelinePayload, StageFx,
} from '../engine/types';

/* ------------------------------------------------------------------ */
/* Theme-safe color tokens (match src/index.css variables)             */
/* ------------------------------------------------------------------ */

const C = {
  success: 'var(--semantic-success)',
  warning: 'var(--semantic-warning)',
  info: 'var(--semantic-info)',
  error: 'var(--semantic-error)',
  violet: '#a991f7',
  border: 'var(--border-default)',
  borderStrong: 'var(--border-strong)',
  card: 'var(--surface-card)',
  panel: 'var(--surface-panel)',
  base: 'var(--surface-base)',
  hover: 'var(--surface-hover)',
  text: 'var(--text-primary)',
  text2: 'var(--text-secondary)',
  muted: 'var(--text-muted)',
};

/* ------------------------------------------------------------------ */

const META: Record<StageFx['kind'], { title: string; color: string; icon: React.ReactNode }> = {
  network: {
    title: 'NETWORK FLOW', color: C.info,
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c2 1.7 2 10.7 0 12.4M8 1.8c-2 1.7-2 10.7 0 12.4" />
      </svg>
    ),
  },
  pipeline: {
    title: 'PIPELINE FLOW', color: C.text2,
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="3" cy="8" r="1.8" /><circle cx="13" cy="8" r="1.8" /><path d="M4.8 8h6.4M9 5.8 11.2 8 9 10.2" />
      </svg>
    ),
  },
  git: {
    title: 'GIT OPERATION', color: C.success,
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" />
        <path d="M4 6v4M5.7 5.2 10.3 7" />
      </svg>
    ),
  },
  npm: {
    title: 'PACKAGE RESOLUTION', color: C.info,
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.6 14 5v6L8 14.4 2 11V5L8 1.6Z" /><path d="M2 5l6 3.4L14 5M8 8.4V14.4" />
      </svg>
    ),
  },
};

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

function NetworkStage({ p, speed }: { p: NetworkPayload; speed: number }) {
  const [step, setStep] = useState(0);
  const ping = p.mode === 'ping';

  useEffect(() => {
    if (ping) return;
    const base = [420, 380, 640, 460, 720];
    let acc = 0;
    const ids: number[] = [];
    base.forEach((d, i) => {
      acc += d / speed;
      ids.push(window.setTimeout(() => setStep(i + 1), acc));
    });
    return () => ids.forEach(clearTimeout);
  }, [speed, ping]);

  const chip = (label: string, on: boolean, color: string) => (
    <span
      className="rounded border px-1.5 py-0.5 font-mono text-[9px] transition-opacity duration-300"
      style={{ borderColor: on ? color : '#22303f', color: on ? color : '#3d4c5e', opacity: on ? 1 : 0.45 }}
    >
      {label}{on ? ' ✓' : ''}
    </span>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 font-mono text-[10px]" style={{ color: C.muted }}>
        {ping ? <>ICMP echo → <span style={{ color: C.info }}>{p.host}</span> ({p.ip})</> : <></>}
        {!ping && <>
          <span style={{ color: C.info }}>{p.method}</span> https://<span style={{ color: C.text }}>{p.host}</span><span style={{ color: C.muted }}>{p.path}</span>
        </>}
      </div>

      <svg viewBox="0 0 560 140" className="w-full flex-1" style={{ minHeight: 120 }}>
        <line x1="130" y1="62" x2="225" y2="62" stroke="#22303f" strokeWidth="1.2" strokeDasharray="4 4" />
        <line x1="335" y1="62" x2="420" y2="62" stroke="#22303f" strokeWidth="1.2" strokeDasharray="4 4" />
        <line x1="420" y1="86" x2="130" y2="86" stroke="#1d2836" strokeWidth="1" strokeDasharray="2 5" />

        {/* sandbox */}
        <g>
          <rect x="20" y="42" width="110" height="40" rx="8" fill="#131b25" stroke={step >= 1 ? '#53c7f0' : '#2a3a4e'} strokeWidth="1.3" />
          <text x="75" y="60" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#d9e2ec" fontFamily="JetBrains Mono, monospace">sandbox</text>
          <text x="75" y="73" textAnchor="middle" fontSize="7.5" fill="#5c7086" fontFamily="JetBrains Mono, monospace">curl · tty0</text>
        </g>

        {/* dns */}
        <g opacity={ping ? 0.35 : 1}>
          <rect x="225" y="42" width="110" height="40" rx="8" fill="#131b25" stroke={step >= 1 && !ping ? '#53c7f0' : '#2a3a4e'} strokeWidth="1.3" />
          <text x="280" y="60" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={ping ? '#5c7086' : '#d9e2ec'} fontFamily="JetBrains Mono, monospace">dns</text>
          <text x="280" y="73" textAnchor="middle" fontSize="7.5" fill="#5c7086" fontFamily="JetBrains Mono, monospace">
            {step >= 2 && !ping ? p.ip : 'resolver'}
          </text>
        </g>

        {/* host */}
        <g>
          <rect x="420" y="42" width="120" height="40" rx="8" fill="#131b25"
            stroke={step >= 3 || ping ? '#3fdc9b' : '#2a3a4e'} strokeWidth="1.3" />
          <text x="480" y="60" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#d9e2ec" fontFamily="JetBrains Mono, monospace">
            {p.host.length > 16 ? p.host.slice(0, 15) + '…' : p.host}
          </text>
          <text x="480" y="73" textAnchor="middle" fontSize="7.5" fill="#5c7086" fontFamily="JetBrains Mono, monospace">
            {ping ? p.ip : 'edge · :443'}
          </text>
        </g>

        {/* request packet */}
        {ping ? (
          <>
            <motion.g animate={{ x: [0, 290, 0, 290, 0, 290, 0] }} transition={{ duration: 4.2 / speed, repeat: Infinity, ease: 'easeInOut' }}>
              <circle cx="130" cy="62" r="4" fill="#53c7f0" />
              <text x="130" y="50" textAnchor="middle" fontSize="8" fill="#53c7f0" fontFamily="JetBrains Mono, monospace">echo</text>
            </motion.g>
            <motion.g animate={{ x: [0, -290, 0, -290, 0, -290, 0] }} transition={{ duration: 4.2 / speed, repeat: Infinity, ease: 'easeInOut', delay: 0.35 / speed }}>
              <circle cx="420" cy="86" r="4" fill="#3fdc9b" />
              <text x="420" y="102" textAnchor="middle" fontSize="8" fill="#3fdc9b" fontFamily="JetBrains Mono, monospace">reply</text>
            </motion.g>
          </>
        ) : (
          <>
            {step >= 1 && step < 3 && (
              <motion.g initial={{ x: 0 }} animate={{ x: 95 }} transition={{ duration: 0.4 / speed, ease: 'easeIn' }}>
                <circle cx="130" cy="62" r="6.5" fill="#53c7f0" opacity="0.2" />
                <circle cx="130" cy="62" r="3" fill="#53c7f0" />
              </motion.g>
            )}
            {step >= 3 && step < 4 && (
              <motion.g initial={{ x: 0 }} animate={{ x: 85 }} transition={{ duration: 0.45 / speed, ease: 'easeIn' }}>
                <circle cx="335" cy="62" r="6.5" fill="#53c7f0" opacity="0.2" />
                <circle cx="335" cy="62" r="3" fill="#53c7f0" />
                <text x="377" y="52" textAnchor="middle" fontSize="8.5" fill="#53c7f0" fontFamily="JetBrains Mono, monospace">{p.method} {p.path.slice(0, 12)}</text>
              </motion.g>
            )}
            {step >= 5 && (
              <motion.g initial={{ x: 0 }} animate={{ x: -290 }} transition={{ duration: 0.6 / speed, ease: 'easeOut' }}>
                <circle cx="420" cy="86" r="6.5" fill="#3fdc9b" opacity="0.22" />
                <circle cx="420" cy="86" r="3" fill="#3fdc9b" />
                <text x="420" y="104" textAnchor="middle" fontSize="8.5" fill="#3fdc9b" fontFamily="JetBrains Mono, monospace">{p.status} · {p.size}</text>
              </motion.g>
            )}
          </>
        )}

        {step >= 4 && !ping && (
          <motion.text initial={{ opacity: 0 }} animate={{ opacity: 1 }} x="480" y="34" textAnchor="middle"
            fontSize="9.5" fontWeight="700" fill="#3fdc9b" fontFamily="JetBrains Mono, monospace">
            {p.status} {p.statusText}
          </motion.text>
        )}
      </svg>

      {!ping && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chip(`dns ${p.timings.dns}ms`, step >= 2, '#53c7f0')}
          {chip(`tcp ${p.timings.tcp}ms`, step >= 3, '#53c7f0')}
          {chip(`tls ${p.timings.tls}ms`, step >= 3, '#6ea1ff')}
          {chip(`ttfb ${p.timings.ttfb}ms`, step >= 4, C.violet)}
          {chip(`total ${p.timings.total}ms`, step >= 5, '#3fdc9b')}
          <span className="ml-auto font-mono text-[9px]" style={{ color: C.muted }}>content-type: {p.mime}</span>
        </div>
      )}

      {/* Live response body preview */}
      {!ping && p.bodyPreview && step >= 5 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-md border px-2.5 py-1.5"
          style={{ borderColor: C.border, background: C.base }}
        >
          <div className="mb-0.5 font-mono text-[8.5px] tracking-[0.12em]" style={{ color: C.muted }}>
            RESPONSE BODY
          </div>
          {p.bodyPreview.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all font-mono text-[10px] leading-snug" style={{ color: C.text2 }}>
              {l || ' '}
            </div>
          ))}
        </motion.div>
      )}
      {!ping && p.outFile && step >= 5 && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 font-mono text-[10px]" style={{ color: C.success }}>
          ↳ body saved → {p.outFile}
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

function PipelineStage({ p, speed }: { p: PipelinePayload; speed: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep(s => (s >= p.stages.length + 1 ? s : s + 1)), 560 / speed);
    return () => clearInterval(id);
  }, [speed, p.stages.length]);

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {p.stages.map((s, i) => {
          const active = step >= i + 1;
          const done = step >= i + 2;
          return (
            <div key={i} className="flex min-w-0 flex-1 items-center">
              <motion.div
                initial={{ opacity: 0.4, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (i * 0.12) / speed }}
                className="min-w-[92px] rounded-md border px-2.5 py-2 text-center transition-colors duration-300"
                style={{
                  borderColor: done ? 'rgba(63,220,155,0.5)' : active ? '#6ea1ff' : C.border,
                  background: active ? 'rgba(110,161,255,0.08)' : C.card,
                  boxShadow: active && !done ? '0 0 18px rgba(110,161,255,0.22)' : undefined,
                }}
              >
                <div className="font-mono text-[11px] font-bold" style={{ color: done ? C.success : active ? '#6ea1ff' : '#8ca0b3' }}>
                  {s.name}
                </div>
                <div className="truncate font-mono text-[8.5px]" style={{ color: C.muted }}>{s.arg || '—'}</div>
                <div className="mt-1 font-mono text-[8px]" style={{ color: done ? C.success : active ? '#6ea1ff' : '#3d4c5e' }}>
                  {done ? 'exit 0 ✓' : active ? 'running…' : `pid ${1200 + i * 7}`}
                </div>
              </motion.div>
              {i < p.stages.length - 1 && (
                <div className="relative mx-1 h-[2px] min-w-6 flex-1 overflow-visible rounded" style={{ background: C.border }}>
                  <div
                    className="absolute inset-0 rounded transition-opacity duration-300"
                    style={{
                      opacity: step >= i + 2 ? 1 : 0.25,
                      background: 'linear-gradient(90deg, #6ea1ff, #53c7f0)',
                    }}
                  />
                  {step >= i + 1 && step < p.stages.length + 2 && (
                    <motion.span
                      key={step + '-' + i}
                      className="absolute -top-[3px] h-2 w-2 rounded-full"
                      style={{ background: C.info, boxShadow: '0 0 8px rgba(83,199,240,0.9)' }}
                      initial={{ left: '0%' }}
                      animate={{ left: '100%' }}
                      transition={{ duration: 0.5 / speed, ease: 'easeInOut' }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 rounded-md border px-3 py-2" style={{ borderColor: C.border, background: C.card }}>
        <div className="mb-1 font-mono text-[8.5px] tracking-[0.12em]" style={{ color: C.muted }}>FINAL STDOUT</div>
        {p.output.length ? p.output.map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (0.3 + i * 0.14) / speed }}
            className="truncate font-mono text-[10.5px]" style={{ color: C.text }}>
            {l}
          </motion.div>
        )) : <div className="font-mono text-[10px]" style={{ color: C.muted }}>(empty)</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Git — commit graph + REAL diff hunks                                */
/* ------------------------------------------------------------------ */

const BRANCH_COLORS = ['#f5b454', '#53c7f0', C.success, C.violet, C.error, '#6ea1ff'];

function branchColor(branches: GitPayload['branches'], name: string): string {
  const idx = Math.max(0, branches.findIndex(b => b.name === name));
  return BRANCH_COLORS[idx % BRANCH_COLORS.length];
}

function CommitGraph({ p }: { p: GitPayload }) {
  const shown = p.commits.slice(0, 4);
  return (
    <div className="rounded-md border px-2.5 py-2" style={{ borderColor: C.border, background: C.card }}>
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.12em]" style={{ color: C.muted }}>
        REPOSITORY
        <span className="rounded border px-1 py-px" style={{ borderColor: C.border, color: C.info }}>
          {p.branch}
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="flex items-center gap-2 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed" style={{ borderColor: C.muted }} />
          <span className="font-mono text-[9px]" style={{ color: C.muted }}>no commits yet</span>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-1 left-[5px] top-1 w-[2px]" style={{ background: C.borderStrong }} />
          {shown.map((c, i) => {
            const latest = i === 0;
            const tags = p.branches.filter(b => b.hash && b.hash === c.hash && !b.name.startsWith('origin/'));
            return (
              <div key={c.hash} className="relative flex items-center gap-2 py-[3px]">
                <motion.span
                  initial={latest ? { scale: 0 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18, delay: latest ? 0.45 : 0.15 + i * 0.1 }}
                  className="relative z-10 h-3 w-3 shrink-0 rounded-full border-2"
                  style={{
                    background: latest ? C.warning : C.panel,
                    borderColor: latest ? C.warning : C.muted,
                    boxShadow: latest ? '0 0 10px rgba(245,180,84,0.6)' : undefined,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[9px] font-bold" style={{ color: latest ? C.warning : C.text2 }}>
                    {c.hash.slice(0, 7)}
                  </span>
                  <span className="ml-1.5 truncate font-mono text-[9px]" style={{ color: C.muted }}>{c.msg}</span>
                </div>
                {tags.slice(0, 2).map(t => (
                  <span
                    key={t.name}
                    className="shrink-0 rounded border px-1 py-px font-mono text-[8px]"
                    style={{ borderColor: branchColor(p.branches, t.name) + '66', color: branchColor(p.branches, t.name) }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Real content diff viewer (file tabs + colored hunks) */
function DiffPanel({ files, label, speed }: { files: DiffFileView[]; label?: string; speed: number }) {
  const [sel, setSel] = useState(0);
  useEffect(() => { if (sel >= files.length) setSel(0); }, [files.length, sel]);
  const f = files[Math.min(sel, Math.max(files.length - 1, 0))];
  if (!f) return null;
  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {/* file tabs */}
      <div className="scroll-thin flex w-36 shrink-0 flex-col gap-1 overflow-y-auto pr-0.5 md:w-44">
        <div className="font-mono text-[8px] tracking-[0.12em]" style={{ color: C.muted }}>
          {files.length} FILE{files.length === 1 ? '' : 'S'}
        </div>
        {files.map((ff, i) => (
          <button
            key={ff.path}
            onClick={() => setSel(i)}
            className="chip rounded border px-1.5 py-1 text-left font-mono text-[9px] transition-colors"
            style={{
              borderColor: i === sel ? C.borderStrong : C.border,
              background: i === sel ? C.hover : C.card,
              color: i === sel ? C.text : C.text2,
            }}
            title={ff.path}
          >
            <div className="truncate">{ff.path}</div>
            <div className="mt-0.5">
              <span style={{ color: C.success }}>+{ff.add}</span>{' '}
              <span style={{ color: C.error }}>−{ff.del}</span>
            </div>
          </button>
        ))}
      </div>

      {/* hunk view */}
      <div
        className="scroll-thin min-w-0 flex-1 overflow-y-auto rounded-md border p-2"
        style={{ borderColor: C.border, background: C.base }}
      >
        <div className="mb-1 flex items-center gap-2 font-mono text-[8.5px] tracking-[0.12em]" style={{ color: C.muted }}>
          <span>{label?.toUpperCase() ?? 'DIFF'}</span>
          {f.status === 'added' && <span style={{ color: C.success }}>new file</span>}
          {f.status === 'deleted' && <span style={{ color: C.error }}>deleted file</span>}
        </div>
        {f.hunks.length === 0 && <div className="font-mono text-[10px]" style={{ color: C.muted }}>(no changes)</div>}
        {f.hunks.map((h, hi) => (
          <div key={hi}>
            <div className="font-mono text-[10px]" style={{ color: C.info }}>{h.header}</div>
            {h.lines.map((l, li) => (
              <motion.div
                key={li}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (0.35 + (hi * 6 + li) * 0.028) / speed }}
                className="whitespace-pre-wrap break-all rounded-sm px-1 font-mono text-[10px] leading-[1.5]"
                style={{
                  background: l.c === 'add' ? 'rgba(131,179,148,0.12)' : l.c === 'del' ? 'rgba(207,135,144,0.12)' : 'transparent',
                  color: l.c === 'add' ? C.success : l.c === 'del' ? C.error : C.muted,
                }}
              >
                {l.c === 'add' ? '+' : l.c === 'del' ? '-' : ' '}{l.t}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* checkout: files that were physically synced to the worktree */
function ChangedPanel({ files, speed }: { files: GitPayload['changedFiles']; speed: number }) {
  return (
    <div className="rounded-md border px-2.5 py-2" style={{ borderColor: C.border, background: C.card }}>
      <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.12em]" style={{ color: C.muted }}>
        WORKTREE SYNCED
      </div>
      <div className="flex flex-wrap gap-1.5">
        {files!.map((c, i) => {
          const color = c.action === 'added' ? C.success : c.action === 'deleted' ? C.error : C.warning;
          const badge = c.action === 'added' ? 'A' : c.action === 'deleted' ? 'D' : 'M';
          return (
            <motion.span
              key={c.path + i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (0.25 + i * 0.09) / speed }}
              className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px]"
              style={{ borderColor: C.border, background: C.panel, color: C.text }}
            >
              <span
                className="flex h-3.5 w-3.5 items-center justify-center rounded-sm font-bold"
                style={{ background: color + '26', color }}
              >
                {badge}
              </span>
              <span className="max-w-[180px] truncate" title={c.path}>{c.path}</span>
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

/* push: simulated remote sync */
function PushPanel({ info, speed }: { info: NonNullable<GitPayload['pushInfo']>; speed: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 font-mono text-[10px]"
      style={{ borderColor: C.border, background: C.card }}
    >
      <span style={{ color: C.muted }}>remote:</span>
      <span style={{ color: C.info }}>{info.remote}</span>
      <motion.span
        animate={{ x: [0, 5, 0] }}
        transition={{ duration: 0.9 / speed, repeat: Infinity, ease: 'easeInOut' }}
        style={{ color: C.info }}
      >
        ⟶
      </motion.span>
      <span style={{ color: C.muted }}>{info.from ? info.from.slice(0, 7) + '..' : '* [new branch]'}</span>
      <span className="font-bold" style={{ color: C.warning }}>{info.to.slice(0, 7)}</span>
      <span style={{ color: C.info }}>{info.branch} → origin/{info.branch}</span>
      <span className="ml-auto" style={{ color: C.muted }}>{info.objects} objects written</span>
    </motion.div>
  );
}

function Arrow({ color, active, label }: { color: string; active: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center px-1">
      <span className="mb-0.5 font-mono text-[8px]" style={{ color: active ? color : '#3d4c5e' }}>{label}</span>
      <svg width="46" height="10" className="overflow-visible">
        <line x1="0" y1="5" x2="38" y2="5" stroke={active ? color : '#22303f'} strokeWidth="1.6"
          strokeDasharray="5 4" className={active ? 'anim-dashflow' : undefined} />
        <path d="M38 1.5 45 5 38 8.5 Z" fill={active ? color : '#22303f'} />
      </svg>
    </div>
  );
}

const GitStage = memo(function GitStage({ p, speed }: { p: GitPayload; speed: number }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMoved(true), 900 / speed);
    return () => clearTimeout(id);
  }, [speed]);

  const chip = (f: string, color: string, delay: number, strike = false) => (
    <motion.span
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay / speed, type: 'spring', stiffness: 300, damping: 24 }}
      className="inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9.5px]"
      style={{ borderColor: C.border, background: C.panel, color: C.text }}
    >
      <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate" style={{ textDecoration: strike ? 'line-through' : undefined, opacity: strike ? 0.55 : 1 }}>{f}</span>
    </motion.span>
  );

  const diffFiles = p.diffFiles ?? [];
  const changed = p.changedFiles ?? [];
  const arrowLabel =
    p.mode === 'commit' ? 'commit' : p.mode === 'add' ? 'add' :
    p.mode === 'diff' ? 'compare' : p.mode === 'checkout' ? 'sync' :
    p.mode === 'push' ? 'push' : '';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* flow row: worktree → staging → repository graph */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1.15fr] items-stretch gap-2">
        {/* working tree */}
        <div className="min-w-0">
          <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.14em]" style={{ color: C.muted }}>WORKING TREE</div>
          {p.mode === 'init' ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-md border px-3 py-3 text-center"
              style={{ borderColor: 'rgba(207,135,144,0.5)', background: 'rgba(207,135,144,0.06)' }}>
              <div className="font-mono text-[11px] font-bold" style={{ color: C.error }}>.git/ created</div>
              <div className="mt-0.5 font-mono text-[8.5px]" style={{ color: C.muted }}>repo @ {p.root}</div>
            </motion.div>
          ) : p.files.length ? (
            <div className="flex flex-wrap content-start gap-1.5">
              {p.files.slice(0, 8).map((f, i) =>
                chip(f, p.mode === 'commit' && moved ? '#3d4c5e' : C.warning, i * 90, p.mode !== 'init' && moved && p.mode === 'commit'))}
              {p.files.length > 8 && <span className="font-mono text-[9px]" style={{ color: C.muted }}>+{p.files.length - 8} more</span>}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-2.5 py-2 font-mono text-[9px]" style={{ borderColor: C.border, color: C.muted }}>
              clean
            </div>
          )}
        </div>

        <Arrow color={C.error} active={p.mode !== 'init' && !moved} label={arrowLabel} />

        {/* staging */}
        <div className="min-w-0">
          <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.14em]" style={{ color: C.muted }}>STAGING AREA</div>
          <div
            className="flex min-h-[54px] flex-wrap content-start gap-1.5 rounded-md border border-dashed p-2"
            style={{ borderColor: 'rgba(207,135,144,0.4)', background: 'rgba(207,135,144,0.03)' }}
          >
            {p.mode === 'init' ? (
              <span className="font-mono text-[9px]" style={{ color: C.muted }}>empty</span>
            ) : p.mode === 'commit' && moved ? (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 / speed }}
                className="font-mono text-[10px] font-bold" style={{ color: C.success }}>
                ✓ committed — index clean
              </motion.span>
            ) : p.mode === 'add' ? (
              p.files.slice(0, 8).map((f, i) => chip(f, C.error, 300 + i * 110))
            ) : (
              <span className="font-mono text-[9px]" style={{ color: C.muted }}>
                {p.mode === 'diff' ? (p.diffLabel ?? 'index') : p.mode === 'checkout' ? 'index = HEAD' : 'up to date'}
              </span>
            )}
          </div>
        </div>

        <Arrow color={C.warning} active={p.mode === 'commit' && moved} label="→" />

        {/* repository: real commit graph */}
        <div className="min-w-0">
          <CommitGraph p={p} />
        </div>
      </div>

      {/* details row */}
      {diffFiles.length > 0 && <DiffPanel files={diffFiles} label={p.diffLabel} speed={speed} />}
      {changed.length > 0 && <ChangedPanel files={changed} speed={speed} />}
      {p.pushInfo && <PushPanel info={p.pushInfo} speed={speed} />}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Npm                                                                 */
/* ------------------------------------------------------------------ */

function NpmStage({ p, speed }: { p: NpmPayload; speed: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDone(true), 1900 / speed);
    return () => clearTimeout(id);
  }, [speed]);

  return (
    <div className="flex h-full flex-col justify-center">
      <div className="flex items-center gap-3">
        {/* package.json */}
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          className="shrink-0 rounded-md border px-3 py-2.5 text-center"
          style={{ borderColor: 'rgba(169,145,247,0.5)', background: 'rgba(169,145,247,0.06)' }}>
          <div className="font-mono text-[10.5px] font-bold" style={{ color: C.violet }}>package.json</div>
          <div className="font-mono text-[8px]" style={{ color: C.muted }}>dependencies</div>
        </motion.div>

        {/* resolver */}
        <div className="flex shrink-0 flex-col items-center">
          <svg width="34" height="34" viewBox="0 0 34 34" className={done ? '' : 'animate-spin'} style={{ animationDuration: '1.6s' }}>
            <circle cx="17" cy="17" r="13" fill="none" stroke={done ? C.success : C.violet}
              strokeWidth="2.4" strokeDasharray={done ? '0' : '14 10'} strokeLinecap="round" opacity="0.85" />
            {done && <path d="M11 17.5 15 21.5 23.5 12.5" fill="none" stroke={C.success} strokeWidth="2.6" strokeLinecap="round" />}
          </svg>
          <span className="mt-0.5 font-mono text-[8px]" style={{ color: C.muted }}>{done ? 'resolved' : 'resolving…'}</span>
        </div>

        {/* packages */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 md:grid-cols-3">
          {p.pkgs.map((pkg, i) => (
            <motion.div
              key={pkg.name}
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: (0.5 + i * 0.18) / speed, type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded border px-2 py-1.5"
              style={{ borderColor: 'rgba(169,145,247,0.4)', background: C.panel }}
            >
              <div className="truncate font-mono text-[10px] font-bold" style={{ color: C.violet }}>{pkg.name}</div>
              <div className="font-mono text-[8px]" style={{ color: C.muted }}>v{pkg.version} · {pkg.size}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* progress */}
      <div className="mt-4">
        <div className="h-1 overflow-hidden rounded-full" style={{ background: C.border }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: done ? C.success : `linear-gradient(90deg, ${C.violet}, #53c7f0)` }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.9 / speed, ease: 'easeInOut' }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { t: `+ ${p.added} packages`, on: done },
            { t: p.total, on: done },
            { t: `${p.secs}s`, on: done },
            { t: '0 vulnerabilities', on: done },
          ].map((c, i) => (
            <motion.span key={i}
              initial={{ opacity: 0.35 }}
              animate={{ opacity: c.on ? 1 : 0.35 }}
              transition={{ delay: (i * 0.12) / speed }}
              className="rounded border px-1.5 py-0.5 font-mono text-[9px]"
              style={{ borderColor: c.on ? 'rgba(63,220,155,0.5)' : '#22303f', color: c.on ? C.success : '#5c7086' }}>
              {c.on ? '✓ ' : ''}{c.t}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlay frame                                                       */
/* ------------------------------------------------------------------ */

const StageOverlay = memo(function StageOverlay({ stage, speed, lifeMs, onClose }: {
  stage: StageFx; speed: number; lifeMs: number; onClose: () => void;
}) {
  const meta = META[stage.kind];
  const subtitle =
    stage.kind === 'network' ? `${(stage.payload as NetworkPayload).method} ${(stage.payload as NetworkPayload).host}`
    : stage.kind === 'pipeline' ? (stage.payload as PipelinePayload).stages.map(s => s.name).join(' │ ')
    : stage.kind === 'git'
      ? (() => {
          const gp = stage.payload as GitPayload;
          const base = `${gp.mode} · ${gp.branch}`;
          if (gp.diffLabel) return `${base} — ${gp.diffLabel}`;
          return base;
        })()
      : (stage.payload as NpmPayload).pkgs.map(x => x.name).join(', ');

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col border bg-[var(--surface-overlay)]"
      style={{ borderColor: 'var(--border-default)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
    >
      <div
        className="flex items-center gap-2.5 border-b bg-[var(--surface-panel)] px-3.5 py-2"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--text-primary)]">
          {meta.title}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">{subtitle}</span>
        <button
          onClick={onClose}
          className="chip ml-auto rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
        >
          Dismiss ✕
        </button>
      </div>
      <div className="h-0.5 w-full bg-[var(--border-subtle)]">
        <motion.div
          className="h-full origin-left"
          style={{ background: meta.color }}
          initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
          transition={{ duration: lifeMs / 1000, ease: 'linear' }}
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-4">
        {stage.kind === 'network' && <NetworkStage p={stage.payload as NetworkPayload} speed={speed} />}
        {stage.kind === 'pipeline' && <PipelineStage p={stage.payload as PipelinePayload} speed={speed} />}
        {stage.kind === 'git' && <GitStage p={stage.payload as GitPayload} speed={speed} />}
        {stage.kind === 'npm' && <NpmStage p={stage.payload as NpmPayload} speed={speed} />}
      </div>
    </motion.div>
  );
});

export default StageOverlay;
