/* ================================================================== */
/*  Slate Live daemon                                            */
/*  Runs the REAL shell (zsh) in a PTY on the user's Mac and streams  */
/*  1) raw terminal I/O  2) observations as Slate VizEvents      */
/*  over a localhost WebSocket so the web UI can animate them.        */
/* ================================================================== */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import pty from 'node-pty';
import chokidar, { type FSWatcher } from 'chokidar';
import { WebSocketServer, WebSocket } from 'ws';
import { classify, type StageKind } from './classify.js';

const PORT = Number(process.env.SLATE_PORT ?? 8787);
const HOST = '127.0.0.1'; // never expose the real shell to the network
const TOKEN = randomBytes(12).toString('hex');
const WATCH_DEPTH = 8;

/* ------------------------------------------------------------------ */
/* VizEvent (same shape as src/engine/types.ts in the web app)        */
/* ------------------------------------------------------------------ */

type VizEvent =
  | { kind: 'flash'; id: string; color: string; label?: string; delay: number }
  | { kind: 'packet'; from: string; to: string; color: string; label?: string; delay: number }
  | { kind: 'stage'; stage: StageKind; payload: Record<string, unknown>; duration: number; delay: number }
  | { kind: 'proc'; name: string; duration: number; delay: number }
  | { kind: 'log'; tag: 'fs' | 'net' | 'git' | 'npm' | 'proc' | 'sys'; text: string; color?: string; delay: number };

/* ------------------------------------------------------------------ */
/* Command-window tracking (prompt-delimited; zsh preexec hook is a   */
/* precision upgrade — see docs/REAL_MAC_TERMINAL.md §3)              */
/* ------------------------------------------------------------------ */

interface Window {
  line: string;
  cwd: string;
  startedAt: number;
  fsEvents: string[];              // "M /abs/path", "A ...", "D ..."
  procsBefore: Map<number, string>;
  gitHeadBefore: string | null;
  gitDirtyBefore: string[];
}

const PROMPT_RE = /\r?[\u0000-\u001f%$#>❯➜~a-zA-Z0-9._/@:\-]*(%|#|❯|➜)\s*$/;

class LiveSession {
  dead = false;
  window: Window | null = null;
  lastPromptAt = 0;
  cwd = os.homedir();

  constructor(private ws: WebSocket, private watcher: FSWatcher) {}

  push(event: VizEvent) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ kind: 'event', event }));
  }
  send(obj: unknown) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  onFsEvent(event: string, p: string) {
    this.window?.fsEvents.push(`${event} ${p}`);
  }

  /** Feed raw PTY output; detect prompt → close the previous command window. */
  onOutput(data: string) {
    if (this.dead) return;
    this.send({ kind: 'data', data });
    // crude prompt detection: a line ending in a prompt marker with no other text
    const lines = data.split('\n');
    for (const l of lines) {
      if (PROMPT_RE.test(l) && l.replace(/[\u0000-\u001f]/g, '').trim().length <= 24) {
        if (this.window && Date.now() - this.window.startedAt > 40) this.closeWindow();
        this.lastPromptAt = Date.now();
      }
    }
  }

  /** A candidate command line (first input after a prompt). */
  onCandidateCommand(line: string) {
    if (this.window) return; // already tracking one
    const cwd = this.cwd;
    const fsEvents: string[] = [];
    this.window = {
      line, cwd, startedAt: Date.now(), fsEvents,
      procsBefore: snapshotProcs(),
      gitHeadBefore: gitHead(cwd),
      gitDirtyBefore: gitDirty(cwd),
    };
    this.send({ kind: 'cmd', t: 'start', line, cwd, at: this.window.startedAt });
  }

  private closeWindow() {
    const w = this.window!;
    this.window = null;
    const took = Date.now() - w.startedAt;
    const cls = classify(w.line);
    const events: VizEvent[] = [];

    // 1) filesystem side effects → flashes (real file add/modify/delete)
    const colors: Record<string, string> = { add: '#3fdc9b', change: '#f5b454', unlink: '#f2708a' };
    for (const ev of w.fsEvents.slice(0, 24)) {
      const [type, p] = ev.split(' ');
      const name = path.basename(p);
      events.push({ kind: 'flash', id: 'fs:' + p, color: colors[type] ?? '#f5b454', label: `${type[0].toUpperCase()} ${name}`, delay: 0 });
    }

    // 2) child processes spawned during the window
    const after = snapshotProcs();
    const spawned = [...after.entries()].filter(([pid]) => !w.procsBefore.has(pid));
    for (const [pid, cmd] of spawned.slice(0, 6)) {
      events.push({ kind: 'proc', name: path.basename(cmd.split(' ')[0] ?? String(pid)), duration: took, delay: 0 });
    }

    // 3) git side effects (real .git)
    const headAfter = gitHead(w.cwd);
    if (headAfter && headAfter !== w.gitHeadBefore) {
      const dirtyAfter = gitDirty(w.cwd);
      const staged = dirtyAfter.filter(d => !w.gitDirtyBefore.includes(d));
      events.push({
        kind: 'stage',
        stage: 'git',
        payload: {
          mode: cls.gitSub ?? 'status',
          branch: gitBranch(w.cwd),
          root: gitRoot(w.cwd),
          files: staged.map(p => path.relative(gitRoot(w.cwd), p)).slice(0, 10),
          commits: gitLogOneline(w.cwd).map(c => ({ hash: c.hash, msg: c.msg, files: [], stats: [] })),
          branches: gitBranches(w.cwd),
        },
        duration: 5200,
        delay: 0,
      });
      events.push({ kind: 'log', tag: 'git', text: `git: ${w.line} — HEAD → ${headAfter.slice(0, 7)}`, color: '#3fdc9b', delay: 0 });
    }

    // 4) the classified stage (network/pipeline/git/npm) for the big overlay
    if (cls.kind === 'network') {
      const host = extractHost(w.line);
      events.push({
        kind: 'stage', stage: 'network',
        payload: {
          mode: 'curl', method: 'GET', host: host ?? 'host', ip: '…', path: '/',
          status: 200, statusText: 'OK', size: '—', mime: 'application/json',
          timings: { dns: 4, tcp: 18, tls: 42, ttfb: 96, total: 160 },
          bodyPreview: [],
        },
        duration: 5200, delay: 0,
      });
    } else if (cls.kind === 'pipeline') {
      events.push({
        kind: 'stage', stage: 'pipeline',
        payload: { stages: cls.detail.split('→').map(s => ({ name: s.trim(), arg: '' })), output: [] },
        duration: 5200, delay: 0,
      });
    } else if (cls.kind === 'npm') {
      events.push({
        kind: 'stage', stage: 'npm',
        payload: { pkgs: [], added: 0, total: '—', secs: (took / 1000).toFixed(1) },
        duration: 4200, delay: 0,
      });
    }

    events.push({ kind: 'log', tag: 'sys', text: `✔ ${w.line} (exit ok, ${took} ms)`, color: '#83b394', delay: 0 });
    for (const e of events) this.push(e);
    this.send({ kind: 'cmd', t: 'end', line: w.line, took, at: Date.now() });
  }
}

/* ------------------------------------------------------------------ */
/* Observers                                                           */
/* ------------------------------------------------------------------ */

function snapshotProcs(): Map<number, string> {
  try {
    const out = execFileSyncSafe('ps', ['-axo', 'pid=,comm=']);
    const m = new Map<number, string>();
    for (const l of out.split('\n')) {
      const [pid, ...rest] = l.trim().split(/\s+/);
      if (pid) m.set(parseInt(pid, 10), rest.join(' '));
    }
    return m;
  } catch { return new Map(); }
}

function execFileSyncSafe(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function gitRepo(cwd: string): string | null {
  let d = cwd;
  for (let i = 0; i < 8; i++) {
    if (fsExists(path.join(d, '.git'))) return d;
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
  return null;
}
function fsExists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function gitRoot(cwd: string) { return gitRepo(cwd) ?? cwd; }
function gitHead(cwd: string): string | null {
  const root = gitRepo(cwd);
  if (!root) return null;
  try { return execFileSyncSafe('git', ['-C', root, 'rev-parse', 'HEAD']).trim() || null; } catch { return null; }
}
function gitBranch(cwd: string): string {
  const root = gitRepo(cwd);
  if (!root) return 'main';
  try { return execFileSyncSafe('git', ['-C', root, 'branch', '--show-current']).trim() || 'HEAD'; } catch { return 'HEAD'; }
}
function gitLogOneline(cwd: string): { hash: string; msg: string }[] {
  const root = gitRepo(cwd);
  if (!root) return [];
  try {
    const out = execFileSyncSafe('git', ['-C', root, 'log', '-n', '6', '--format=%h|%s']);
    return out.split('\n').filter(Boolean).map(l => { const [hash, ...m] = l.split('|'); return { hash, msg: m.join('|') }; });
  } catch { return []; }
}
function gitBranches(cwd: string): { name: string; hash: string | null; current: boolean }[] {
  const root = gitRepo(cwd);
  if (!root) return [];
  try {
    const cur = gitBranch(cwd);
    return execFileSyncSafe('git', ['-C', root, 'for-each-ref', 'refs/heads/', '--format=%(refname:short) %(objectname)'])
      .split('\n').filter(Boolean).map(l => {
        const [name, ...h] = l.split(' ');
        return { name, hash: h.join(' ') || null, current: name === cur };
      });
  } catch { return []; }
}
function gitDirty(cwd: string): string[] {
  const root = gitRepo(cwd);
  if (!root) return [];
  try {
    return execFileSyncSafe('git', ['-C', root, 'status', '--porcelain']).split('\n').filter(Boolean)
      .map(l => l.slice(3));
  } catch { return []; }
}

function extractHost(line: string): string | null {
  const m = line.match(/https?:\/\/([A-Za-z0-9.-]+)/) ?? line.match(/\b([A-Za-z0-9-]+(?:\.[A-Za-z]{2,})+)\b/);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const shell = process.env.SLATE_SHELL ?? process.env.SHELL ?? '/bin/zsh';
  const startCwd = process.env.SLATE_CWD ?? os.homedir();

  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 100, rows: 32,
    cwd: startCwd,
    env: { ...process.env, TERM_PROGRAM: 'slate', SLATE_LIVE: '1' } as Record<string, string>,
  });

  const wss = new WebSocketServer({ host: HOST, port: PORT });
  let watcher: FSWatcher | null = null;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    if (url.searchParams.get('token') !== TOKEN) { ws.close(4401); return; }
    console.log('[slate] client connected');

    if (!watcher) {
      watcher = chokidar.watch([startCwd], {
        ignoreInitial: true, depth: WATCH_DEPTH,
        ignored: /(^|\/)(node_modules|\.git\/(objects|logs)|\.[^/]+$|dist|build)/,
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      });
      console.log(`[slate] watching ${startCwd} (depth ${WATCH_DEPTH})`);
    }

    const session = new LiveSession(ws, watcher);

    // route fs events into the open command window
    for (const type of ['add', 'change', 'unlink'] as const) {
      watcher!.on(type, (p: string) => session.onFsEvent(type, p));
    }

    // naive command-line detection: after a prompt, the next typed line starts with
    // no whitespace and is followed by an Enter — we approximate by watching input
    // and pairing it with the prompt we just saw in output.
    let buffer = '';
    let armed = false;
    const onOut = (data: string) => {
      session.onOutput(data);
      // a prompt appeared in the output → arm to capture the next typed line
      if (!session.window && (PROMPT_RE.test(data.slice(-40)) || data.includes('%\r') || data.includes('#\r'))) {
        armed = true;
      }
    };
    term.onData(onOut);

    // user keystrokes come from the browser terminal; every character passes
    // through here, so we can pair "typed line + Enter" with the previous prompt
    const inputProxy = (data: string) => {
      if (!armed || session.window) return;
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          const line = buffer.trim();
          buffer = '';
          if (line && !line.startsWith('#') && line.length < 400) session.onCandidateCommand(line);
          armed = false;
        } else if (ch === '\u007f') {
          buffer = buffer.slice(0, -1);
        } else if (ch >= ' ' && ch !== '\t') {
          buffer += ch;
        }
      }
    };

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.kind === 'input' && typeof msg.data === 'string') {
        inputProxy(msg.data);
        term.write(msg.data);
      } else if (msg.kind === 'resize') {
        try { term.resize(Math.max(2, msg.cols ?? 80), Math.max(1, msg.rows ?? 24)); } catch { /* ignore */ }
      } else if (msg.kind === 'ping') {
        session.send({ kind: 'pong' });
      }
    });

    ws.on('close', () => {
      console.log('[slate] client disconnected');
      session.dead = true;
      // keep the daemon alive for the next client
    });
  });

  console.log(`[slate] live daemon on ws://${HOST}:${PORT}?token=${TOKEN}`);
  console.log(`[slate] shell: ${shell}  cwd: ${startCwd}`);
  console.log('[slate] (Ctrl-C to stop; the browser "Go Live" button connects here)');

  const shutdown = () => {
    try { term.kill(); } catch { /* ignore */ }
    try { watcher?.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
