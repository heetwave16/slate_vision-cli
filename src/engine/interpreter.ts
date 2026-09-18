/* ================================================================== */
/*  Slate interpreter                                                 */
/*  line → tokens → intent → draft state mutation → visual events     */
/* ================================================================== */

import {
  HOME, displayPath, normalize, resolvePath, parentDir, ensureDir,
  removeAtPath, deepCloneNode, makeDir, makeFile, nodeSize, humanSize, newId,
} from './fs';
import type {
  EnvState, ExecResult, FsNode, GitCommit, LogTag, Pkg, StageKind, StagePayload,
  TermColor, TermLine, TermSeg, VizEvent, PipelineStageInfo,
} from './types';
import { FORMULA_REGISTRY, handleBrewCommand } from './brew';
import { handleOmzCommand } from './omz';
import {
  getStorageMetadata, clearPersistentStorage, exportStorageSnapshot,
  triggerDownload, importStorageSnapshot, isStorageAvailable,
} from './storage';

export const TTY = 'tty';

/* ------------------------------------------------------------------ */
/* Command catalog (help + tab completion)                             */
/* ------------------------------------------------------------------ */

export const COMMANDS: { name: string; desc: string; group: string }[] = [
  { name: 'help', desc: 'list available commands', group: 'basics' },
  { name: 'pwd', desc: 'print working directory', group: 'basics' },
  { name: 'ls', desc: 'list directory contents [-la]', group: 'basics' },
  { name: 'cd', desc: 'change directory', group: 'basics' },
  { name: 'tree', desc: 'print filesystem tree', group: 'basics' },
  { name: 'clear', desc: 'clear the terminal', group: 'basics' },
  { name: 'reset', desc: 'reset sandbox + clear', group: 'basics' },
  { name: 'demo', desc: 'run the guided demo script', group: 'basics' },

  { name: 'mkdir', desc: 'create directories [-p]', group: 'files' },
  { name: 'touch', desc: 'create empty files', group: 'files' },
  { name: 'cat', desc: 'print file contents & pop interactive preview', group: 'files' },
  { name: 'echo', desc: 'print text · echo x > file writes', group: 'files' },
  { name: 'cp', desc: 'copy files/dirs [-r]', group: 'files' },
  { name: 'mv', desc: 'move / rename', group: 'files' },
  { name: 'rm', desc: 'remove files/dirs [-rf]', group: 'files' },
  { name: 'chmod', desc: 'change file mode / permissions (+x, 755)', group: 'files' },
  { name: 'chown', desc: 'change file owner (simulated)', group: 'files' },
  { name: 'ln', desc: 'create symbolic link (ln -s target link)', group: 'files' },
  { name: 'stat', desc: 'display detailed file/directory status', group: 'files' },
  { name: 'find', desc: 'search for files by name/pattern (find . -name "*.js")', group: 'files' },
  { name: 'diff', desc: 'compare files line by line', group: 'files' },
  { name: 'grep', desc: 'search lines by pattern', group: 'files' },
  { name: 'wc', desc: 'count lines/words/bytes', group: 'files' },
  { name: 'head', desc: 'first lines of a file', group: 'files' },
  { name: 'tail', desc: 'last lines of a file', group: 'files' },
  { name: 'sort', desc: 'sort lines of text files', group: 'files' },
  { name: 'uniq', desc: 'report or omit repeated lines', group: 'files' },
  { name: 'cut', desc: 'remove sections from lines (cut -d: -f1)', group: 'files' },
  { name: 'tr', desc: 'translate or delete characters', group: 'files' },
  { name: 'tee', desc: 'read from stdin and write to stdout and files', group: 'files' },
  { name: 'sed', desc: 'stream editor for filtering/transforming (sed s/a/b/g)', group: 'files' },
  { name: 'awk', desc: 'pattern scanning and processing language', group: 'files' },
  { name: 'du', desc: 'estimate file space usage', group: 'files' },

  { name: 'git init', desc: 'initialize a repository', group: 'git' },
  { name: 'git add', desc: 'stage files (git add .)', group: 'git' },
  { name: 'git commit', desc: 'commit staged (git commit -m "msg")', group: 'git' },
  { name: 'git status', desc: 'show working tree state', group: 'git' },
  { name: 'git log', desc: 'show commit history', group: 'git' },
  { name: 'git branch', desc: 'list or create branches', group: 'git' },
  { name: 'git diff', desc: 'show changes between commits / working tree', group: 'git' },

  { name: 'npm init', desc: 'create package.json (npm init -y)', group: 'npm' },
  { name: 'npm install', desc: 'resolve + install packages', group: 'npm' },
  { name: 'npm run', desc: 'run a package script', group: 'npm' },

  { name: 'curl', desc: 'HTTP request (curl -o f url)', group: 'net' },
  { name: 'wget', desc: 'download a file', group: 'net' },
  { name: 'ping', desc: 'ICMP round-trips to a host', group: 'net' },
  { name: 'ssh', desc: 'simulated OpenSSH SSH client', group: 'net' },
  { name: 'traceroute', desc: 'trace route to network host', group: 'net' },
  { name: 'dig', desc: 'DNS lookup utility', group: 'net' },

  { name: 'node', desc: 'execute a .js file (simulated)', group: 'proc' },
  { name: 'python', desc: 'execute a .py file (simulated)', group: 'proc' },
  { name: 'ps', desc: 'list processes', group: 'proc' },
  { name: 'xargs', desc: 'build and execute command lines from stdin', group: 'proc' },
  { name: 'which', desc: 'locate a command', group: 'proc' },
  { name: 'env', desc: 'display environment variables', group: 'proc' },
  { name: 'export', desc: 'set environment variable (export KEY=VAL)', group: 'proc' },
  { name: 'alias', desc: 'define or display aliases (alias ll="ls -la")', group: 'proc' },
  { name: 'unalias', desc: 'remove alias definition', group: 'proc' },
  { name: 'type', desc: 'describe a command type', group: 'proc' },
  { name: 'df', desc: 'report file system disk space usage', group: 'proc' },
  { name: 'sleep', desc: 'wait N seconds (accelerated)', group: 'proc' },
  { name: 'whoami', desc: 'current user', group: 'proc' },
  { name: 'id', desc: 'print real and effective user and group IDs', group: 'proc' },
  { name: 'date', desc: 'current date/time', group: 'proc' },
  { name: 'uname', desc: 'system information', group: 'proc' },
  { name: 'uptime', desc: 'tell how long the system has been running', group: 'proc' },
  { name: 'history', desc: 'command history', group: 'proc' },

  { name: 'brew install', desc: 'install packages (cowsay, neofetch, jq, figlet, bat, ripgrep, htop)', group: 'brew' },
  { name: 'brew list', desc: 'list installed Homebrew packages', group: 'brew' },
  { name: 'brew info', desc: 'show formula details', group: 'brew' },
  { name: 'brew uninstall', desc: 'uninstall a package', group: 'brew' },

  { name: 'omz install', desc: 'install Oh My Zsh and initialize ~/.zshrc', group: 'omz' },
  { name: 'omz theme', desc: 'switch prompt theme (robbyrussell, agnoster, powerlevel10k, minimal)', group: 'omz' },
  { name: 'omz list', desc: 'list available themes and plugins', group: 'omz' },

  { name: 'storage', desc: 'manage persistent sandbox storage (status, export, import, clear)', group: 'basics' },
  { name: 'import', desc: 'import external files into virtual filesystem (import <file> or import <url>)', group: 'files' },
];

export const DEMO_SCRIPT = [
  'cd project',
  'ls -la',
  'mkdir -p src/components',
  'echo "export const Button = ({ label }) => <button>{label}</button>" > src/components/Button.jsx',
  'git init',
  'git add .',
  'git commit -m "feat: scaffold button component"',
  'npm install framer-motion',
  'curl -o public/hero.svg https://cdn.sandbox.dev/hero.svg',
  'cat README.md',
  'node src/index.js',
  'tree',
];

/* ------------------------------------------------------------------ */
/* Initial environment                                                 */
/* ------------------------------------------------------------------ */

const PACKAGE_JSON = `{
  "name": "project",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/index.js",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}`;

const README = `# Sandbox Project

A tiny demo project living inside the Slate sandbox.

## Tasks
- TODO: wire up the visualization bus
- TODO: ship the animation debugger
- done: scaffold the repository

## License
MIT`;

const INDEX_JS = `import { createServer } from 'node:http';

const app = createServer((req, res) => {
  res.end('ok');
});

app.listen(3000, () => {
  console.log('listening on :3000');
});`;

const UTILS_JS = `export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const uid = () => Math.random().toString(36).slice(2, 9);`;

export function initialEnv(): EnvState {
  let seq = 0;
  const id = () => 'n' + (++seq);
  const nowMs = Date.now();
  const file = (name: string, content: string, exec = false): FsNode =>
    ({ id: id(), name, type: 'file', content, exec, mtime: nowMs - 3600000, mode: exec ? '755' : '644' });
  const dir = (name: string, children: FsNode[]): FsNode =>
    ({ id: id(), name, type: 'dir', children, mtime: nowMs - 7200000, mode: '755' });

  const fs = dir('~', [
    file('.bashrc', 'export PS1="\\u@\\h \\w $ "\nalias ll="ls -la"\nalias la="ls -a"'),
    file('README.md', README),
    file('package.json', PACKAGE_JSON),
    dir('project', [
      dir('src', [file('index.js', INDEX_JS), file('utils.js', UTILS_JS)]),
      dir('public', []),
      file('package.json', PACKAGE_JSON),
      file('README.md', README),
    ]),
  ]);

  return {
    fs,
    cwd: HOME,
    git: { init: false, root: '', branch: 'main', staged: [], dirty: [], commits: [] },
    packages: [],
    seq,
    user: 'dev',
    host: 'sandbox',
    history: [],
    vars: {
      USER: 'dev',
      HOME,
      SHELL: '/bin/zsh',
      TERM: 'xterm-256color',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      SANDBOX: '1',
    },
    aliases: {
      ll: 'ls -la',
      la: 'ls -a',
      cls: 'clear',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tokenizing / splitting (quote-aware)                                */
/* ------------------------------------------------------------------ */

function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  const flush = () => { if (cur !== '') { out.push(cur); cur = ''; } };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      if (quote) {
        if (s[i + 1] === quote || s[i + 1] === '\\') {
          cur += s[i + 1];
          i++;
          continue;
        }
      } else {
        cur += s[i + 1];
        i++;
        continue;
      }
    }
    if (quote) {
      if (ch === quote) { quote = null; flush(); }
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ' ' || ch === '\t') { flush(); continue; }
    if (ch === '|' || ch === '>' || ch === ';' || ch === '&') {
      if ((ch === '|' || ch === '>') && s[i + 1] === ch) {
        flush(); out.push(ch + ch); i++; continue;
      }
      if (ch === '&' && s[i + 1] === '&') { flush(); out.push('&&'); i++; continue; }
      if (ch === '&') { cur += ch; continue; } // stray & — treat as literal
      flush(); out.push(ch); continue;
    }
    cur += ch;
  }
  if (quote) flush();
  flush();
  return out;
}

/** Split a line on top-level separators (quote-aware). */
function splitTop(line: string, seps: string[]): { text: string; sep: string | null }[] {
  const out: { text: string; sep: string | null }[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      cur += ch + line[i + 1];
      i++;
      continue;
    }
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    const two = line.slice(i, i + 2);
    if (seps.includes(two)) { out.push({ text: cur, sep: two }); cur = ''; i++; continue; }
    if (seps.includes(ch)) { out.push({ text: cur, sep: ch }); cur = ''; continue; }
    cur += ch;
  }
  out.push({ text: cur, sep: null });
  return out;
}

interface RedirectInfo { tokens: string[]; target: string | null; append: boolean }

function extractRedirect(tokens: string[]): RedirectInfo {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '>' || t === '>>') {
      const target = tokens[i + 1] ?? '';
      const rest = tokens.filter((_, j) => j !== i && j !== i + 1);
      return { tokens: rest, target: target || null, append: t === '>>' };
    }
    if (t.startsWith('>>') && t.length > 2) {
      return { tokens: tokens.filter((_, j) => j !== i), target: t.slice(2), append: true };
    }
    if (t.startsWith('>') && t.length > 1) {
      return { tokens: tokens.filter((_, j) => j !== i), target: t.slice(1), append: false };
    }
  }
  return { tokens, target: null, append: false };
}

/* ------------------------------------------------------------------ */
/* Execution context                                                   */
/* ------------------------------------------------------------------ */

class Exec {
  env: EnvState;
  events: VizEvent[] = [];
  lines: TermLine[] = [];
  stdin: string;
  ok = true;
  private stdoutBuf: string[] = [];

  constructor(env: EnvState, stdin: string) {
    this.env = env;
    this.stdin = stdin;
  }

  get stdout(): string { return this.stdoutBuf.join('\n'); }

  /** Absorb output produced out-of-band (e.g. by a brew formula) into the capturable stdout buffer. */
  absorbStdout(text: string) {
    if (text) this.stdoutBuf.push(text);
  }

  out(text: string, c?: TermColor, b?: boolean) {
    this.lines.push({ segs: [{ t: text, c, b }] });
    this.stdoutBuf.push(text);
  }
  outSegs(segs: TermSeg[]) {
    this.lines.push({ segs });
    this.stdoutBuf.push(segs.map(s => s.t).join(''));
  }
  /** visible only — never captured by pipes / redirects */
  show(text: string, c?: TermColor, b?: boolean) {
    this.lines.push({ segs: [{ t: text, c, b }] });
  }
  showSegs(segs: TermSeg[]) { this.lines.push({ segs }); }
  err(text: string) {
    this.ok = false;
    this.lines.push({ segs: [{ t: text, c: 'err' }] });
  }

  flash(id: string, color: string, label?: string, delay = 0) {
    this.events.push({ kind: 'flash', id, color, label, delay });
  }
  packet(from: string, to: string, color: string, label?: string, delay = 0) {
    this.events.push({ kind: 'packet', from, to, color, label, delay });
  }
  stage(stage: StageKind, payload: StagePayload, duration: number, delay = 0) {
    this.events.push({ kind: 'stage', stage, payload, duration, delay });
  }
  proc(name: string, duration: number, delay = 0) {
    this.events.push({ kind: 'proc', name, duration, delay });
  }
  log(tag: LogTag, text: string, color?: string, delay = 0) {
    this.events.push({ kind: 'log', tag, text, color, delay });
  }
  preview(nodeId: string, path: string, delay = 0) {
    this.events.push({ kind: 'preview', nodeId, path, delay });
  }
  highlight(ids: string[], color: string, duration = 2400, delay = 0) {
    this.events.push({ kind: 'highlight', ids, color, duration, delay });
  }

  markDirty(absPath: string) {
    const g = this.env.git;
    if (!g.init || !absPath.startsWith(g.root)) return;
    if (!g.dirty.includes(absPath) && !g.staged.includes(absPath)) g.dirty.push(absPath);
  }
  untrack(absPath: string) {
    const g = this.env.git;
    g.staged = g.staged.filter(p => p !== absPath);
    if (g.init && absPath.startsWith(g.root) && !g.dirty.includes(absPath)) g.dirty.push(absPath);
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const rand = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));
const hash7 = () => Array.from({ length: 7 }, () => '0123456789abcdef'[rand(0, 15)]).join('');
const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

/** Extract single-letter flag clusters (-la, -rf…) into a string; keep raw args intact. */
function flagsOf(args: string[]): string {
  let flags = '';
  for (const a of args) if (/^-[a-zA-Z]+$/.test(a)) flags += a.slice(1);
  return flags;
}

const nonFlags = (args: string[]) => args.filter(a => !a.startsWith('-'));

function walkFiles(node: FsNode, path: string, cb: (file: FsNode, p: string) => void) {
  for (const c of node.children ?? []) {
    const p = path + '/' + c.name;
    if (c.type === 'file') cb(c, p);
    else walkFiles(c, p, cb);
  }
}

function parseUrl(u: string): { host: string; path: string } {
  let s = u.replace(/^[a-z]+:\/\//i, '');
  const slash = s.indexOf('/');
  const host = slash === -1 ? s : s.slice(0, slash);
  const path = slash === -1 ? '/' : s.slice(slash);
  return { host: host || 'localhost', path };
}

function mimeOf(p: string): string {
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.js')) return 'text/javascript';
  return 'text/plain';
}

function fakeBody(path: string, host: string): string {
  if (path.endsWith('.json')) {
    return JSON.stringify({ source: host, items: [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }], ok: true }, null, 2);
  }
  if (path.endsWith('.svg')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#f5b454"/></svg>`;
  }
  return `<!doctype html><html><body><h1>${host}</h1></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Command handlers                                                    */
/* ------------------------------------------------------------------ */

type Handler = (x: Exec, args: string[], flags: string) => void;

const HANDLERS: Record<string, Handler> = {

  pwd: (x) => {
    x.out(displayPath(x.env.cwd), 'cyan');
    const res = resolvePath(x.env, x.env.cwd);
    if (res) {
      x.packet(res.node.id, TTY, '#f5b454', 'pwd', 0);
      x.flash(res.node.id, '#f5b454', 'pwd', 120);
    }
  },

  whoami: (x) => x.out(x.env.user),
  hostname: (x) => x.out(x.env.host),
  date: (x) => x.out(new Date().toString()),
  uname: (x, _a, flags) =>
    x.out(flags.includes('a')
      ? 'Linux sandbox 6.1.0-viz #1 SMP x86_64 GNU/Linux (virtualized)'
      : 'Linux'),
  uptime: (x) => x.out(` ${now()} up 0 min,  1 user,  load average: 0.08, 0.03, 0.01`),

  env: (x) => {
    x.out(`HOME=${HOME}`);
    x.out('USER=dev');
    x.out('SHELL=/bin/zsh');
    x.out('TERM=xterm-slate');
    x.out('SANDBOX=1');
  },

  history: (x) => {
    x.env.history.slice(-20).forEach((h, i) => x.out(`  ${String(i + 1).padStart(3)}  ${h}`, 'dim'));
  },

  ps: (x) => {
    x.outSegs([
      { t: '  PID TTY      TIME     CMD', c: 'dim' },
    ]);
    x.outSegs([{ t: '    1 ?        00:00:00 ', c: 'dim' }, { t: 'sandbox-init', c: 'fg' }]);
    x.outSegs([{ t: '   42 pts/0    00:00:00 ', c: 'dim' }, { t: 'zsh', c: 'fg' }]);
    x.outSegs([{ t: '   87 pts/0    00:00:01 ', c: 'dim' }, { t: 'slate-viz', c: 'amber' }]);
    x.show('  (long-running jobs also appear in the process strip →)', 'dim');
  },

  ls: (x, args, flags) => {
    const p = nonFlags(args)[0];
    const target = p ? resolvePath(x.env, p) : resolvePath(x.env, '.');
    if (!target) { x.err(`ls: cannot access '${p}': No such file or directory`); return; }
    if (target.node.type === 'file') { x.out(target.node.name); return; }
    let kids = (target.node.children ?? []).filter(c => !c.phantom);
    if (!flags.includes('a')) kids = kids.filter(c => !c.name.startsWith('.'));
    kids = kids.slice().sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);

    if (flags.includes('l')) {
      x.outSegs([{ t: `total ${kids.length} · ${displayPath(target.path)}`, c: 'dim' }]);
      const dNow = new Date();
      const dateStr = dNow.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) + ' ' + dNow.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      for (const k of kids) {
        const isDir = k.type === 'dir';
        const size = isDir ? String(32 + (k.children?.length ?? 0) * 8) : String(nodeSize(k));
        let perms = '-rw-r--r--  ';
        if (isDir) perms = 'drwxr-xr-x  ';
        else if (k.exec) perms = '-rwxr-xr-x  ';
        let nameColor: TermColor = 'fg';
        if (isDir) nameColor = 'cyan';
        else if (k.exec) nameColor = 'green';
        else if (k.name.startsWith('.')) nameColor = 'dim';
        x.outSegs([
          { t: perms, c: 'dim' },
          { t: '1 dev dev ', c: 'dim' },
          { t: size.padStart(5), c: 'dim' },
          { t: `  ${dateStr}  `, c: 'dim' },
          { t: k.name, c: nameColor, b: isDir },
        ]);
      }
    } else {
      const segs: TermSeg[] = [];
      kids.forEach((k, i) => {
        const isDir = k.type === 'dir';
        segs.push({
          t: k.name.padEnd(Math.max(k.name.length + 2, 18)),
          c: isDir ? 'cyan' : k.exec ? 'green' : k.name.startsWith('.') ? 'dim' : 'fg',
          b: isDir,
        });
        if ((i + 1) % 4 === 0 && i < kids.length - 1) { x.outSegs(segs.splice(0)); }
      });
      if (segs.length) x.outSegs(segs);
      if (!kids.length) x.show('  (empty directory)', 'dim');
    }
    x.packet(TTY, target.node.id, '#53c7f0', 'ls', 0);
    x.flash(target.node.id, '#53c7f0', `${kids.length} entries`, 160);
    x.log('fs', `ls ${displayPath(target.path)} → ${kids.length} entries`);
  },

  cd: (x, args) => {
    const res = resolvePath(x.env, args[0] ?? '~');
    if (!res) { x.err(`cd: no such file or directory: ${args[0]}`); return; }
    if (res.node.type !== 'dir') { x.err(`cd: not a directory: ${args[0]}`); return; }
    x.env.cwd = res.path;
    x.packet(TTY, res.node.id, '#f5b454', 'cd', 0);
    x.flash(res.node.id, '#f5b454', 'cwd', 180);
    x.log('fs', `cwd → ${displayPath(res.path)}`, '#f5b454');
  },

  mkdir: (x, args, flags) => {
    const paths = nonFlags(args);
    if (!paths.length) { x.err('mkdir: missing operand'); return; }
    paths.forEach((a, i) => {
      const abs = normalize(x.env.cwd, a);
      if (!abs) { x.err(`mkdir: cannot create '${a}': outside sandbox`); return; }
      const existing = resolvePath(x.env, a);
      if (existing) {
        if (flags.includes('p') && existing.node.type === 'dir') return;
        x.err(`mkdir: cannot create directory '${a}': File exists`);
        return;
      }
      const node = ensureDir(x.env, abs);
      if (!node) { x.err(`mkdir: cannot create directory '${a}'`); return; }
      x.packet(TTY, node.id, '#3fdc9b', '+ dir', i * 100);
      x.flash(node.id, '#3fdc9b', '+ dir', 180 + i * 140);
      x.markDirty(abs);
      x.log('fs', `mkdir ${displayPath(abs)}`, '#3fdc9b');
    });
  },

  touch: (x, args) => {
    const paths = nonFlags(args);
    if (!paths.length) { x.err('touch: missing file operand'); return; }
    paths.forEach((a, i) => {
      const abs = normalize(x.env.cwd, a);
      if (!abs) { x.err(`touch: cannot touch '${a}': outside sandbox`); return; }
      const existing = resolvePath(x.env, a);
      if (existing) { x.flash(existing.node.id, '#3fdc9b', 'touched', 180 + i * 120); return; }
      const parent = parentDir(x.env, abs);
      if (!parent) { x.err(`touch: cannot touch '${a}': No such file or directory`); return; }
      const node = makeFile(x.env, abs.split('/').pop()!);
      parent.children!.push(node);
      x.packet(TTY, node.id, '#3fdc9b', '+ file', i * 100);
      x.flash(node.id, '#3fdc9b', '+ file', 180 + i * 140);
      x.markDirty(abs);
      x.log('fs', `touch ${displayPath(abs)}`, '#3fdc9b');
    });
  },

  cat: (x, args) => {
    const paths = nonFlags(args);
    if (!paths.length) {
      if (x.stdin) x.stdin.split('\n').forEach(l => x.out(l));
      else x.err('cat: missing operand');
      return;
    }
    paths.forEach((a, i) => {
      const res = resolvePath(x.env, a);
      if (!res) { x.err(`cat: ${a}: No such file or directory`); return; }
      if (res.node.type === 'dir') { x.err(`cat: ${a}: Is a directory`); return; }
      const content = res.node.content ?? '';
      if (content === '') x.show('  (empty file)', 'dim');
      else content.split('\n').forEach(l => x.out(l));
      x.flash(res.node.id, '#53c7f0', 'read', 60 + i * 180);
      x.packet(res.node.id, TTY, '#53c7f0', 'read', 100 + i * 180);
      x.preview(res.node.id, res.path, 160 + i * 180);
      x.log('fs', `cat ${displayPath(res.path)} (${humanSize(content.length)})`, '#53c7f0');
    });
  },

  echo: (x, args) => {
    const text = args.join(' ');
    if (text) x.out(text);
  },

  grep: (x, args) => {
    const nf = nonFlags(args);
    const pattern = nf[0];
    if (!pattern) { x.err('usage: grep <pattern> [file]'); return; }
    let source = '';
    let srcId: string | null = null;
    let srcPath = 'stdin';
    if (nf[1]) {
      const res = resolvePath(x.env, nf[1]);
      if (!res) { x.err(`grep: ${nf[1]}: No such file or directory`); return; }
      if (res.node.type === 'dir') { x.err(`grep: ${nf[1]}: Is a directory`); return; }
      source = res.node.content ?? '';
      srcId = res.node.id;
      srcPath = displayPath(res.path);
    } else source = x.stdin;
    if (!source) { x.show('  (no input to search)', 'dim'); return; }

    let test: (l: string) => boolean;
    try { const re = new RegExp(pattern, 'i'); test = (l) => re.test(l); }
    catch { test = (l) => l.toLowerCase().includes(pattern.toLowerCase()); }
    const matchRe = (() => { try { return new RegExp(`(${pattern})`, 'gi'); } catch { return null; } })();

    let count = 0;
    for (const line of source.split('\n')) {
      if (!test(line)) continue;
      count++;
      if (matchRe) {
        const segs: TermSeg[] = [];
        let last = 0;
        matchRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = matchRe.exec(line))) {
          if (m.index > last) segs.push({ t: line.slice(last, m.index) });
          segs.push({ t: m[0], c: 'rose', b: true });
          last = m.index + m[0].length;
          if (!m[0].length) matchRe.lastIndex++;
        }
        if (last < line.length) segs.push({ t: line.slice(last) });
        x.outSegs(segs);
      } else x.out(line);
    }
    x.show(`  ↳ ${count} matching line${count === 1 ? '' : 's'} in ${srcPath}`, count ? 'ok' : 'dim');
    if (srcId) {
      x.flash(srcId, '#f2708a', 'scan');
      if (count) x.packet(srcId, TTY, '#f2708a', `${count} hits`, 200);
    }
    x.log('fs', `grep /${pattern}/ → ${count} hits`, '#f2708a');
  },

  wc: (x, args, flags) => {
    let source = x.stdin;
    let label = '';
    const fileArg = args.find(a => !a.startsWith('-'));
    if (fileArg) {
      const res = resolvePath(x.env, fileArg);
      if (!res || res.node.type !== 'file') { x.err(`wc: ${fileArg}: No such file`); return; }
      source = res.node.content ?? '';
      label = ' ' + fileArg;
      x.flash(res.node.id, '#a991f7', 'count');
    }
    const lines = source ? source.split('\n').length : 0;
    const words = source ? source.split(/\s+/).filter(Boolean).length : 0;
    const bytes = source.length;
    if (flags.includes('c')) x.out(`${bytes}${label}`);
    else if (flags.includes('l')) x.out(`${lines}${label}`);
    else if (flags.includes('w')) x.out(`${words}${label}`);
    else x.out(`  ${lines}   ${words}  ${bytes}${label}`);
  },

  head: (x, args) => {
    const f = nonFlags(args)[0];
    const res = f ? resolvePath(x.env, f) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    source.split('\n').slice(0, 5).forEach(l => x.out(l));
    if (res) x.flash(res.node.id, '#53c7f0', 'head');
  },

  tail: (x, args) => {
    const f = nonFlags(args)[0];
    const res = f ? resolvePath(x.env, f) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    source.split('\n').slice(-5).forEach(l => x.out(l));
    if (res) x.flash(res.node.id, '#53c7f0', 'tail');
  },

  cp: (x, args, flags) => {
    const [src, dst] = nonFlags(args);
    if (!src || !dst) { x.err('usage: cp [-r] <src> <dst>'); return; }
    const s = resolvePath(x.env, src);
    if (!s) { x.err(`cp: cannot stat '${src}': No such file or directory`); return; }
    if (s.node.type === 'dir' && !flags.includes('r')) {
      x.err(`cp: -r not specified; omitting directory '${src}'`); return;
    }
    const d = resolvePath(x.env, dst);
    let targetDir: FsNode;
    let targetDirPath: string;
    let newName = s.node.name;
    if (d && d.node.type === 'dir') {
      targetDir = d.node;
      targetDirPath = d.path;
    } else {
      const abs = normalize(x.env.cwd, dst);
      if (!abs) { x.err(`cp: cannot create '${dst}': outside sandbox`); return; }
      const p = parentDir(x.env, abs);
      if (!p) { x.err(`cp: cannot create '${dst}': No such file or directory`); return; }
      targetDir = p;
      targetDirPath = abs.slice(0, abs.lastIndexOf('/')) || HOME;
      newName = abs.split('/').pop()!;
    }
    if (targetDir.children?.some(c => c.name === newName)) {
      x.err(`cp: '${dst}': destination exists`); return;
    }
    const copy = deepCloneNode(x.env, s.node, newName);
    targetDir.children!.push(copy);
    const destAbs = targetDirPath === '/' ? `/${newName}` : `${targetDirPath}/${newName}`;
    x.packet(s.node.id, copy.id, '#3fdc9b', 'copy', 150);
    x.flash(copy.id, '#3fdc9b', '+ copy', 420);
    if (copy.type === 'dir') {
      walkFiles(copy, destAbs, (_f, p) => x.markDirty(p));
    } else {
      x.markDirty(destAbs);
    }
    x.log('fs', `cp ${displayPath(s.path)} → ${newName}`, '#3fdc9b');
  },

  mv: (x, args) => {
    const [src, dst] = nonFlags(args);
    if (!src || !dst) { x.err('usage: mv <src> <dst>'); return; }
    const s = resolvePath(x.env, src);
    if (!s || !s.parent) { x.err(`mv: cannot stat '${src}': No such file or directory`); return; }
    const d = resolvePath(x.env, dst);
    const srcPath = s.path;
    if (d && d.node.type === 'dir') {
      if (d.node.children?.some(c => c.name === s.node.name)) { x.err(`mv: '${dst}/${s.node.name}' exists`); return; }
      s.parent.children = s.parent.children!.filter(c => c.id !== s.node.id);
      d.node.children!.push(s.node);
    } else {
      const abs = normalize(x.env.cwd, dst)!;
      const p = parentDir(x.env, abs);
      if (!p) { x.err(`mv: cannot move to '${dst}'`); return; }
      s.parent.children = s.parent.children!.filter(c => c.id !== s.node.id);
      s.node.name = abs.split('/').pop()!;
      p.children!.push(s.node);
    }
    x.packet(s.node.id, s.node.id, '#a991f7', 'move', 150); // flash trail handled by position tween
    x.flash(s.node.id, '#a991f7', 'moved', 380);
    x.untrack(srcPath);
    x.log('fs', `mv ${displayPath(srcPath)} → ${s.node.name}`, '#a991f7');
  },

  rm: (x, args, flags) => {
    const paths = nonFlags(args);
    if (!paths.length) { x.err('rm: missing operand'); return; }
    paths.forEach((a, i) => {
      const res = resolvePath(x.env, a);
      if (!res) { x.err(`rm: cannot remove '${a}': No such file or directory`); return; }
      if (res.path === HOME) { x.err('rm: refusing to destroy sandbox root ~'); return; }
      if (res.node.type === 'dir' && !flags.includes('r') && !flags.includes('f')) {
        x.err(`rm: cannot remove '${a}': Is a directory (use rm -rf)`); return;
      }
      x.packet(TTY, res.node.id, '#f2708a', 'rm', i * 80);
      x.flash(res.node.id, '#f2708a', '✕ rm', 140 + i * 130);
      removeAtPath(x.env, res.path);
      x.untrack(res.path);
      if (x.env.cwd.startsWith(res.path + '/') || x.env.cwd === res.path) x.env.cwd = HOME;
      x.log('fs', `rm ${res.node.type === 'dir' ? '-rf ' : ''}${displayPath(res.path)}`, '#f2708a');
    });
  },

  tree: (x) => {
    const walk = (n: FsNode, prefix: string, isLast: boolean, isRoot: boolean) => {
      const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
      x.outSegs([
        { t: prefix + connector, c: 'dim' },
        { t: n.name, c: n.type === 'dir' ? 'cyan' : 'fg', b: n.type === 'dir' },
        n.type === 'dir' ? { t: ` (${(n.children ?? []).length})`, c: 'dim' } : { t: '', c: 'dim' },
      ]);
      const kids = (n.children ?? []).filter(c => !c.phantom);
      kids.forEach((k, i) => walk(k, isRoot ? '' : prefix + (isLast ? '    ' : '│   '), i === kids.length - 1, false));
    };
    walk(x.env.fs, '', true, true);
    x.flash(x.env.fs.id, '#f5b454', 'walk');
    x.log('fs', 'tree — full walk of ~');
  },

  sleep: (x, args) => {
    const n = Math.max(0.5, parseFloat(args[0] ?? '1') || 1);
    x.proc(`sleep ${n}`, Math.min(n, 3) * 1000);
    x.show(`  … sleeping ${n}s (accelerated ×${Math.max(1, Math.round(n / Math.min(n, 3)))})`, 'dim');
    x.log('proc', `sleep ${n}s`, '#6ea1ff');
  },

  /* ---------------- git ---------------- */

  git: (x, args) => {
    const sub = args[0];
    const g = x.env.git;

    if (sub === 'init') {
      if (g.init) { x.err(`fatal: already a git repository at ${displayPath(g.root)}`); return; }
      x.env.git = { init: true, root: x.env.cwd, branch: 'main', staged: [], dirty: [], commits: [] };
      const cwdNode = resolvePath(x.env, '.');
      if (cwdNode) {
        walkFiles(cwdNode.node, x.env.cwd, (_f, p) => { if (!p.includes('/.git/')) x.env.git.dirty.push(p); });
        const dotgit = makeDir(x.env, '.git');
        cwdNode.node.children!.push(dotgit);
        x.flash(dotgit.id, '#f2708a', '+ .git', 250);
      }
      x.stage('git', { mode: 'init', root: displayPath(x.env.cwd), branch: 'main', files: [], commits: [] }, 4200);
      x.showSegs([{ t: 'Initialized empty Git repository in ', c: 'fg' }, { t: displayPath(x.env.cwd) + '/.git', c: 'rose' }]);
      x.log('git', `init @ ${displayPath(x.env.cwd)}`, '#f2708a');
      return;
    }

    if (!g.init) { x.err('fatal: not a git repository (run: git init)'); return; }

    if (sub === 'status') {
      x.outSegs([{ t: 'On branch ', c: 'fg' }, { t: g.branch, c: 'cyan', b: true }]);
      if (g.staged.length) {
        x.show('Changes to be committed:', 'green', true);
        g.staged.forEach(p => x.outSegs([{ t: '  new file:   ', c: 'green' }, { t: displayPath(p), c: 'fg' }]));
      }
      if (g.dirty.length) {
        x.show('Changes not staged for commit:', 'rose', true);
        g.dirty.forEach(p => x.outSegs([{ t: '  modified:   ', c: 'rose' }, { t: displayPath(p), c: 'fg' }]));
      }
      if (!g.staged.length && !g.dirty.length) x.show('nothing to commit, working tree clean', 'ok');
      return;
    }

    if (sub === 'add') {
      const target = nonFlags(args.slice(1))[0] ?? '.';
      const abs = normalize(x.env.cwd, target);
      const matched = g.dirty.filter(p =>
        target === '.' || p === abs || (abs !== null && p.startsWith(abs + '/')) || p.endsWith('/' + target));
      if (!matched.length) { x.err(`error: pathspec '${target}' did not match any modified/untracked files`); return; }
      g.dirty = g.dirty.filter(p => !matched.includes(p));
      g.staged.push(...matched);
      const cwdNode = resolvePath(x.env, '.');
      matched.forEach((p, i) => {
        x.log('git', `stage ${displayPath(p)}`, '#f2708a', i * 90);
        void p;
      });
      if (cwdNode) {
        // flash staged files in the tree
        const byPath = new Map<string, FsNode>();
        const collect = (n: FsNode, path: string) => {
          for (const c of n.children ?? []) {
            const cp = path + '/' + c.name;
            if (c.type === 'file') byPath.set(cp, c); else collect(c, cp);
          }
        };
        collect(x.env.fs, HOME);
        matched.forEach((p, i) => {
          const node = byPath.get(p);
          if (node) x.flash(node.id, '#f2708a', 'staged', 150 + i * 130);
        });
      }
      x.stage('git', {
        mode: 'add', branch: g.branch, commits: g.commits,
        files: g.staged.map(displayPath),
      }, 4800);
      x.showSegs([{ t: `staged ${matched.length} file${matched.length === 1 ? '' : 's'}`, c: 'rose' }, { t: ' → ready to commit', c: 'dim' }]);
      return;
    }

    if (sub === 'commit') {
      const mi = args.indexOf('-m');
      const msg = mi >= 0 ? args.slice(mi + 1).join(' ') : '';
      if (!g.staged.length) { x.err('nothing to commit (use git add first)'); return; }
      if (!msg) { x.err('error: commit message required (git commit -m "msg")'); return; }
      const commit: GitCommit = { hash: hash7(), msg, files: [...g.staged], at: Date.now() };
      g.commits.push(commit);
      g.dirty = g.dirty.filter(p => !commit.files.includes(p));
      g.staged = [];
      x.stage('git', {
        mode: 'commit', branch: g.branch, commits: g.commits,
        files: commit.files.map(displayPath), commit,
      }, 6000);
      x.outSegs([{ t: `[${g.branch} `, c: 'fg' }, { t: commit.hash, c: 'amber', b: true }, { t: `] `, c: 'fg' }, { t: msg, c: 'fg' }]);
      x.show(` ${commit.files.length} file${commit.files.length === 1 ? '' : 's'} changed`, 'dim');
      x.log('git', `commit ${commit.hash} — "${msg}"`, '#f5b454');
      return;
    }

    if (sub === 'log') {
      if (!g.commits.length) { x.err('fatal: your current branch has no commits yet'); return; }
      [...g.commits].reverse().forEach(c => {
        x.outSegs([
          { t: 'commit ', c: 'fg' }, { t: c.hash, c: 'amber', b: true },
          { t: ` (HEAD -> ${g.branch})`, c: 'cyan' },
        ]);
        x.out(`Author: ${x.env.user}@${x.env.host}`, 'dim');
        x.out(`Date:   ${new Date(c.at).toUTCString()}`, 'dim');
        x.out(`    ${c.msg}`, 'fg');
        x.out('', 'dim');
      });
      return;
    }

    if (sub === 'branch') {
      const bName = args.filter(a => !a.startsWith('-'))[1];
      if (bName) {
        g.branch = bName;
        x.show(`Switched to branch '${bName}'`, 'ok');
        x.log('git', `checkout -b ${bName}`);
      } else {
        x.outSegs([{ t: '* ', c: 'green' }, { t: g.branch, c: 'green', b: true }]);
        if (g.branch !== 'main') x.out('  main', 'dim');
      }
      return;
    }

    if (sub === 'diff') {
      if (!g.dirty.length && !g.staged.length) {
        x.show('No changes detected in working tree', 'dim');
        return;
      }
      const files = [...new Set([...g.dirty, ...g.staged])];
      files.forEach(f => {
        const rel = displayPath(f);
        x.outSegs([{ t: `diff --git a/${rel} b/${rel}`, c: 'dim' }]);
        x.outSegs([{ t: `--- a/${rel}`, c: 'dim' }]);
        x.outSegs([{ t: `+++ b/${rel}`, c: 'dim' }]);
        x.outSegs([{ t: '@@ -1,3 +1,4 @@', c: 'cyan' }]);
        x.outSegs([{ t: '+ // modified in working tree', c: 'green' }]);
      });
      return;
    }

    x.err(`git: '${sub}' is not a git command — try: init, add, commit, status, log, branch, diff`);
  },

  /* ---------------- npm ---------------- */

  npm: (x, args) => {
    const sub = args[0];

    if (sub === 'init') {
      const existing = resolvePath(x.env, 'package.json');
      if (existing) { x.err('npm ERR! package.json already exists'); return; }
      const cwdNode = resolvePath(x.env, '.');
      if (!cwdNode) return;
      const pj = makeFile(x.env, 'package.json', PACKAGE_JSON);
      cwdNode.node.children!.push(pj);
      x.flash(pj.id, '#a991f7', '+ package.json', 200);
      x.show('Wrote to package.json', 'ok');
      x.log('npm', 'npm init — package.json created', '#a991f7');
      return;
    }

    const pj = resolvePath(x.env, 'package.json');

    if (sub === 'run') {
      if (!pj) { x.err('npm ERR! no package.json in ' + displayPath(x.env.cwd)); return; }
      const scripts: Record<string, string> = (() => {
        try { return JSON.parse(pj.node.content ?? '{}').scripts ?? {}; } catch { return {}; }
      })();
      const script = args[1];
      if (!script || !scripts[script]) {
        x.show('Scripts available via `npm run`:', 'fg', true);
        Object.entries(scripts).forEach(([k, v]) =>
          x.outSegs([{ t: '  ' + k.padEnd(10), c: 'violet', b: true }, { t: v, c: 'dim' }]));
        if (script) x.err(`npm ERR! missing script: "${script}"`);
        return;
      }
      x.flash(pj.node.id, '#a991f7', `run ${script}`);
      x.proc(`npm run ${script}`, 2600);
      x.log('proc', `npm run ${script} → ${scripts[script]}`, '#6ea1ff');
      x.outSegs([{ t: `> project@1.0.0 ${script}`, c: 'dim' }]);
      x.outSegs([{ t: `> ${scripts[script]}`, c: 'dim' }]);
      x.out('', 'dim');
      if (script === 'build') {
        x.show('✓ 47 modules transformed.', 'ok');
        x.outSegs([{ t: 'dist/index.html   ', c: 'fg' }, { t: ' 0.46 kB │ gzip:  0.30 kB', c: 'dim' }]);
        x.outSegs([{ t: 'dist/index.js     ', c: 'fg' }, { t: '143.22 kB │ gzip: 46.10 kB', c: 'dim' }]);
        x.show('✓ built in 1.24s', 'ok', true);
      } else if (script === 'test') {
        x.show(' ✓ src/utils.test.js (3 tests) 42ms', 'ok');
        x.show(' Test Files  1 passed (1)', 'fg');
        x.show('      Tests  3 passed (3)', 'fg');
      } else {
        x.show('▸ compiling modules… done (342 ms)', 'dim');
        x.show('✓ ready — server listening on http://localhost:3000', 'ok', true);
        x.outSegs([{ t: '  GET /            ', c: 'dim' }, { t: '200', c: 'green' }, { t: '  14 ms', c: 'dim' }]);
        x.outSegs([{ t: '  GET /api/status  ', c: 'dim' }, { t: '200', c: 'green' }, { t: '   8 ms', c: 'dim' }]);
      }
      return;
    }

    if (sub === 'install' || sub === 'i') {
      if (!pj) { x.err('npm ERR! no package.json found in ' + displayPath(x.env.cwd) + ' — try: npm init -y'); return; }
      let names = args.slice(1).filter(a => !a.startsWith('-'));
      if (!names.length) {
        try {
          const deps = JSON.parse(pj.node.content ?? '{}').dependencies ?? {};
          names = Object.keys(deps);
        } catch { names = ['react']; }
      }
      const versions = ['4.1.2', '2.8.0', '1.14.3', '3.0.1', '0.9.7', '5.2.1', '18.3.1', '11.3.8'];
      const pkgs: Pkg[] = names.map((n, i) => ({
        name: n, version: versions[(n.length + i) % versions.length],
        size: `${rand(18, 420)}.${rand(0, 9)} kB`,
      }));

      // materialize node_modules
      const cwdNode = resolvePath(x.env, '.');
      if (cwdNode) {
        let nm = cwdNode.node.children!.find(c => c.name === 'node_modules');
        if (!nm) {
          nm = makeDir(x.env, 'node_modules');
          cwdNode.node.children!.push(nm);
          x.flash(nm.id, '#a991f7', '+ node_modules', 1400);
        }
        pkgs.forEach(p => {
          if (nm!.children!.some(c => c.name === p.name)) return;
          const pkgDir = makeDir(x.env, p.name);
          pkgDir.children!.push(makeFile(x.env, 'package.json', `{"name":"${p.name}","version":"${p.version}"}`));
          if (pkgs.length <= 4) pkgDir.children!.push(makeFile(x.env, 'index.js', `module.exports = require('./dist/${p.name}.cjs');`));
          nm!.children!.push(pkgDir);
        });
      }

      x.env.packages = [...x.env.packages.filter(p => !names.includes(p.name)), ...pkgs];
      const added = rand(38, 174);
      const secs = (rand(14, 38) / 10).toFixed(1);

      x.proc('npm install', 2600);
      x.stage('npm', { pkgs, added, total: `${(added * rand(2, 9) / 100).toFixed(1)} MB`, secs }, 5600);
      x.flash(pj.node.id, '#a991f7', 'resolve', 150);
      x.show(`Resolving dependency tree for ${names.join(', ')}…`, 'dim');
      pkgs.forEach(p => x.outSegs([
        { t: '  + ', c: 'green' }, { t: p.name, c: 'violet', b: true }, { t: `@${p.version}`, c: 'dim' }, { t: `  (${p.size})`, c: 'dim' },
      ]));
      x.show('', 'dim');
      x.show(`added ${added} packages, and audited ${added + 1} packages in ${secs}s`, 'ok');
      x.show('found 0 vulnerabilities', 'ok');
      x.log('npm', `install ${names.join(' ')} → ${added} pkgs`, '#a991f7');
      return;
    }

    if (sub === 'ls') {
      if (!x.env.packages.length) { x.show('(no packages installed — try: npm install)', 'dim'); return; }
      x.outSegs([{ t: 'project@1.0.0', c: 'violet', b: true }, { t: ` ${displayPath(x.env.cwd)}`, c: 'dim' }]);
      x.env.packages.forEach(p => x.outSegs([
        { t: '└── ', c: 'dim' }, { t: p.name, c: 'fg' }, { t: `@${p.version}`, c: 'dim' },
      ]));
      return;
    }

    x.err(`npm: '${sub}' is not an npm command — try: init -y, install, run, ls`);
  },

  /* ---------------- network ---------------- */

  curl: (x, args) => {
    let outFile: string | null = null;
    let url: string | null = null;
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) { outFile = args[++i]; continue; }
      if (args[i].startsWith('-')) continue;
      url = args[i];
    }
    if (!url) { x.err('curl: no URL specified — try: curl https://api.sandbox.dev/data.json'); return; }
    const { host, path } = parseUrl(url);
    const ip = `104.${rand(10, 90)}.${rand(2, 250)}.${rand(2, 250)}`;
    const timings = { dns: rand(6, 22), tcp: rand(14, 42), tls: rand(28, 64), ttfb: rand(70, 180), total: 0 };
    timings.total = timings.dns + timings.tcp + timings.tls + timings.ttfb;
    const body = fakeBody(path, host);
    const size = humanSize(body.length);

    x.proc('curl', timings.total + 500);
    x.stage('network', {
      host, path, method: 'GET', status: 200, statusText: 'OK',
      mime: mimeOf(path), size, timings, ip,
      ...(outFile ? { outFile } : {}),
    }, 6400);
    x.show(`* Connected to ${host} (${ip}) port 443`, 'dim');
    x.show(`> GET ${path} HTTP/2`, 'cyan');
    x.show(`< HTTP/2 200 · ${mimeOf(path)}`, 'dim');
    x.showSegs([
      { t: '200 OK', c: 'green', b: true },
      { t: ` · ${size} · ${timings.total} ms (dns ${timings.dns} · tcp ${timings.tcp} · tls ${timings.tls} · ttfb ${timings.ttfb})`, c: 'dim' },
    ]);
    x.log('net', `GET ${host}${path} → 200`, '#53c7f0');

    if (outFile) {
      const abs = normalize(x.env.cwd, outFile);
      const parent = abs ? parentDir(x.env, abs) : null;
      if (!abs || !parent) { x.err(`curl: cannot write to '${outFile}'`); return; }
      const existing = resolvePath(x.env, outFile);
      if (existing && existing.node.type === 'dir') { x.err(`curl: '${outFile}' is a directory`); return; }
      let node = existing?.node;
      if (!node) {
        node = makeFile(x.env, abs.split('/').pop()!, body);
        parent.children!.push(node);
      } else node.content = body;
      x.packet(TTY, node.id, '#3fdc9b', `save ${size}`, 1100);
      x.flash(node.id, '#3fdc9b', 'saved', 1500);
      x.show(`↳ saved → ${outFile}`, 'ok');
      x.markDirty(abs);
      x.log('fs', `write ${outFile} (${size})`, '#3fdc9b', 1200);
    }
  },

  wget: (x, args) => {
    const url = args.find(a => !a.startsWith('-'));
    if (!url) { x.err('wget: missing URL'); return; }
    const { path } = parseUrl(url);
    const out = decodeURIComponent(path.split('/').pop() || 'index.html');
    HANDLERS.curl(x, ['-o', out, url], '');
  },

  ping: (x, args) => {
    const host = args.find(a => !a.startsWith('-'));
    if (!host) { x.err('ping: missing host — try: ping sandbox.dev'); return; }
    const ip = `104.${rand(10, 90)}.${rand(2, 250)}.${rand(2, 250)}`;
    x.showSegs([{ t: `PING ${host} (${ip}): 56 data bytes`, c: 'dim' }]);
    const times: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = rand(90, 340) / 10;
      times.push(t);
      x.out(`64 bytes from ${ip}: icmp_seq=${i} ttl=57 time=${t.toFixed(1)} ms`);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    x.show(`--- ${host} ping statistics ---`, 'dim');
    x.show(`4 packets transmitted, 4 received, 0.0% packet loss`, 'fg');
    x.show(`rtt min/avg/max = ${Math.min(...times).toFixed(1)}/${avg.toFixed(1)}/${Math.max(...times).toFixed(1)} ms`, 'dim');
    x.proc(`ping ${host}`, 2400);
    x.stage('network', {
      host, path: '/icmp', method: 'PING', status: 0, statusText: 'echo',
      mime: 'icmp', size: '64 B', ip, mode: 'ping',
      timings: { dns: rand(4, 12), tcp: 0, tls: 0, ttfb: Math.round(avg), total: Math.round(avg * 4) },
    }, 5400);
    x.log('net', `ping ${host} — avg ${avg.toFixed(1)} ms`, '#53c7f0');
  },

  ssh: (x, args) => {
    const target = nonFlags(args)[0];
    if (!target) { x.err('usage: ssh [user@]hostname'); return; }
    const host = target.includes('@') ? target.split('@')[1] : target;
    const user = target.includes('@') ? target.split('@')[0] : x.env.user;
    const ip = `192.0.2.${rand(10, 250)}`;
    x.showSegs([{ t: `OpenSSH_9.6p1, OpenSSL 3.1.4`, c: 'dim' }]);
    x.show(`Connecting to ${host} (${ip}) port 22…`, 'cyan');
    x.show(`Authenticated to ${host} ([${ip}]:22) using "publickey".`, 'ok');
    x.outSegs([{ t: `Welcome to ${host} (GNU/Linux simulated sandbox)`, c: 'green', b: true }]);
    x.out(`System load: 0.12 · Memory usage: 28% · Swap: 0%`, 'dim');
    x.out(`Connection to ${host} closed by remote host.`, 'dim');
    x.stage('network', {
      host, path: 'ssh:22', method: 'SSH-2.0', status: 0, statusText: 'Connected',
      mime: 'ssh', size: '2.4 kB', ip, mode: 'ssh',
      timings: { dns: rand(4, 15), tcp: rand(18, 40), tls: rand(30, 60), ttfb: 80, total: 180 },
    }, 5200);
    x.proc(`ssh ${target}`, 2200);
    x.log('net', `ssh ${user}@${host} (connected)`, '#53c7f0');
  },

  traceroute: (x, args) => {
    const host = nonFlags(args)[0];
    if (!host) { x.err('usage: traceroute <host>'); return; }
    const ip = `104.${rand(10, 90)}.${rand(2, 250)}.${rand(2, 250)}`;
    x.show(`traceroute to ${host} (${ip}), 30 hops max, 60 byte packets`, 'dim');
    const hops = [
      { hop: 1, host: 'gateway.local', ip: '192.168.1.1', time: '1.24 ms' },
      { hop: 2, host: 'isp-edge.net', ip: '10.240.0.1', time: '8.45 ms' },
      { hop: 3, host: 'backbone-core.net', ip: '72.14.214.1', time: '14.82 ms' },
      { hop: 4, host: `edge.${host}`, ip, time: '22.18 ms' },
    ];
    hops.forEach(h => {
      x.out(` ${h.hop}  ${h.host} (${h.ip})  ${h.time}  ${(parseFloat(h.time) + 0.3).toFixed(2)} ms`);
    });
    x.stage('network', {
      host, path: 'icmp/trace', method: 'TRACE', status: 0, statusText: 'Complete',
      mime: 'traceroute', size: '60 B', ip, mode: 'traceroute', hops,
      timings: { dns: 6, tcp: 0, tls: 0, ttfb: 22, total: 45 },
    }, 5400);
    x.proc(`traceroute ${host}`, 2400);
    x.log('net', `traceroute ${host} (4 hops)`, '#53c7f0');
  },

  dig: (x, args) => {
    const host = nonFlags(args)[0];
    if (!host) { x.err('usage: dig <domain>'); return; }
    const ip = `104.${rand(10, 90)}.${rand(2, 250)}.${rand(2, 250)}`;
    x.out(`; <<>> DiG 9.18.28 <<>> ${host}`);
    x.out(`;; Got answer: HEADER: status: NOERROR, id: ${rand(1000, 9999)}`, 'dim');
    x.show(';; QUESTION SECTION:', 'dim');
    x.out(`;${host.padEnd(28)} IN      A`);
    x.show(';; ANSWER SECTION:', 'green');
    x.outSegs([{ t: host.padEnd(24), c: 'fg' }, { t: '300 IN  A  ', c: 'dim' }, { t: ip, c: 'cyan', b: true }]);
    x.outSegs([{ t: host.padEnd(24), c: 'fg' }, { t: '300 IN  NS ', c: 'dim' }, { t: `ns1.${host}.`, c: 'dim' }]);
    x.out(`;; Query time: ${rand(8, 28)} msec · SERVER: 1.1.1.1#53`, 'dim');
    x.stage('network', {
      host, path: 'dns:53', method: 'QUERY', status: 200, statusText: 'NOERROR',
      mime: 'dns', size: '128 B', ip, mode: 'dig',
      timings: { dns: 14, tcp: 0, tls: 0, ttfb: 14, total: 14 },
    }, 4800);
    x.log('net', `dig ${host} → ${ip}`, '#53c7f0');
  },

  chmod: (x, args) => {
    const nf = nonFlags(args);
    if (nf.length < 2) { x.err('usage: chmod <mode> <file>'); return; }
    const [mode, target] = nf;
    const res = resolvePath(x.env, target);
    if (!res) { x.err(`chmod: cannot access '${target}': No such file or directory`); return; }
    res.node.mode = mode;
    if (mode.includes('+x') || mode.startsWith('7')) res.node.exec = true;
    else if (mode.includes('-x')) res.node.exec = false;
    x.flash(res.node.id, '#3fdc9b', `chmod ${mode}`);
    x.showSegs([{ t: `mode of '${displayPath(res.path)}' changed to `, c: 'dim' }, { t: mode, c: 'green', b: true }]);
    x.log('fs', `chmod ${mode} ${displayPath(res.path)}`, '#3fdc9b');
  },

  chown: (x, args) => {
    const nf = nonFlags(args);
    if (nf.length < 2) { x.err('usage: chown <owner> <file>'); return; }
    const [owner, target] = nf;
    const res = resolvePath(x.env, target);
    if (!res) { x.err(`chown: cannot access '${target}': No such file or directory`); return; }
    x.flash(res.node.id, '#3fdc9b', `chown ${owner}`);
    x.showSegs([{ t: `ownership of '${displayPath(res.path)}' changed to `, c: 'dim' }, { t: owner, c: 'green', b: true }]);
    x.log('fs', `chown ${owner} ${displayPath(res.path)}`, '#3fdc9b');
  },

  ln: (x, args, flags) => {
    const isSym = flags.includes('s') || args.includes('-s');
    const nf = args.filter(a => !a.startsWith('-'));
    if (nf.length < 2) { x.err('usage: ln -s <target> <link_name>'); return; }
    const [target, link] = nf;
    const abs = normalize(x.env.cwd, link);
    if (!abs) { x.err(`ln: cannot create link '${link}': outside sandbox`); return; }
    const p = parentDir(x.env, abs);
    if (!p) { x.err(`ln: cannot create link '${link}': No such file or directory`); return; }
    const name = abs.split('/').pop()!;
    const linkNode: FsNode = { id: newId(x.env), name, type: 'file', content: `-> ${target}`, symlink: target };
    p.children!.push(linkNode);
    x.flash(linkNode.id, '#53c7f0', isSym ? 'symlink' : 'link');
    x.showSegs([{ t: `${name} -> `, c: 'cyan' }, { t: target, c: 'dim' }]);
    x.log('fs', `ln -s ${target} → ${name}`, '#53c7f0');
  },

  stat: (x, args) => {
    const target = nonFlags(args)[0] ?? '.';
    const res = resolvePath(x.env, target);
    if (!res) { x.err(`stat: cannot stat '${target}': No such file or directory`); return; }
    const isDir = res.node.type === 'dir';
    const sz = isDir ? 4096 : (res.node.content ?? '').length;
    const blk = Math.max(1, Math.ceil(sz / 512));
    const mode = res.node.mode ?? (isDir ? '755' : res.node.exec ? '755' : '644');
    const perms = isDir ? 'drwxr-xr-x' : res.node.exec ? '-rwxr-xr-x' : '-rw-r--r--';
    const dt = new Date(res.node.mtime ?? Date.now()).toISOString().replace('T', ' ').slice(0, 19);
    x.outSegs([{ t: '  File: ', c: 'dim' }, { t: res.node.name, c: 'amber', b: true }]);
    x.out(`  Size: ${sz.toString().padEnd(12)} Blocks: ${blk.toString().padEnd(10)} IO Block: 4096   ${isDir ? 'directory' : 'regular file'}`);
    x.out(`Device: 801h/2049d    Inode: ${Math.abs(parseInt(res.node.id.replace(/\D/g, '') || '1') * 4321 + 1024)}   Links: 1`);
    x.out(`Access: (0${mode}/${perms})  Uid: ( 1000/    dev)   Gid: ( 1000/    dev)`);
    x.out(`Access: ${dt} +0000`, 'dim');
    x.out(`Modify: ${dt} +0000`, 'dim');
    x.out(`Change: ${dt} +0000`, 'dim');
    x.flash(res.node.id, '#53c7f0', 'stat');
  },

  find: (x, args) => {
    const nf = nonFlags(args);
    const startDir = nf[0] && !nf[0].startsWith('-') ? nf[0] : '.';
    const res = resolvePath(x.env, startDir);
    if (!res) { x.err(`find: '${startDir}': No such file or directory`); return; }
    const nameIdx = args.indexOf('-name');
    const namePat = nameIdx >= 0 ? args[nameIdx + 1] : null;
    const typeIdx = args.indexOf('-type');
    const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : null;
    const matchedIds: string[] = [];

    const walk = (node: FsNode, p: string) => {
      let match = true;
      if (namePat) {
        const glob = namePat.replace(/[*?]/g, '.*');
        match = new RegExp(`^${glob}$`, 'i').test(node.name);
      }
      if (typeFilter) {
        if (typeFilter === 'f' && node.type !== 'file') match = false;
        if (typeFilter === 'd' && node.type !== 'dir') match = false;
      }
      if (match) {
        x.out(displayPath(p), node.type === 'dir' ? 'cyan' : 'fg');
        matchedIds.push(node.id);
      }
      if (node.type === 'dir' && node.children) {
        for (const c of node.children) {
          if (!c.phantom) walk(c, p + '/' + c.name);
        }
      }
    };
    walk(res.node, res.path);
    if (matchedIds.length) {
      x.highlight(matchedIds, '#53c7f0', 3000);
      x.show(`  ↳ ${matchedIds.length} match${matchedIds.length === 1 ? '' : 'es'} highlighted on canvas`, 'ok');
    }
  },

  diff: (x, args) => {
    const nf = nonFlags(args);
    if (nf.length < 2) { x.err('usage: diff <file1> <file2>'); return; }
    const r1 = resolvePath(x.env, nf[0]);
    const r2 = resolvePath(x.env, nf[1]);
    if (!r1) { x.err(`diff: ${nf[0]}: No such file or directory`); return; }
    if (!r2) { x.err(`diff: ${nf[1]}: No such file or directory`); return; }
    const lines1 = (r1.node.content ?? '').split('\n');
    const lines2 = (r2.node.content ?? '').split('\n');
    let hasDiff = false;
    x.outSegs([{ t: `--- ${nf[0]}`, c: 'dim' }]);
    x.outSegs([{ t: `+++ ${nf[1]}`, c: 'dim' }]);
    const max = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < max; i++) {
      const l1 = lines1[i];
      const l2 = lines2[i];
      if (l1 !== l2) {
        hasDiff = true;
        if (l1 !== undefined) x.outSegs([{ t: `- ${l1}`, c: 'rose' }]);
        if (l2 !== undefined) x.outSegs([{ t: `+ ${l2}`, c: 'green' }]);
      }
    }
    if (!hasDiff) x.show('Files are identical', 'ok');
    else {
      x.flash(r1.node.id, '#f2708a', 'diff');
      x.flash(r2.node.id, '#3fdc9b', 'diff');
    }
  },

  sort: (x, args, flags) => {
    const f = nonFlags(args)[0];
    const res = f ? resolvePath(x.env, f) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    if (!source) return;
    let lines = source.trim().split('\n').filter(Boolean);
    const rev = flags.includes('r');
    const num = flags.includes('n');
    lines.sort((a, b) => {
      if (num) return (parseFloat(a) || 0) - (parseFloat(b) || 0);
      return a.localeCompare(b);
    });
    if (rev) lines.reverse();
    lines.forEach(l => x.out(l));
    if (res) x.flash(res.node.id, '#a991f7', 'sort');
  },

  uniq: (x, args, flags) => {
    const f = nonFlags(args)[0];
    const res = f ? resolvePath(x.env, f) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    if (!source) return;
    const count = flags.includes('c');
    const lines = source.split('\n');
    let prev: string | null = null;
    let freq = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l === prev) {
        freq++;
      } else {
        if (prev !== null) {
          x.out(count ? `${String(freq).padStart(4)} ${prev}` : prev);
        }
        prev = l;
        freq = 1;
      }
    }
    if (prev !== null) {
      x.out(count ? `${String(freq).padStart(4)} ${prev}` : prev);
    }
  },

  cut: (x, args) => {
    let delim = '\t';
    let field = 1;
    const dIdx = args.findIndex(a => a.startsWith('-d'));
    if (dIdx >= 0) {
      delim = args[dIdx].length > 2 ? args[dIdx].slice(2) : args[dIdx + 1] ?? '\t';
    }
    const fIdx = args.findIndex(a => a.startsWith('-f'));
    if (fIdx >= 0) {
      const v = args[fIdx].length > 2 ? args[fIdx].slice(2) : args[fIdx + 1] ?? '1';
      field = parseInt(v) || 1;
    }
    const f = nonFlags(args).find(a => !a.startsWith('-'));
    const res = f ? resolvePath(x.env, f) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    source.split('\n').forEach(l => {
      const parts = l.split(delim);
      x.out(parts[field - 1] ?? '');
    });
  },

  tr: (x, args, flags) => {
    const del = flags.includes('d');
    const nf = nonFlags(args);
    if (!x.stdin) return;
    if (del) {
      const chars = nf[0] ?? '';
      let res = x.stdin;
      for (const ch of chars) res = res.split(ch).join('');
      res.split('\n').forEach(l => x.out(l));
    } else {
      const [from, to] = nf;
      if (from === 'a-z' && to === 'A-Z') {
        x.stdin.toUpperCase().split('\n').forEach(l => x.out(l));
      } else if (from === 'A-Z' && to === 'a-z') {
        x.stdin.toLowerCase().split('\n').forEach(l => x.out(l));
      } else {
        x.stdin.split('\n').forEach(l => x.out(l));
      }
    }
  },

  tee: (x, args, flags) => {
    const append = flags.includes('a') || args.includes('-a');
    const f = nonFlags(args)[0];
    if (x.stdin) {
      x.stdin.split('\n').forEach(l => x.out(l));
      if (f) {
        const abs = normalize(x.env.cwd, f);
        if (abs) {
          const p = parentDir(x.env, abs);
          if (p) {
            const existing = resolvePath(x.env, f);
            if (!existing) {
              const n = makeFile(x.env, abs.split('/').pop()!, x.stdin);
              p.children!.push(n);
              x.flash(n.id, '#3fdc9b', '+ tee');
              x.packet(TTY, n.id, '#3fdc9b', 'tee', 150);
            } else {
              existing.node.content = append ? (existing.node.content ?? '') + '\n' + x.stdin : x.stdin;
              x.flash(existing.node.id, '#3fdc9b', 'tee');
              x.packet(TTY, existing.node.id, '#3fdc9b', 'tee', 150);
            }
            x.markDirty(abs);
            x.log('fs', `tee → ${f}`, '#3fdc9b');
          }
        }
      }
    }
  },

  sed: (x, args) => {
    const pattern = nonFlags(args)[0] ?? '';
    const file = nonFlags(args)[1];
    const res = file ? resolvePath(x.env, file) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    const match = pattern.match(/^s\/(.+?)\/(.*?)\/([gimsuy]*)$/);
    if (match) {
      const [, p, r, flg] = match;
      try {
        const regex = new RegExp(p, flg);
        source.split('\n').forEach(l => x.out(l.replace(regex, r)));
      } catch {
        source.split('\n').forEach(l => x.out(l.split(p).join(r)));
      }
    } else {
      source.split('\n').forEach(l => x.out(l));
    }
  },

  awk: (x, args) => {
    const script = nonFlags(args)[0] ?? '';
    const file = nonFlags(args)[1];
    const res = file ? resolvePath(x.env, file) : null;
    const source = res ? (res.node.content ?? '') : x.stdin;
    const printMatch = script.match(/print\s+(\$[0-9]+(?:\s*,\s*\$[0-9]+)*)/);
    source.split('\n').forEach(line => {
      const fields = line.trim().split(/\s+/);
      if (printMatch) {
        const req = printMatch[1].split(',').map(s => parseInt(s.trim().slice(1)) - 1);
        x.out(req.map(i => fields[i] ?? '').join(' '));
      } else {
        x.out(line);
      }
    });
  },

  xargs: (x, args) => {
    const cmd = nonFlags(args)[0] ?? 'echo';
    if (!x.stdin) return;
    const items = x.stdin.trim().split(/\s+/).filter(Boolean);
    if (HANDLERS[cmd]) {
      HANDLERS[cmd](x, items, '');
    } else {
      x.out(items.join(' '));
    }
  },

  du: (x, args, flags) => {
    const target = nonFlags(args)[0] ?? '.';
    const res = resolvePath(x.env, target);
    if (!res) { x.err(`du: cannot access '${target}': No such file or directory`); return; }
    const human = flags.includes('h');
    const nodesToHighlight: string[] = [];

    const walk = (node: FsNode, p: string): number => {
      nodesToHighlight.push(node.id);
      let sz = node.type === 'file' ? (node.content ?? '').length : 0;
      if (node.children) {
        for (const c of node.children) {
          if (!c.phantom) sz += walk(c, p + '/' + c.name);
        }
      }
      x.out(`${(human ? humanSize(sz) : String(Math.max(4, Math.ceil(sz / 1024)))).padStart(8)}  ${displayPath(p)}`);
      return sz;
    };
    walk(res.node, res.path);
    x.highlight(nodesToHighlight, '#f5b454', 2800);
    x.log('fs', `du ${displayPath(res.path)}`, '#f5b454');
  },

  which: (x, args) => {
    const cmd = nonFlags(args)[0];
    if (!cmd) { x.err('usage: which <command>'); return; }
    if (x.env.aliases[cmd]) {
      x.out(`${cmd}: aliased to ${x.env.aliases[cmd]}`);
      return;
    }
    if (HANDLERS[cmd]) {
      x.out(`/usr/bin/${cmd}`);
    } else {
      x.err(`${cmd} not found`);
    }
  },

  export: (x, args) => {
    const arg = nonFlags(args)[0];
    if (!arg || !arg.includes('=')) {
      Object.entries(x.env.vars).forEach(([k, v]) => x.out(`declare -x ${k}="${v}"`));
      return;
    }
    const [k, ...rest] = arg.split('=');
    const v = rest.join('=').replace(/^["']|["']$/g, '');
    x.env.vars[k] = v;
    x.showSegs([{ t: `exported `, c: 'dim' }, { t: k, c: 'cyan', b: true }, { t: `="${v}"`, c: 'dim' }]);
    x.log('sys', `export ${k}=${v}`);
  },

  alias: (x, args) => {
    const arg = nonFlags(args)[0];
    if (!arg) {
      Object.entries(x.env.aliases).forEach(([k, v]) => x.out(`alias ${k}='${v}'`));
      return;
    }
    if (arg.includes('=')) {
      const [k, ...rest] = arg.split('=');
      const v = rest.join('=').replace(/^["']|["']$/g, '');
      x.env.aliases[k] = v;
      x.show(`alias ${k}='${v}'`, 'ok');
      x.log('sys', `alias ${k}='${v}'`);
    } else {
      if (x.env.aliases[arg]) x.out(`alias ${arg}='${x.env.aliases[arg]}'`);
      else x.err(`alias: ${arg}: not found`);
    }
  },

  unalias: (x, args) => {
    const name = nonFlags(args)[0];
    if (!name || !x.env.aliases[name]) { x.err(`unalias: ${name ?? ''}: not found`); return; }
    delete x.env.aliases[name];
    x.show(`unaliased ${name}`, 'ok');
  },

  type: (x, args) => {
    const name = nonFlags(args)[0];
    if (!name) return;
    if (x.env.aliases[name]) {
      x.out(`${name} is an alias for ${x.env.aliases[name]}`);
    } else if (['cd', 'pwd', 'echo', 'exit', 'help', 'history', 'export', 'alias', 'type'].includes(name)) {
      x.out(`${name} is a shell builtin`);
    } else if (HANDLERS[name]) {
      x.out(`${name} is /usr/bin/${name}`);
    } else {
      x.err(`type: ${name}: not found`);
    }
  },

  df: (x, _a, flags) => {
    const human = flags.includes('h');
    x.outSegs([
      { t: 'Filesystem     ', c: 'dim' },
      { t: human ? 'Size  Used Avail Use% ' : '1K-blocks    Used Available Use% ', c: 'dim' },
      { t: 'Mounted on', c: 'dim' },
    ]);
    x.outSegs([
      { t: 'overlay        ', c: 'fg' },
      { t: human ? ' 20G  3.2G   16G  17% ' : ' 20971520 3355443  16578077  17% ', c: 'dim' },
      { t: '/', c: 'cyan' },
    ]);
    x.outSegs([
      { t: 'tmpfs          ', c: 'fg' },
      { t: human ? ' 512M   28M  484M   6% ' : '   524288   28672    495616   6% ', c: 'dim' },
      { t: '/home/user', c: 'amber' },
    ]);
  },

  id: (x) => {
    x.out(`uid=1000(${x.env.user}) gid=1000(${x.env.user}) groups=1000(${x.env.user}),4(adm),24(cdrom),27(sudo)`);
  },

  /* ---------------- program execution ---------------- */

  node: (x, args) => runProgram(x, nonFlags(args)[0], 'node'),
  python: (x, args) => runProgram(x, nonFlags(args)[0], 'python'),
  python3: (x, args) => runProgram(x, nonFlags(args)[0], 'python3'),
  deno: (x, args) => runProgram(x, nonFlags(args)[0], 'deno'),
  bun: (x, args) => runProgram(x, nonFlags(args)[0], 'bun'),
  sh: (x, args) => runProgram(x, nonFlags(args)[0], 'sh'),
  bash: (x, args) => runProgram(x, nonFlags(args)[0], 'bash'),

  help: (x) => {
    const groups: Record<string, { name: string; desc: string }[]> = {};
    for (const c of COMMANDS) (groups[c.group] ??= []).push(c);
    const titles: Record<string, string> = {
      basics: 'SANDBOX', files: 'FILESYSTEM', git: 'GIT', npm: 'NPM', net: 'NETWORK', proc: 'PROCESSES',
    };
    for (const [g, cmds] of Object.entries(groups)) {
      x.show(`  ${titles[g] ?? g}`, 'amber', true);
      cmds.forEach(c => x.outSegs([
        { t: '    ' + c.name.padEnd(14), c: 'fg', b: true },
        { t: c.desc, c: 'dim' },
      ]));
    }
    x.show('', 'dim');
    x.showSegs([
      { t: '  pipes ', c: 'dim' }, { t: 'a | b', c: 'cyan' },
      { t: '  · redirects ', c: 'dim' }, { t: 'cmd > file', c: 'amber' },
      { t: '  · chains ', c: 'dim' }, { t: 'a && b', c: 'green' },
      { t: '  · try ', c: 'dim' }, { t: 'demo', c: 'violet', b: true },
    ]);
  },

  brew: (x, args) => {
    const res = handleBrewCommand(args, x.env);
    x.lines.push(...res.lines);
    x.events.push(...res.events);
  },

  omz: (x, args) => {
    const res = handleOmzCommand(args, x.env);
    x.lines.push(...res.lines);
    x.events.push(...res.events);
  },

  storage: (x, args) => {
    const sub = args[0] ?? 'status';
    if (sub === 'status' || sub === 'info') {
      const avail = isStorageAvailable();
      const meta = getStorageMetadata();
      const bytes = meta?.bytes ?? 0;
      x.show('==> Persistent Storage Status:', 'info', true);
      x.outSegs([
        { t: '  Backend:   ', c: 'dim' },
        { t: avail ? 'localStorage (Active & Persistent)' : 'In-Memory (Session Only)', c: avail ? 'ok' : 'amber', b: true },
      ]);
      x.outSegs([
        { t: '  Footprint: ', c: 'dim' },
        { t: humanSize(bytes), c: 'ok' },
      ]);
      if (meta?.lastSaved) {
        x.outSegs([
          { t: '  Synced:    ', c: 'dim' },
          { t: new Date(meta.lastSaved).toLocaleTimeString(), c: 'fg' },
        ]);
      }
      x.show('  Commands:  storage export | storage import | storage clear', 'dim');
    } else if (sub === 'export' || sub === 'backup') {
      const snapshot = exportStorageSnapshot(x.env);
      triggerDownload('slate-sandbox-backup.json', snapshot);
      x.show('✔ Exported sandbox snapshot (slate-sandbox-backup.json)', 'ok', true);
      x.log('sys', 'storage: snapshot exported to file');
    } else if (sub === 'clear' || sub === 'reset') {
      clearPersistentStorage();
      x.show('✔ Persistent storage cleared. Changes will reset on reload.', 'amber');
      x.log('sys', 'storage: cleared persistent cache');
    } else if (sub === 'import') {
      const payload = args.slice(1).join(' ');
      if (!payload) {
        x.err('usage: storage import <json-string>');
        return;
      }
      try {
        const imported = importStorageSnapshot(payload);
        x.env.fs = imported.fs;
        x.env.cwd = imported.cwd;
        x.env.git = imported.git;
        x.env.packages = imported.packages;
        x.env.history = imported.history;
        x.env.vars = imported.vars;
        x.env.aliases = imported.aliases;
        if (imported.promptTheme) x.env.promptTheme = imported.promptTheme;
        if (imported.installedBrew) x.env.installedBrew = imported.installedBrew;
        x.show('✔ Successfully imported virtual environment snapshot!', 'ok', true);
        x.log('sys', 'storage: snapshot imported successfully');
      } catch (err) {
        x.err(`Failed to import storage snapshot: ${(err as Error).message}`);
      }
    } else {
      x.err(`Unknown storage command: ${sub}. Use: status, export, import, clear`);
    }
  },

  import: (x, args) => {
    const target = args[0];
    if (!target) {
      x.err('usage: import <file-path-or-name> [content]');
      return;
    }
    const content = args.slice(1).join(' ') || '// External package module\nexport default {};';
    const abs = normalize(x.env.cwd, target);
    if (!abs) { x.err(`Invalid import destination: ${target}`); return; }
    const parent = parentDir(x.env, abs);
    if (!parent) { x.err(`Cannot find directory for: ${target}`); return; }
    const fileName = abs.split('/').pop()!;
    parent.children = parent.children ?? [];
    parent.children.push(makeFile(x.env, fileName, content));
    x.flash(parent.id, '#83b394', '+ imported');
    x.packet(TTY, parent.id, '#83b394', 'import', 300);
    x.show(`✔ Successfully imported external file: ${displayPath(abs)}`, 'ok', true);
    x.log('fs', `imported external file: ${displayPath(abs)}`, '#83b394');
  },
};

function runProgram(x: Exec, fileArg: string | undefined, runtime: string) {
  if (!fileArg) { x.err(`${runtime}: no entry file given`); return; }
  const target = fileArg.startsWith('./') ? fileArg.slice(2) : fileArg;
  const res = resolvePath(x.env, target);
  if (!res) { x.err(`${runtime}: cannot find module '${fileArg}'`); return; }
  if (res.node.type === 'dir') { x.err(`${runtime}: '${fileArg}' is a directory`); return; }
  const dur = rand(1800, 2800);
  x.proc(`${runtime} ${res.node.name}`, dur);
  x.flash(res.node.id, '#a991f7', 'exec');
  x.packet(res.node.id, TTY, '#a991f7', 'stdout', 600);
  x.log('proc', `${runtime} ${displayPath(res.path)} — pid ${rand(200, 999)}`, '#6ea1ff');

  const n = res.node.name.toLowerCase();
  if (n.includes('server') || n.includes('index')) {
    x.show(`▸ ${runtime}: loading ${displayPath(res.path)} (${humanSize(nodeSize(res.node))})`, 'dim');
    x.show('▸ bundling 12 modules… done (287 ms)', 'dim');
    x.show('✓ server listening on http://localhost:3000', 'ok', true);
    x.outSegs([{ t: '  GET /           ', c: 'dim' }, { t: '200', c: 'green' }, { t: '  14 ms', c: 'dim' }]);
    x.outSegs([{ t: '  GET /api/health ', c: 'dim' }, { t: '200', c: 'green' }, { t: '   6 ms', c: 'dim' }]);
  } else if (n.includes('test')) {
    x.show(' ✓ ' + res.node.name + ' (2 tests) 18ms', 'ok');
  } else if (n.includes('util')) {
    x.show('▸ evaluating module exports…', 'dim');
    x.show('  exports: clamp, uid', 'fg');
    x.show('✓ module ok (0 errors)', 'ok');
  } else {
    x.show(`▸ ${runtime}: executing ${displayPath(res.path)}`, 'dim');
    x.show('▸ heap 12.4 MB · gc 2ms', 'dim');
    x.show(`✓ process exited cleanly in ${dur} ms (simulated)`, 'ok');
  }
}

/* ------------------------------------------------------------------ */
/* Redirect writer                                                     */
/* ------------------------------------------------------------------ */

function writeRedirect(x: Exec, target: string, append: boolean) {
  const env = x.env;
  const abs = normalize(env.cwd, target);
  const parent = abs ? parentDir(env, abs) : null;
  if (!abs || !parent) { x.err(`zsh: no such file or directory: ${target}`); return; }
  const existing = resolvePath(env, target);
  if (existing && existing.node.type === 'dir') { x.err(`zsh: is a directory: ${target}`); return; }
  const text = x.stdout;
  let node = existing?.node;
  if (!node) {
    node = makeFile(env, abs.split('/').pop()!, append ? text + '\n' : text + (text ? '\n' : ''));
    parent.children!.push(node);
    x.flash(node.id, '#3fdc9b', '+ file', 220);
  } else {
    node.content = append ? (node.content ?? '') + text + '\n' : text + (text ? '\n' : '');
  }
  x.packet(TTY, node.id, '#f5b454', append ? 'append >>' : 'write >', 280);
  x.flash(node.id, '#f5b454', append ? '>>' : 'write', 560);
  x.markDirty(abs);
  x.lines = x.lines.filter(l => !(l.segs.length === 1 && text.split('\n').includes(l.segs[0].t)));
  x.show(`↳ wrote ${humanSize(text.length)} → ${displayPath(abs)}`, 'ok');
  x.log('fs', `${append ? 'append' : 'write'} ${displayPath(abs)} (${humanSize(text.length)})`, '#f5b454', 400);
}

/* ------------------------------------------------------------------ */
/* Unknown-command heuristic simulation                                */
/* ------------------------------------------------------------------ */

function simulateUnknown(x: Exec, cmd: string, args: string[]) {
  x.err(`zsh: command not found: ${cmd}`);
  x.show(`↳ sandbox heuristic: no real binary for '${cmd}' — simulating plausible behavior`, 'info');
  x.proc(`${cmd} (sim)`, 2000);
  x.flash(x.env.fs.id, '#6ea1ff', cmd, 150);
  x.show(`▸ ${cmd} ${args.slice(0, 3).join(' ')}: synthesized ${rand(2, 9)} ops against the virtual fs`, 'dim');
  x.show(`▸ exit 0 (simulated in ${rand(40, 220)} ms)`, 'dim');
  x.log('proc', `simulated unknown binary '${cmd}'`, '#6ea1ff');
}

/* ------------------------------------------------------------------ */
/* Top-level executor                                                  */
/* ------------------------------------------------------------------ */

const MUTATING_WORDS = [
  'cd', 'mkdir', 'touch', 'cp', 'mv', 'rm', 'chmod', 'chown', 'ln',
  'npm', 'curl', 'wget', 'export', 'alias', 'unalias', 'reset', 'clear',
  'brew', 'omz', 'storage', 'import',
];

function isMutating(cmdLine: string): boolean {
  if (cmdLine.includes('>') || cmdLine.includes('git')) return true;
  const words = cmdLine.split(/[\s;|&]+/);
  return words.some(w => MUTATING_WORDS.includes(w));
}

export function executeCommand(line: string, prevEnv: EnvState): ExecResult {
  const env = isMutating(line) ? structuredClone(prevEnv) : { ...prevEnv, history: [...prevEnv.history] };
  const allEvents: VizEvent[] = [];
  const finalLines: TermLine[] = [];
  let clear = false;

  if (!line.trim()) return { env, lines: [], events: [] };
  env.history.push(line);

  const commands = splitTop(line, ['&&', ';']);
  let blocked = false;

  for (const { text, sep } of commands) {
    if (blocked) break;
    const stagesRaw = splitTop(text, ['|']).map(s => s.text);
    let stdin = '';
    let last: Exec | null = null;
    let lastRedirected = false;
    let lastTarget = '';
    const stageInfos: PipelineStageInfo[] = [];

    const isPipe = stagesRaw.length > 1;
    const prePipeCwd = env.cwd;

    for (const raw of stagesRaw) {
      const { tokens, target, append } = extractRedirect(tokenize(raw));
      if (!tokens.length) continue;
      const stageEnv = isPipe ? { ...env, cwd: prePipeCwd } : env;
      const x = new Exec(stageEnv, stdin);

      let cmd = tokens[0];
      let rawArgs = tokens.slice(1);
      if (env.aliases[cmd]) {
        const aliasTokens = tokenize(env.aliases[cmd]);
        cmd = aliasTokens[0];
        rawArgs = [...aliasTokens.slice(1), ...rawArgs];
      }
      const flags = flagsOf(rawArgs);

      if (cmd === 'clear' || cmd === 'reset') {
        clear = true;
        if (cmd === 'reset') {
          const fresh = initialEnv();
          env.fs = fresh.fs; env.cwd = HOME; env.git = fresh.git;
          env.packages = []; env.seq = fresh.seq;
          env.promptTheme = 'default';
          env.installedBrew = {};
          x.log('sys', 'sandbox reset — virtual fs remounted at root directory ~');
          x.show('✔ Sandbox reset to initial state at root directory ~', 'ok');
        } else x.log('sys', 'screen cleared');
      } else if (cmd === 'demo') {
        x.events.push({ kind: 'script', delay: 0 });
        x.show('▶ running guided demo — press Esc to interrupt', 'info', true);
        x.log('sys', 'demo script started');
      } else if (cmd === 'exit') {
        x.show('logout (the sandbox never really lets you leave)', 'dim');
      } else if (HANDLERS[cmd]) {
        try { HANDLERS[cmd](x, rawArgs, flags); }
        catch (e) { x.err(`${cmd}: internal sandbox error — ${(e as Error).message}`); }
      } else if (cmd.startsWith('./')) {
        runProgram(x, cmd.slice(2), 'sh');
      } else if (cmd === 'man') {
        const c = COMMANDS.find(cc => cc.name === rawArgs[0]);
        if (c) x.outSegs([{ t: c.name.padEnd(14), c: 'amber', b: true }, { t: c.desc, c: 'fg' }]);
        else x.err(`No manual entry for ${rawArgs[0] ?? ''}`);
      } else if (FORMULA_REGISTRY[cmd] || cmd === 'rg') {
        const formulaKey = cmd === 'rg' ? 'ripgrep' : cmd;
        const formula = FORMULA_REGISTRY[formulaKey];
        const isInstalled = !!env.installedBrew?.[formulaKey] || formulaKey === 'jq' || formulaKey === 'neofetch';
        if (isInstalled) {
          try {
            const res = formula.execute(rawArgs, flags, stdin, env);
            x.lines.push(...res.lines);
            x.absorbStdout(res.stdout);
            x.proc(cmd, 1200);
            x.log('proc', `${cmd} executed`);
          } catch (e) {
            x.err(`${cmd}: runtime error: ${(e as Error).message}`);
          }
        } else {
          x.err(`zsh: command not found: ${cmd}`);
          x.showSegs([
            { t: '  Formula available in Homebrew! Install with: ', c: 'dim' },
            { t: `brew install ${formulaKey}`, c: 'ok', b: true },
          ]);
        }
      } else {
        simulateUnknown(x, cmd, tokens.slice(1));
      }

      if (target) writeRedirect(x, target, append);

      allEvents.push(...x.events);
      stageInfos.push({ name: cmd, arg: tokens.slice(1).join(' ').slice(0, 26) });
      stdin = x.stdout;
      last = x;
      lastRedirected = !!target;
      lastTarget = target ?? '';
    }

    if (isPipe) {
      env.cwd = prePipeCwd;
    }

    if (!last) continue;

    if (stageInfos.length >= 2) {
      last.stage('pipeline', {
        stages: stageInfos,
        output: (lastRedirected ? [`→ ${lastTarget}`] : last.stdout.split('\n').filter(Boolean)).slice(0, 4),
      }, 5600);
      stageInfos.forEach((s, i) => last!.proc(s.name, 1100 + i * 300, i * 240));
      last.log('sys', `pipeline: ${stageInfos.map(s => s.name).join(' │ ')}`, '#53c7f0');
      allEvents.push(...last.events);
      finalLines.push(...(lastRedirected ? [] : last.lines));
      finalLines.push({ segs: [{ t: `  ↳ ${stageInfos.length}-stage pipeline · data flowed left → right`, c: 'info' }] });
    } else {
      finalLines.push(...last.lines);
    }

    if (!last.ok && sep === '&&') blocked = true;
  }

  return { env, lines: finalLines, events: allEvents, clear };
}
