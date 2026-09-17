import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type {
  GitPayload, NetworkPayload, NpmPayload, PipelinePayload, StageFx,
} from '../engine/types';

/* ------------------------------------------------------------------ */

const META: Record<StageFx['kind'], { title: string; color: string; icon: React.ReactNode }> = {
  network: {
    title: 'NETWORK FLOW', color: 'var(--semantic-info)',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c2 1.7 2 10.7 0 12.4M8 1.8c-2 1.7-2 10.7 0 12.4" />
      </svg>
    ),
  },
  pipeline: {
    title: 'PIPELINE FLOW', color: 'var(--text-secondary)',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="3" cy="8" r="1.8" /><circle cx="13" cy="8" r="1.8" /><path d="M4.8 8h6.4M9 5.8 11.2 8 9 10.2" />
      </svg>
    ),
  },
  git: {
    title: 'GIT OPERATION', color: 'var(--semantic-success)',
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" />
        <path d="M4 6v4M5.7 5.2 10.3 7" />
      </svg>
    ),
  },
  npm: {
    title: 'PACKAGE RESOLUTION', color: 'var(--semantic-info)',
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
      <div className="mb-1 font-mono text-[10px] text-fg-dim">
        {ping ? <>ICMP echo → <span className="c-cyan">{p.host}</span> ({p.ip})</> : <>
          <span className="c-cyan">{p.method}</span> https://<span className="c-fg">{p.host}</span><span className="text-fg-dim">{p.path}</span>
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
            {ping ? p.ip : `edge · :443`}
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
          {chip(`ttfb ${p.timings.ttfb}ms`, step >= 4, '#a991f7')}
          {chip(`total ${p.timings.total}ms`, step >= 5, '#3fdc9b')}
          <span className="ml-auto font-mono text-[9px] text-fg-faint">content-type: {p.mime}</span>
        </div>
      )}
      {!ping && p.outFile && step >= 5 && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 font-mono text-[10px] text-green">
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
                  borderColor: done ? 'rgba(63,220,155,0.5)' : active ? '#6ea1ff' : '#22303f',
                  background: active ? 'rgba(110,161,255,0.08)' : '#10161d',
                  boxShadow: active && !done ? '0 0 18px rgba(110,161,255,0.22)' : undefined,
                }}
              >
                <div className="font-mono text-[11px] font-bold" style={{ color: done ? '#3fdc9b' : active ? '#6ea1ff' : '#8ca0b3' }}>
                  {s.name}
                </div>
                <div className="truncate font-mono text-[8.5px] text-fg-faint">{s.arg || '—'}</div>
                <div className="mt-1 font-mono text-[8px]" style={{ color: done ? '#3fdc9b' : active ? '#6ea1ff' : '#3d4c5e' }}>
                  {done ? 'exit 0 ✓' : active ? 'running…' : `pid ${1200 + i * 7}`}
                </div>
              </motion.div>
              {i < p.stages.length - 1 && (
                <div className="relative mx-1 h-[2px] min-w-6 flex-1 overflow-visible rounded bg-ink-600">
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
                      className="absolute -top-[3px] h-2 w-2 rounded-full bg-cyan"
                      style={{ boxShadow: '0 0 8px rgba(83,199,240,0.9)' }}
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

      <div className="mt-2 rounded-md border border-ink-600/70 bg-ink-850/80 px-3 py-2">
        <div className="mb-1 font-mono text-[8.5px] tracking-[0.12em] text-fg-faint">FINAL STDOUT</div>
        {p.output.length ? p.output.map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (0.3 + i * 0.14) / speed }}
            className="truncate font-mono text-[10.5px] text-fg">
            {l}
          </motion.div>
        )) : <div className="font-mono text-[10px] text-fg-faint">(empty)</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Git                                                                 */
/* ------------------------------------------------------------------ */

function GitStage({ p, speed }: { p: GitPayload; speed: number }) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMoved(true), 700 / speed);
    return () => clearTimeout(id);
  }, [speed]);

  const chip = (f: string, color: string, delay: number, strike = false) => (
    <motion.span
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay / speed, type: 'spring', stiffness: 300, damping: 24 }}
      className="inline-flex max-w-full items-center gap-1.5 rounded border border-ink-500/60 bg-ink-800 px-2 py-1 font-mono text-[9.5px] text-fg"
    >
      <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate" style={{ textDecoration: strike ? 'line-through' : undefined, opacity: strike ? 0.55 : 1 }}>{f}</span>
    </motion.span>
  );

  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr_auto_1.2fr] items-center gap-2">
      {/* working tree */}
      <div className="min-w-0">
        <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.14em] text-fg-faint">WORKING TREE</div>
        {p.mode === 'init' ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-md border border-rose/50 bg-rose/8 px-3 py-3 text-center">
            <div className="font-mono text-[11px] font-bold text-rose">.git/ created</div>
            <div className="mt-0.5 font-mono text-[8.5px] text-fg-dim">repo @ {p.root}</div>
          </motion.div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {p.files.map((f, i) => chip(f, p.mode === 'commit' && moved ? '#3d4c5e' : '#f5b454', i * 110, p.mode !== 'init' && moved))}
          </div>
        )}
      </div>

      <Arrow color="#f2708a" active={p.mode !== 'init' && !moved} label={p.mode === 'commit' ? 'commit' : 'add'} />

      {/* staging */}
      <div className="min-w-0">
        <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.14em] text-fg-faint">STAGING AREA</div>
        <div className="flex min-h-[54px] flex-wrap content-start gap-1.5 rounded-md border border-dashed border-rose/40 bg-rose/5 p-2">
          {p.mode === 'init' ? (
            <span className="font-mono text-[9px] text-fg-faint">empty</span>
          ) : p.mode === 'commit' && moved ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 / speed }}
              className="font-mono text-[10px] font-bold text-green">✓ committed — index clean</motion.span>
          ) : (
            p.files.map((f, i) => chip(f, '#f2708a', (p.mode === 'add' ? 300 : 60) + i * 110))
          )}
        </div>
      </div>

      <Arrow color="#f5b454" active={p.mode === 'commit' && moved} label="→" />

      {/* repository */}
      <div className="min-w-0">
        <div className="mb-1.5 font-mono text-[8.5px] tracking-[0.14em] text-fg-faint">
          REPOSITORY · <span className="text-cyan">{p.branch}</span>
        </div>
        {p.commits.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-ink-600 bg-ink-850 px-3 py-3">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-fg-faint" />
            <span className="font-mono text-[9.5px] text-fg-faint">no commits yet</span>
          </div>
        ) : (
          <div className="rounded-md border border-ink-600 bg-ink-850 px-3 py-2.5">
            <div className="relative flex items-center gap-3 py-1">
              <div className="absolute left-[5px] right-2 top-1/2 h-[2px] -translate-y-1/2 bg-ink-500" />
              {p.commits.map((c, i) => {
                const latest = i === p.commits.length - 1;
                return (
                  <div key={c.hash} className="relative z-10 flex flex-col items-center">
                    <motion.span
                      initial={latest ? { scale: 0 } : false}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18, delay: latest ? 0.5 / speed : 0 }}
                      className="h-3 w-3 rounded-full border-2"
                      style={{
                        background: latest ? '#f5b454' : '#1d2836',
                        borderColor: latest ? '#f5b454' : '#5c7086',
                        boxShadow: latest ? '0 0 10px rgba(245,180,84,0.6)' : undefined,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {p.commit && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 / speed }}
                className="mt-1 font-mono text-[9.5px]">
                <span className="font-bold text-amber">{p.commit.hash}</span>
                <span className="text-cyan"> (HEAD → {p.branch})</span>
                <div className="truncate text-fg-dim">"{p.commit.msg}" · {p.commit.files.length} files</div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
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
          className="shrink-0 rounded-md border border-violet/50 bg-violet/8 px-3 py-2.5 text-center">
          <div className="font-mono text-[10.5px] font-bold text-violet">package.json</div>
          <div className="font-mono text-[8px] text-fg-faint">dependencies</div>
        </motion.div>

        {/* resolver */}
        <div className="flex shrink-0 flex-col items-center">
          <svg width="34" height="34" viewBox="0 0 34 34" className={done ? '' : 'animate-spin'} style={{ animationDuration: '1.6s' }}>
            <circle cx="17" cy="17" r="13" fill="none" stroke={done ? '#3fdc9b' : '#a991f7'}
              strokeWidth="2.4" strokeDasharray={done ? '0' : '14 10'} strokeLinecap="round" opacity="0.85" />
            {done && <path d="M11 17.5 15 21.5 23.5 12.5" fill="none" stroke="#3fdc9b" strokeWidth="2.6" strokeLinecap="round" />}
          </svg>
          <span className="mt-0.5 font-mono text-[8px] text-fg-faint">{done ? 'resolved' : 'resolving…'}</span>
        </div>

        {/* packages */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 md:grid-cols-3">
          {p.pkgs.map((pkg, i) => (
            <motion.div
              key={pkg.name}
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: (0.5 + i * 0.18) / speed, type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded border border-violet/40 bg-ink-800 px-2 py-1.5"
            >
              <div className="truncate font-mono text-[10px] font-bold text-violet">{pkg.name}</div>
              <div className="font-mono text-[8px] text-fg-faint">v{pkg.version} · {pkg.size}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* progress */}
      <div className="mt-4">
        <div className="h-1 overflow-hidden rounded-full bg-ink-600">
          <motion.div
            className="h-full rounded-full"
            style={{ background: done ? '#3fdc9b' : 'linear-gradient(90deg, #a991f7, #53c7f0)' }}
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
              style={{ borderColor: c.on ? 'rgba(63,220,155,0.5)' : '#22303f', color: c.on ? '#3fdc9b' : '#5c7086' }}>
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
    : stage.kind === 'git' ? `${(stage.payload as GitPayload).mode} · ${(stage.payload as GitPayload).branch}`
    : (stage.payload as NpmPayload).pkgs.map(x => x.name).join(', ');

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col bg-[var(--surface-overlay)] border border-[var(--border-default)]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3.5 py-2">
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--text-primary)]">
          {meta.title}
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">{subtitle}</span>
        <button
          onClick={onClose}
          className="chip ml-auto rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
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
