import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Terminal from './components/Terminal';
import FsCanvas from './components/FsCanvas';
import StageOverlay from './components/StagePanels';
import { EventLog, ProcessStrip } from './components/SidePanels';
import { computeLayout, countNodes, displayPath, packetRoute, getTtyCenter, HOME, NODE_H, findNodeById } from './engine/fs';
import { DEMO_SCRIPT, executeCommand, initialEnv } from './engine/interpreter';
import { retrack } from './engine/git';
import { AnimationBus, AbortError } from './engine/animationBus';
import { cn } from './utils/cn';
import {
  ActivePreview, EnvState, FlashFx, LaidNode, LayoutResult, LogEntry, LogTag, PacketFx,
  ProcFx, StageFx, TermBlock, TermLine, TermSeg, VizEvent,
} from './engine/types';
import {
  loadPersistentEnv, savePersistentEnv, clearPersistentStorage,
  exportStorageSnapshot, triggerDownload,
} from './engine/storage';
import { getPromptSegs } from './components/Terminal';

/* ------------------------------------------------------------------ */

function promptSegs(env: EnvState): TermSeg[] {
  return getPromptSegs(env);
}

function createMotdBlocks(seq: { block: number }): TermBlock[] {
  return [{
    id: ++seq.block,
    kind: 'motd',
    lines: [
      { segs: [{ t: 'SLATE', c: 'fg', b: true }, { t: ' — precision developer workbench v2.0', c: 'dim' }] },
      { segs: [{ t: '─────────────────────────────────────────────────────────────', c: 'dim' }] },
      { segs: [
        { t: 'Kernel: ', c: 'dim' }, { t: '6.1.0-viz', c: 'fg' },
        { t: '  ·  Root: ', c: 'dim' }, { t: '~', c: 'info' },
        { t: '  ·  Execution: ', c: 'dim' }, { t: 'In-memory sandbox', c: 'dim' },
      ] },
      { segs: [
        { t: 'Builtins: 50+ commands supported  ·  Type ', c: 'dim' },
        { t: 'help', c: 'fg', b: true },
        { t: ' for catalog  ·  ', c: 'dim' },
        { t: 'Tab', c: 'fg', b: true },
        { t: ' completes', c: 'dim' },
      ] },
      { segs: [{ t: '', c: 'dim' }] },
    ],
  }];
}

function createBootLog(seq: { log: number }): LogEntry[] {
  const t = () => new Date().toTimeString().slice(0, 8);
  return [
    { id: ++seq.log, time: t(), tag: 'sys', text: 'sandbox initialized — memory optimized' },
    { id: ++seq.log, time: t(), tag: 'fs', text: `virtual filesystem mounted at ${HOME}` },
    { id: ++seq.log, time: t(), tag: 'sys', text: 'terminal input stream and diagnostics ready' },
  ];
}

const MAX_LINES_PER_BLOCK = 80;

/* ------------------------------------------------------------------ */
/* ⚙ Settings Dropdown Component                                       */
/* ------------------------------------------------------------------ */

function SettingsDropdown({
  speed, setSpeed, paused, togglePause, demoRunning, startDemo, env,
}: {
  speed: number;
  setSpeed: (s: number) => void;
  paused: boolean;
  togglePause: () => void;
  demoRunning: boolean;
  startDemo: () => void;
  env: EnvState;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'chip flex h-7 w-7 items-center justify-center rounded border border-[var(--border-default)] bg-[var(--surface-card)] font-mono text-[12px] transition-colors',
          open
            ? 'border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        )}
        title="Settings & controls"
        aria-label="Settings"
      >
        ⚙
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-overlay)] shadow-2xl overflow-hidden"
          >
            {/* Engine Status */}
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5 font-mono text-[10px] text-[var(--text-muted)]">
              <span className={cn('h-2 w-2 rounded-full', paused ? 'bg-[var(--semantic-warning)]' : 'bg-[var(--semantic-success)]')} />
              <span>{paused ? 'Engine paused · Visual queue held' : 'Engine active · In-memory sandbox'}</span>
            </div>

            {/* Persistent Storage Controls */}
            <div className="border-b border-[var(--border-subtle)] px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <span>Storage</span>
                <span className="text-[var(--semantic-success)] font-mono font-normal lowercase">● persistent</span>
              </div>
              <div className="flex gap-1.5 font-mono text-[10px]">
                <button
                  onClick={() => {
                    const snapshot = exportStorageSnapshot(env);
                    triggerDownload('slate-sandbox-backup.json', snapshot);
                  }}
                  className="chip flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-card)] py-1 px-1.5 text-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Export full sandbox snapshot JSON"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => {
                    clearPersistentStorage();
                    window.location.reload();
                  }}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] py-1 px-2 text-center text-[var(--semantic-error)] hover:bg-[var(--surface-hover)]"
                  title="Wipe persistent cache"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Speed Selector */}
            <div className="border-b border-[var(--border-subtle)] px-3 py-2">
              <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Animation Speed</div>
              <div className="flex items-center gap-1 rounded border border-[var(--border-default)] bg-[var(--surface-card)] p-0.5 font-mono text-[10px]">
                {[0.5, 1, 2, 4].map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      'flex-1 px-2 py-1 rounded transition-colors text-center',
                      speed === s
                        ? 'bg-[var(--surface-hover)] font-medium text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    {s === 0.5 ? '½×' : `${s}×`}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="border-b border-[var(--border-subtle)] px-3 py-2 space-y-1">
              <button
                onClick={() => { togglePause(); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] transition-colors text-left',
                  paused
                    ? 'text-[var(--semantic-warning)] hover:bg-[var(--surface-hover)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                )}
              >
                <span className="w-4 text-center">{paused ? '▶' : '⏸'}</span>
                {paused ? 'Resume Animations' : 'Pause Animations'}
              </button>
              <button
                onClick={() => { startDemo(); setOpen(false); }}
                disabled={demoRunning}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 font-mono text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 text-left"
              >
                <span className="w-4 text-center">🎬</span>
                {demoRunning ? 'Tour Running…' : 'Start Guided Tour'}
              </button>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="px-3 py-2">
              <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Shortcuts</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
                <span className="text-[var(--text-muted)]"><span className="kbd">Tab</span> complete</span>
                <span className="text-[var(--text-muted)]"><span className="kbd">↑↓</span> history</span>
                <span className="text-[var(--text-muted)]"><span className="kbd">Ctrl+L</span> clear</span>
                <span className="text-[var(--text-muted)]"><span className="kbd">Ctrl+C</span> cancel</span>
                <span className="text-[var(--text-muted)]"><span className="kbd">Esc</span> stop tour</span>
                <span className="text-[var(--text-muted)]"><span className="kbd">F</span> fit canvas</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function App() {
  const seqRef = useRef({ block: 0, fx: 0, log: 0 });

  const [env, setEnv] = useState<EnvState>(() => loadPersistentEnv() ?? initialEnv());
  const [blocks, setBlocks] = useState<TermBlock[]>(() => createMotdBlocks(seqRef.current));
  const [input, setInput] = useState('');

  // Auto-save persistent sandbox state
  useEffect(() => {
    savePersistentEnv(env);
  }, [env]);
  const [stage, setStage] = useState<StageFx | null>(null);
  const [packets, setPackets] = useState<PacketFx[]>([]);
  const [flashes, setFlashes] = useState<FlashFx[]>([]);
  const [procs, setProcs] = useState<ProcFx[]>([]);
  const [log, setLog] = useState<LogEntry[]>(() => createBootLog(seqRef.current));
  const [speed, setSpeedState] = useState(1);
  const [paused, setPaused] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [stageLife, setStageLife] = useState(6000);

  // File Inspector & Node Highlights
  const [preview, setPreview] = useState<ActivePreview | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Diagnostics drawer collapsed/expanded state (default collapsed: 28px)
  const [diagOpen, setDiagOpen] = useState(false);

  // Mobile layout tab: 'terminal' | 'files'
  const [mobileTab, setMobileTab] = useState<'terminal' | 'files'>('terminal');

  const envRef = useRef(env);
  envRef.current = env;

  const speedRef = useRef(1);
  speedRef.current = speed;

  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const pauseListenersRef = useRef<Set<(p: boolean) => void>>(new Set());

  const animationBus = useMemo(() => {
    return new AnimationBus({
      getSpeed: () => speedRef.current,
      isPaused: () => pausedRef.current,
      subscribePauseChange: (listener) => {
        pauseListenersRef.current.add(listener);
        return () => pauseListenersRef.current.delete(listener);
      },
    });
  }, []);

  const abortControllerRef = useRef<AbortController>(new AbortController());
  const demoCancelRef = useRef(false);
  const demoRunningRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const layout = useMemo<LayoutResult>(() => computeLayout(env.fs), [env.fs]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const counts = useMemo(() => countNodes(env.fs), [env.fs]);

  /* ---------------- helpers ---------------- */

  const addLog = useCallback((tag: LogTag, text: string, color?: string) => {
    setLog(l => [...l.slice(-60), { id: ++seqRef.current.log, time: new Date().toTimeString().slice(0, 8), tag, text, color }]);
  }, []);

  const livePos = useCallback((id: string): { x: number; y: number } | null => {
    if (id === 'tty') return getTtyCenter(layoutRef.current);
    const n = layoutRef.current.nodeMap?.get(id) ?? layoutRef.current.nodes.find(x => x.id === id);
    if (!n) return null;
    return { x: n.x + 80, y: n.y + NODE_H / 2 };
  }, []);

  const onSaveFile = useCallback((nodeId: string, content: string) => {
    const node = layoutRef.current.nodeMap.get(nodeId);
    if (!node) return;
    node.node.content = content;
    node.node.mtime = Date.now();
    setEnv(e => ({ ...e }));
    setPreview(p => (p && p.nodeId === nodeId ? { ...p, content } : p));
    setFlashes(f => [...f, {
      key: ++seqRef.current.fx,
      x: node.x + 80,
      y: node.y + NODE_H / 2,
      color: 'var(--semantic-success)',
      label: 'saved',
      dur: 1.2,
    }]);
    addLog('fs', `saved ${node.node.name} (${content.length} B)`);
    if (envRef.current.git.init) retrack(envRef.current);
  }, [addLog]);

  /* ---------------- event scheduler ---------------- */

  const scheduleEvents = useCallback((events: VizEvent[], posBefore: Map<string, { x: number; y: number }>) => {
    const signal = abortControllerRef.current.signal;

    for (const ev of events) {
      void (async () => {
        try {
          await animationBus.delay(ev.delay, signal);

          if (ev.kind === 'log') {
            addLog(ev.tag, ev.text, ev.color);
          } else if (ev.kind === 'flash') {
            const pos = livePos(ev.id) ?? posBefore.get(ev.id);
            if (!pos) return;
            const dur = 0.95 / speedRef.current;
            const key = ++seqRef.current.fx;
            setFlashes(f => [...f, { key, x: pos.x, y: pos.y, color: ev.color, label: ev.label, dur }]);
            await animationBus.delay(dur * 1000 + 250, signal);
            setFlashes(f => f.filter(x => x.key !== key));
          } else if (ev.kind === 'packet') {
            const route = packetRoute(layoutRef.current, getTtyCenter(layoutRef.current), ev.from, ev.to);
            if (!route) return;
            const dur = Math.min(2.6, Math.max(0.45, route.len / 400)) / speedRef.current;
            const key = ++seqRef.current.fx;
            setPackets(p => [...p, { key, xs: route.xs, ys: route.ys, color: ev.color, label: ev.label, dur }]);
            await animationBus.delay(dur * 1000 + 250, signal);
            setPackets(p => p.filter(x => x.key !== key));
          } else if (ev.kind === 'preview') {
            const targetNode = layoutRef.current.nodeMap.get(ev.nodeId);
            if (targetNode && targetNode.node.type === 'file') {
              setPreview({
                nodeId: ev.nodeId,
                path: ev.path,
                name: targetNode.node.name,
                content: targetNode.node.content ?? '',
              });
              // Ensure input focus is not stolen by the preview open
              setTimeout(() => inputRef.current?.focus(), 20);
            }
          } else if (ev.kind === 'highlight') {
            setHighlightedIds(prev => new Set([...prev, ...ev.ids]));
            await animationBus.delay(ev.duration, signal);
            setHighlightedIds(prev => {
              const next = new Set(prev);
              ev.ids.forEach(id => next.delete(id));
              return next;
            });
          } else if (ev.kind === 'stage') {
            const life = ev.duration / speedRef.current;
            const id = ++seqRef.current.fx;
            setStageLife(life);
            setStage({ id, kind: ev.stage, payload: ev.payload });
            await animationBus.delay(ev.duration + 300, signal);
            setStage(s => (s && s.id === id ? null : s));
          } else if (ev.kind === 'proc') {
            const pid = 100 + Math.floor(Math.random() * 880);
            setProcs(p => [...p.slice(-5), { pid, name: ev.name, cpuDur: 0.9 + Math.random() * 1.4, until: Date.now() + ev.duration }]);
            addLog('proc', `spawned ${ev.name} (pid ${pid})`);
            await animationBus.delay(ev.duration, signal);
            setProcs(p => p.filter(x => x.pid !== pid));
            addLog('proc', `${ev.name} exited (0)`);
          } else if (ev.kind === 'script') {
            startDemo();
          }
        } catch (err) {
          if (err instanceof AbortError) return;
          console.error(err);
        }
      })();
    }
  }, [addLog, animationBus, livePos]);

  /* ---------------- command execution ---------------- */

  const runLine = useCallback((line: string) => {
    const before = envRef.current;
    const posBefore = new Map<string, { x: number; y: number }>();
    for (const n of layoutRef.current.nodes) posBefore.set(n.id, { x: n.x + 80, y: n.y + NODE_H / 2 });

    const res = executeCommand(line, before);
    envRef.current = res.env;
    setEnv(res.env);

    // Real-time File Inspector: if a command mutated/deleted the open file,
    // reflect it immediately (git checkout, rm, echo > file, saves, …)
    const pv = previewRef.current;
    if (pv) {
      const node = findNodeById(res.env.fs, pv.nodeId);
      if (!node || node.type !== 'file') {
        setPreview(null);
        addLog('fs', `inspector closed — ${pv.name} no longer exists`, '#f2708a');
      } else if ((node.content ?? '') !== pv.content) {
        setPreview({ ...pv, content: node.content ?? '' });
        addLog('fs', `${pv.name} changed by command — inspector updated`, '#53c7f0');
      }
    }

    if (line.trim().startsWith('reset')) {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      setStage(null);
      setPackets([]);
      setFlashes([]);
      setProcs([]);
      setPreview(null);
      setHighlightedIds(new Set());
    }

    const cappedLines = res.lines.length > MAX_LINES_PER_BLOCK
      ? [
          ...res.lines.slice(0, MAX_LINES_PER_BLOCK),
          { segs: [{ t: `  [${res.lines.length - MAX_LINES_PER_BLOCK} lines truncated]`, c: 'dim' as const }] },
        ]
      : res.lines;

    setBlocks(bs => {
      const base = res.clear ? (line.trim().startsWith('reset') ? createMotdBlocks(seqRef.current) : []) : bs;
      return [...base.slice(-40), {
        id: ++seqRef.current.block,
        kind: 'cmd' as const,
        prompt: promptSegs(before),
        cmd: line,
        lines: cappedLines,
      }];
    });

    scheduleEvents(res.events, posBefore);
  }, [scheduleEvents]);

  const runLineRef = useRef(runLine);
  runLineRef.current = runLine;

  /* ---------------- demo tour ---------------- */

  const startDemo = useCallback(async () => {
    if (demoRunningRef.current) return;
    demoCancelRef.current = false;
    demoRunningRef.current = true;
    setDemoRunning(true);
    addLog('sys', 'guided tour started');

    const signal = abortControllerRef.current.signal;

    try {
      for (const cmd of DEMO_SCRIPT) {
        if (demoCancelRef.current || signal.aborted) break;
        for (const ch of cmd) {
          if (demoCancelRef.current || signal.aborted) break;
          setInput(s => s + ch);
          await animationBus.delay(Math.max(10, 30 / speedRef.current), signal);
        }
        if (demoCancelRef.current || signal.aborted) break;
        await animationBus.delay(340 / speedRef.current, signal);
        if (demoCancelRef.current || signal.aborted) break;
        setInput('');
        runLineRef.current(cmd);
        const heavy = /^(git|npm|curl|wget|ping|node|python|ssh|traceroute)\b/.test(cmd) || cmd.includes('|');
        await animationBus.delay(heavy ? 3600 : 1400, signal);
      }
    } catch (err) {
      if (!(err instanceof AbortError)) console.error(err);
    } finally {
      setInput('');
      demoRunningRef.current = false;
      setDemoRunning(false);
      addLog('sys', demoCancelRef.current || signal.aborted ? 'tour stopped' : 'tour completed');
    }
  }, [addLog, animationBus]);

  const startDemoRef = useRef(startDemo);
  startDemoRef.current = startDemo;

  /* ---------------- controls ---------------- */

  const setSpeed = (s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  };

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    pauseListenersRef.current.forEach(fn => fn(next));
    addLog('sys', next ? 'engine paused' : 'engine resumed');
  };

  const doReset = () => {
    clearPersistentStorage();
    demoCancelRef.current = true;
    abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    seqRef.current = { block: 0, fx: 0, log: 0 };
    const fresh = initialEnv();
    envRef.current = fresh;
    setEnv(fresh);
    setBlocks(createMotdBlocks(seqRef.current));
    setStage(null);
    setPackets([]);
    setFlashes([]);
    setProcs([]);
    setPreview(null);
    setHighlightedIds(new Set());
    setInput('');
    setLog(createBootLog(seqRef.current));
    addLog('sys', 'sandbox reset to initial state at root directory ~');
  };

  const onHint = useCallback((lines: TermLine[]) => {
    setBlocks(bs => [...bs.slice(-40), { id: ++seqRef.current.block, kind: 'motd' as const, lines }]);
  }, []);

  const onNodeClick = useCallback((n: LaidNode) => {
    if (n.node.phantom) return;
    const rel = displayPath(n.path);
    if (n.node.type === 'file') {
      setPreview({
        nodeId: n.id,
        path: n.path,
        name: n.node.name,
        content: n.node.content ?? '',
      });
      runLineRef.current(`cat ${rel}`);
    } else {
      runLineRef.current(`cd ${rel}`);
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const abort = abortControllerRef.current;
    return () => {
      abort.abort();
    };
  }, []);

  const stagedSet = useMemo(() => new Set(env.git.staged), [env.git.staged]);
  const dirtySet = useMemo(() => new Set(env.git.dirty), [env.git.dirty]);

  return (
    <div className={cn('relative flex h-screen flex-col bg-[var(--surface-base)] text-[var(--text-primary)]', paused && 'viz-paused')}>

      {/* ================= 1. COMMAND BAR (40px) ================= */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3 text-xs">
        {/* Left: Brand & Breadcrumb */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-[var(--border-default)] bg-[var(--surface-card)] font-mono text-[10px] font-bold text-[var(--text-primary)]">
              &gt;_
            </span>
            <span className="font-sans font-semibold tracking-tight text-[var(--text-primary)]">
              Slate
            </span>
          </div>

          <span className="text-[var(--border-strong)] select-none">/</span>

          <div className="flex items-center gap-1.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
            <span>workspace</span>
            <span className="text-[var(--border-strong)]">/</span>
            <span className="text-[var(--text-secondary)] font-medium">project</span>

            {env.git.init && (
              <span className="ml-1.5 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.2 text-[9.5px] font-mono text-[var(--semantic-success)]">
                git:{env.git.branch}{env.git.dirty.length > 0 && <span className="text-[var(--semantic-warning)]">*{env.git.dirty.length}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Right: Compact Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mobile Tab Switcher */}
          <div className="flex lg:hidden rounded border border-[var(--border-default)] bg-[var(--surface-card)] p-0.5 font-mono text-[10px]">
            <button
              onClick={() => setMobileTab('terminal')}
              className={cn('px-2 py-0.5 rounded', mobileTab === 'terminal' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]')}
            >
              Terminal
            </button>
            <button
              onClick={() => setMobileTab('files')}
              className={cn('px-2 py-0.5 rounded', mobileTab === 'files' ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]')}
            >
              Files
            </button>
          </div>

          {/* Compact speed indicator (visible, not in dropdown) */}
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-[var(--text-muted)]">
            <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-[var(--semantic-warning)]' : 'bg-[var(--semantic-success)]')} />
            <span>{paused ? 'Paused' : `${speed === 0.5 ? '½' : speed}×`}</span>
          </span>

          {/* ⚙ Settings Dropdown */}
          <SettingsDropdown
            speed={speed}
            setSpeed={setSpeed}
            paused={paused}
            togglePause={togglePause}
            demoRunning={demoRunning}
            startDemo={() => startDemoRef.current()}
            env={env}
          />

          {/* Reset */}
          <button
            onClick={doReset}
            className="chip h-7 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2.5 font-mono text-[10.5px] font-medium text-[var(--semantic-error)] hover:border-[var(--semantic-error)] hover:bg-[var(--surface-hover)]"
            title="Reset sandbox state"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ================= 2. WORKSPACE PANES ================= */}
      <main className="flex min-h-0 flex-1 p-2 gap-2 overflow-hidden">
        {/* Terminal Pane (42% on desktop) */}
        <section
          className={cn(
            'flex flex-col rounded border border-[var(--border-default)] bg-[var(--surface-panel)] overflow-hidden transition-all',
            'w-full lg:w-[42%] lg:flex',
            mobileTab === 'terminal' ? 'flex' : 'hidden lg:flex'
          )}
        >
          <Terminal
            blocks={blocks}
            input={input}
            setInput={setInput}
            onExecute={l => runLineRef.current(l)}
            onClear={() => setBlocks([])}
            onHint={onHint}
            onCancelDemo={() => { demoCancelRef.current = true; }}
            demoRunning={demoRunning}
            env={env}
            inputRef={inputRef}
          />
        </section>

        {/* Filesystem & Diagnostics Pane (58% on desktop) */}
        <section
          className={cn(
            'flex flex-col rounded border border-[var(--border-default)] bg-[var(--surface-panel)] overflow-hidden transition-all relative',
            'w-full lg:w-[58%] lg:flex',
            mobileTab === 'files' ? 'flex' : 'hidden lg:flex'
          )}
        >
          {/* Top Graph Area (with docked File Inspector) */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <FsCanvas
              layout={layout}
              cwdPath={env.cwd}
              staged={stagedSet}
              dirty={dirtySet}
              flashes={flashes}
              packets={packets}
              preview={preview}
              highlightedIds={highlightedIds}
              onClosePreview={() => setPreview(null)}
              onSaveFile={onSaveFile}
              onNodeClick={onNodeClick}
              onNavigate={(p) => runLineRef.current('cd ' + p)}
              env={env}
            />

            {/* Contextual Operation Stage Overlay */}
            <AnimatePresence>
              {stage && (
                <StageOverlay
                  key={stage.id}
                  stage={stage}
                  speed={speedRef.current}
                  lifeMs={stageLife}
                  onClose={() => setStage(null)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Active Process Strip */}
          <ProcessStrip procs={procs} />

          {/* Collapsible Diagnostics Console (28px header collapsed / 140px expanded) */}
          <div className={cn('shrink-0 border-t border-[var(--border-default)] transition-all duration-140', diagOpen ? 'h-36' : 'h-7')}>
            <EventLog
              entries={log}
              isOpen={diagOpen}
              onToggle={() => setDiagOpen(!diagOpen)}
            />
          </div>
        </section>
      </main>

      {/* ================= 3. STATUS BAR (24px) ================= */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 font-mono text-[10px] text-[var(--text-muted)]">
        <div className="flex items-center gap-3 truncate">
          <span>cwd: <strong className="text-[var(--text-primary)] font-medium">{displayPath(env.cwd)}</strong></span>
          <span>·</span>
          <span>{counts.dirs} directories</span>
          <span>·</span>
          <span>{counts.files} files</span>
          {env.git.init && (
            <>
              <span>·</span>
              <span>git: <span className="text-[var(--semantic-success)]">{env.git.branch}</span>{env.git.dirty.length > 0 && <span className="text-[var(--semantic-warning)]">*{env.git.dirty.length}</span>}</span>
            </>
          )}
          {env.packages.length > 0 && (
            <>
              <span>·</span>
              <span>{env.packages.length} pkgs</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-[var(--semantic-warning)]' : 'bg-[var(--semantic-success)]')} />
          <span>{paused ? 'paused' : 'ready'}</span>
          <span className="hidden sm:inline text-[var(--border-strong)]">·</span>
          <span className="hidden sm:inline">in-memory sandbox</span>
        </div>
      </footer>
    </div>
  );
}
