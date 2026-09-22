/* ================================================================== */
/*  Shellscope — the "real terminal" command set                      */
/*  Every command a real macOS terminal has, mapped onto the virtual  */
/*  sandbox. Each one drives the live previews (flash/packet/proc/    */
/*  stage/log) just like the core commands do.                        */
/* ================================================================== */

import type { Handler } from './interpreter';
import { rand, TTY } from './interpreter';
import { HOME, displayPath, resolvePath, ensureDir, makeFile, nodeSize } from './fs';
import type { FsNode } from './types';
import { sha1Hex } from './hash';

const nf = (args: string[]) => args.filter(a => !a.startsWith('-'));

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

function firstFile(x: { env: any; err: (m: string) => void }, args: string[], stdin: string) {
  const t = nf(args)[0];
  if (!t || t === '-') {
    if (stdin) return { content: stdin, path: '<stdin>' };
    x.err(`${t ?? ''}: no input (pipe data or give a file)`);
    return null;
  }
  const r = resolvePath(x.env, t);
  if (!r || r.node.type !== 'file') { x.err(`${t}: No such file or directory`); return null; }
  return { content: r.node.content ?? '', path: r.node.name };
}

/* deterministic fake IP per host */
function fakeIp(host: string): string {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return `93.${(h >> 16) % 250 + 2}.${(h >> 8) % 250 + 2}.${(h % 250) + 2}`;
}

/* CRC-32 (standard, poly 0xEDB88320) */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(s: string): number {
  let c = 0xffffffff;
  for (let i = 0; i < s.length; i++) c = CRC_TABLE[(c ^ s.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Shell builtins                                                      */
/* ------------------------------------------------------------------ */

const unset: Handler = (x, args) => {
  const names = nf(args);
  if (!names.length) { x.err('unset: usage: unset name [name ...]'); return; }
  let did = false;
  for (const n of names) {
    if (x.env.vars[n] !== undefined) { delete x.env.vars[n]; did = true; }
    else if (x.env.aliases[n] !== undefined) { delete x.env.aliases[n]; did = true; }
  }
  if (!did) x.err(`unset: ${names.join(' ')}: not found`);
  else x.log('sys', `unset ${names.join(' ')}`);
};

const printenv: Handler = (x, args) => {
  const name = nf(args)[0];
  if (name) {
    const v = x.env.vars[name];
    if (v === undefined) { x.err(`printenv: ${name}: No such variable`); return; }
    x.out(v);
  } else {
    Object.entries(x.env.vars).sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => x.out(`${k}=${v}`));
  }
};

const setenv: Handler = (x, args) => {
  const [k, v] = args;
  if (!k || v === undefined) { x.err('setenv: usage: setenv name value'); return; }
  x.env.vars[k] = v;
  x.show(`export ${k}=${v}`, 'dim');
};

const commandV: Handler = (x, args) => {
  if (args[0] !== '-v' && args[0] !== '-V' && args[0] !== 'which') {
    x.err(`command: unknown command '${args[0] ?? ''}'`);
    return;
  }
  const name = args[1];
  const known = new Set([
    'ls', 'cat', 'cd', 'echo', 'pwd', 'grep', 'find', 'sed', 'awk', 'sort', 'uniq', 'head', 'tail',
    'wc', 'cut', 'tr', 'xargs', 'tee', 'mkdir', 'touch', 'cp', 'mv', 'rm', 'ln', 'chmod', 'chown',
    'stat', 'du', 'df', 'diff', 'file', 'shasum', 'sha1sum', 'cksum', 'base64', 'xxd', 'od',
    'curl', 'wget', 'ping', 'ssh', 'scp', 'rsync', 'dig', 'nslookup', 'host', 'nc', 'netstat', 'ifconfig',
    'traceroute', 'git', 'npm', 'yarn', 'pnpm', 'pip', 'pip3', 'node', 'python', 'python3', 'deno', 'bun',
    'brew', 'port', 'open', 'say', 'screencapture', 'mdfind', 'mdls', 'osascript', 'diskutil', 'launchctl',
    'system_profiler', 'sw_vers', 'sysctl', 'caffeinate', 'top', 'ps', 'kill', 'jobs', 'lsof', 'who', 'w',
    'groups', 'id', 'hostname', 'uname', 'uptime', 'date', 'cal', 'man', 'which', 'whereis', 'readlink',
    'basename', 'dirname', 'realpath', 'less', 'more', 'nl', 'rev', 'seq', 'shuf', 'column', 'fmt', 'patch',
    'pbcopy', 'pbpaste', 'export', 'unset', 'printenv', 'setenv', 'alias', 'source', 'history', 'type',
    'tree', 'sleep', 'clear', 'help', 'demo', 'reset', 'storage', 'import', 'omz', 'sh', 'bash',
  ]);
  if (name && known.has(name)) {
    const bin = name === 'git' ? '/opt/homebrew/bin/git' : name.startsWith('npm') || name === 'node' ? '/usr/local/bin/' + name : '/usr/bin/' + name;
    x.out(bin);
  } else {
    x.err(`command: ${name ?? ''}: not found`);
  }
};

const whereis: Handler = (x, args) => {
  const names = nf(args);
  if (!names.length) { x.err('whereis: usage: whereis name [name ...]'); return; }
  x.outSegs([
    { t: names[0], c: 'fg' },
    { t: `: ${names.map(() => `/usr/bin/${names[0]}`).join(' ')}`, c: 'dim' },
  ]);
};

const pushd: Handler = (x, args) => {
  const target = nf(args)[0];
  const stack = x.env.pushdStack ?? (x.env.pushdStack = []);
  const prev = x.env.cwd;
  if (target) {
    const r = resolvePath(x.env, target);
    if (!r || r.node.type !== 'dir') { x.err(`pushd: ${target}: no such file or directory`); return; }
    stack.unshift(prev);
    x.env.cwd = r.path;
  } else {
    if (stack.length < 2) { x.err('pushd: directory stack is empty'); return; }
    const top = stack.shift()!;
    stack.push(prev);
    x.env.cwd = top;
  }
  x.out(dirsLine(x.env));
  x.flash(x.env.fs.id, '#6ea1ff', 'pushd', 150);
};

function dirsLine(env: any): string {
  const stack = env.pushdStack ?? [];
  const parts = [env.cwd, ...stack].map(displayPath);
  return parts.map((p, i) => (i === 0 ? p : p)).join(' ');
}

const popd: Handler = (x, args) => {
  void args;
  const stack = x.env.pushdStack ?? (x.env.pushdStack = []);
  const top = stack.shift();
  if (!top) { x.err('popd: directory stack is empty'); return; }
  x.env.cwd = top;
  x.out(dirsLine(x.env));
  x.flash(x.env.fs.id, '#6ea1ff', 'popd', 150);
};

const dirs: Handler = (x) => {
  const stack = x.env.pushdStack ?? [];
  const parts = [x.env.cwd, ...stack];
  x.out(parts.map((p, i) => `${i}\t${displayPath(p)}`).join('\n') || '');
};

const jobs: Handler = (x) => {
  x.show('(no jobs in this sandbox — everything runs to completion)', 'dim');
};

const kill: Handler = (x, args) => {
  const sig = args[0]?.startsWith('-') ? args[0].slice(1) : '15';
  const pids = args.filter(a => !a.startsWith('-'));
  if (!pids.length) { x.err('kill: usage: kill [-signal] pid [pid ...]'); return; }
  for (const p of pids) {
    if (String(p) === String(x.env.pid)) { x.err(`kill: (${p}) - Operation not permitted (this is the shell itself)`); return; }
    x.show(`signal ${sig} → pid ${p} (simulated)`, 'dim');
    x.proc(`kill ${p}`, 400);
  }
  x.log('proc', `kill -${sig} ${pids.join(' ')}`, '#6ea1ff');
};

/* ------------------------------------------------------------------ */
/* System / macOS                                                      */
/* ------------------------------------------------------------------ */

const FAKE_PROCS = [
  { pid: 1, user: 'root', cpu: '0.0', mem: '0.1', cmd: '/sbin/launchd' },
  { pid: 342, user: 'dev', cpu: '0.4', mem: '1.2', cmd: '/System/Library/CoreServices/WindowServer' },
  { pid: 812, user: 'dev', cpu: '1.1', mem: '2.4', cmd: 'node /usr/local/bin/npm' },
  { pid: 813, user: 'dev', cpu: '0.2', mem: '0.8', cmd: 'zsh' },
  { pid: 4242, user: 'dev', cpu: '3.2', mem: '6.1', cmd: 'ShellScope (terminal)' },
];

const top: Handler = (x) => {
  x.show(`top - ${new Date().toTimeString().slice(0, 8)}  up 0:42, 1 user, load avg: 1.42, 1.28, 1.18`, 'dim');
  x.out('  PID   %CPU  %MEM   COMMAND');
  FAKE_PROCS.forEach(p => x.out(`${String(p.pid).padStart(6)}  ${p.cpu.padStart(4)}  ${p.mem.padStart(4)}   ${p.cmd}`));
  x.show('(press q — the frame is already frozen)', 'dim');
  x.log('proc', 'top snapshot', '#6ea1ff');
};

const lsof: Handler = (x, args) => {
  const net = args.includes('-i') || args.includes('-n');
  x.out('COMMAND   PID  USER   FD   TYPE  NODE');
  x.out('node      812  dev    3u   TCP   127.0.0.1:5173 (vite)');
  x.out('node      812  dev    4u   TCP   127.0.0.1:5173->127.0.0.1:53210');
  x.out('zsh       813  dev    1u   CHR   /dev/ttys000');
  const cwd = resolvePath(x.env, '.');
  if (cwd) x.out(`zsh       813  dev   cwd   DIR   ${displayPath(x.env.cwd)}`);
  if (net) x.log('net', 'lsof: 3 open sockets', '#53c7f0');
};

const netstat: Handler = (x) => {
  x.out('Active Internet connections');
  x.out('Proto  Recv-Q  Send-Q  Local Address          Foreign Address        (state)');
  x.out('tcp4   0       0       127.0.0.1.5173         *.*)                   LISTEN');
  x.out('tcp4   0       0       192.168.1.24.53210     93.184.216.34.443      ESTABLISHED');
  x.out('tcp4   0       0       127.0.0.1.53           *.*                    LISTEN');
  x.log('net', 'netstat: 3 connections', '#53c7f0');
};

const ifconfig: Handler = (x, args) => {
  const iface = nf(args)[0] ?? 'en0';
  if (iface === 'lo0') {
    x.out('lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384');
    x.out('    inet6 ::1 prefixlen 128');
    x.out('    inet 127.0.0.1 netmask 0xff000000');
    return;
  }
  x.out(`en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500`);
  x.out('    ether 3a:7f:1c:9d:42:0b');
  x.out('    inet 192.168.1.24 netmask 0xffffff00 broadcast 192.168.1.255');
  x.out('    media: autoselect (802.11 802.11a)');
};

const SYSCTL_VALS: Record<string, string> = {
  'kern.osproductversion': '15.3',
  'kern.osrelease': 'Darwin Kernel Version 24.3.0',
  'kern.hostname': 'sandbox.local',
  'hw.ncpu': '8',
  'hw.memsize': '17179869184',
  'hw.model': 'Mac15,3',
  'machdep.cpu.brand_string': 'Apple M3',
};

const sysctl: Handler = (x, args) => {
  const names = nf(args).filter(a => a !== '-n');
  const show = (k: string) => x.out(`${k}: ${SYSCTL_VALS[k] ?? '0'}`);
  if (!names.length) {
    Object.entries(SYSCTL_VALS).forEach(([k]) => show(k));
  } else names.forEach(show);
};

const sw_vers: Handler = (x) => {
  x.out('ProductName:            Mac OS X');
  x.out('ProductVersion:         15.3');
  x.out('BuildVersion:           24D60');
};

const who: Handler = (x) => {
  const t = new Date().toTimeString().slice(0, 5);
  x.out(`dev    ttys000    ${t}    still logged in`);
  x.out(`dev    console    ${t}    still logged in`);
};

const groups: Handler = (x) => {
  x.out('20 staff 80 admin 980 com.apple.access_ftp');
};

const pbcopy: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  x.env.clipboard = f.content;
  x.show(`clipboard ← ${f.content.split('\n').length} line(s) from ${f.path}`, 'ok');
  x.log('sys', 'pbcopy: clipboard updated', '#a991f7');
};

const pbpaste: Handler = (x) => {
  const c = x.env.clipboard;
  if (c === undefined || c === '') { x.err('pbpaste: clipboard is empty (use pbcopy first)'); return; }
  x.out(c);
};

const openCmd: Handler = (x, args) => {
  const t = nf(args)[0];
  if (!t) { x.err('open: usage: open <path | url>'); return; }
  if (/^https?:\/\//.test(t)) {
    x.show(`opening ${t} in Safari (simulated)`, 'info');
    x.packet(TTY, x.env.fs.id, '#53c7f0', 'open url', 100);
    x.log('net', `open → ${t.split('/')[2] ?? t}`, '#53c7f0');
    return;
  }
  const r = resolvePath(x.env, t);
  if (!r) { x.err(`open: ${t}: no such file or directory`); return; }
  if (r.node.type === 'file') {
    x.preview(r.node.id, r.path);
    x.show(`opened ${displayPath(r.path)} in the inspector`, 'ok');
    x.flash(r.node.id, '#a991f7', 'open', 120);
  } else {
    x.flash(r.node.id, '#a991f7', 'Finder', 120);
    x.show(`opened ${displayPath(r.path)} in Finder (simulated)`, 'ok');
  }
};

const screencapture: Handler = (x, args) => {
  const t = nf(args)[0] ?? `screen-capture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  const abs = resolvePath(x.env, '.');
  const png = makeFile(x.env, t.split('/').pop()!, 'PNG ' + b64encode('fake-mac-screenshot-' + t));
  (abs?.node.children ?? []).push(png);
  x.flash(png.id, '#a991f7', '+ ' + png.name, 150);
  x.out(displayPath(x.env.cwd) + '/' + png.name);
  x.show(`captured 3456×2234 display → ${png.name}`, 'dim');
  x.log('fs', `screencapture ${png.name}`, '#a991f7');
};

const say: Handler = (x, args) => {
  const text = args.filter(a => !a.startsWith('-')).join(' ');
  if (!text) { x.err('say: usage: say [options] <text>'); return; }
  x.showSegs([
    { t: '🔊 ', c: 'fg' },
    { t: `saying “${text}”`, c: 'cyan', b: true },
    { t: '  (voice: Samantha, 1.0×)', c: 'dim' },
  ]);
  x.proc('say', Math.min(4000, 600 + text.length * 55));
  x.log('sys', `say: “${text.slice(0, 40)}”`, '#a991f7');
};

const mdfind: Handler = (x, args) => {
  const q = args.filter(a => !a.startsWith('-')).join('').toLowerCase().trim();
  if (!q) { x.err('mdfind: usage: mdfind <query>'); return; }
  const hits: { id: string; path: string }[] = [];
  const walk = (n: FsNode, prefix: string) => {
    if (n.name === '.git' || n.name === 'node_modules') return;
    for (const c of n.children ?? []) {
      const p = prefix + '/' + c.name;
      if (c.name.toLowerCase().includes(q)) hits.push({ id: c.id, path: p });
      if (c.type === 'dir') walk(c, p);
    }
  };
  walk(x.env.fs, HOME);
  hits.forEach(h => x.out(displayPath(h.path)));
  x.show(`${hits.length} result(s) for “${q}” in Spotlight index`, 'dim');
  x.highlight(hits.slice(0, 12).map(h => h.id), '#a991f7', 2600);
  x.log('sys', `mdfind “${q}” → ${hits.length} hit(s)`, '#a991f7');
};

const mdls: Handler = (x, args) => {
  const t = nf(args)[0];
  const r = t ? resolvePath(x.env, t) : null;
  if (!r) { x.err(`mdls: ${t ?? ''}: no such file`); return; }
  const n = r.node;
  const size = n.type === 'file' ? (n.content ?? '').length : nodeSize(n);
  const ext = n.name.includes('.') ? n.name.split('.').pop()!.toUpperCase() : 'FOLDER';
  x.out(n.name + ':');
  x.out('    kMDItemFSContentChangeDate   = ' + new Date(n.mtime ?? Date.now()).toISOString());
  x.out(`    kMDItemFSSize                = ${size}`);
  x.out(`    kMDItemContentType           = "public.${ext === 'JS' ? 'javascript' : ext.toLowerCase()}"`);
  x.out('    kMDItemWhereFroms            = (empty)');
};

const osascript: Handler = (x, args) => {
  const script = args.filter(a => a !== '-e').join(' ');
  const m = script.match(/display dialog\s+["']([^"']+)["']/i);
  if (m) {
    x.showSegs([
      { t: '┌──────────────────────────────┐', c: 'dim' },
    ]);
    x.showSegs([{ t: `│  ${m[1].padEnd(26)}│`, c: 'fg' }]);
    x.showSegs([{ t: '│   [OK]                        │', c: 'dim' }]);
    x.showSegs([{ t: '└──────────────────────────────┘', c: 'dim' }]);
    x.log('sys', `osascript: dialog “${m[1]}” → OK`, '#a991f7');
  } else {
    x.out('Execution completed successfully');
    x.log('sys', 'osascript: script ok', '#a991f7');
  }
};

const diskutil: Handler = (x, args) => {
  if (args[0] !== 'list' && args[0] !== 'info') x.out('Disk / dev/disk0');
  x.out('APFS Container: disk0s0 (250.6 GB)');
  x.out('  ├─ disk0s1  Macintosh HD   214.9 GB   128.4 GB free');
  x.out('  └─ disk0s2  Recovery         515 MB');
  x.log('sys', 'diskutil: 1 physical volume', '#6ea1ff');
};

const launchctl: Handler = (x) => {
  x.out('PID\tStatus\tLabel');
  x.out('0\t0\tcom.apple.systemstatus');
  x.out('342\t0\tcom.apple.windowserver');
  x.out('812\t0\tdev.shellscope.daemon');
  x.log('sys', 'launchctl: 3 agents', '#6ea1ff');
};

const caffeinate: Handler = (x, args) => {
  const ti = args.indexOf('-t');
  const secs = ti >= 0 ? parseInt(args[ti + 1], 10) : 30;
  x.show(`☕ keeping the display awake for ${secs}s (simulated)`, 'dim');
  x.proc('caffeinate', Math.min(3000, secs * 100));
  x.log('sys', `caffeinate -t ${secs}`, '#c4a46b');
};

const system_profiler: Handler = (x) => {
  x.out('Hardware Overview:');
  x.out('      Model Name: MacBook Pro');
  x.out('      Model Identifier: Mac15,3');
  x.out('      Chip: Apple M3');
  x.out('      Total Number of Cores: 8');
  x.out('      Memory: 16 GB');
  x.out('      Serial Number: SBX00000000');
};

/* ------------------------------------------------------------------ */
/* File utilities                                                      */
/* ------------------------------------------------------------------ */

const basename: Handler = (x, args) => {
  const t = nf(args)[0];
  if (!t) { x.err('basename: missing operand'); return; }
  const parts = t.split('/');
  let name = parts[parts.length - 1];
  const suffix = args[1];
  if (suffix && name.endsWith(suffix)) name = name.slice(0, -suffix.length);
  x.out(name);
};

const dirname: Handler = (x, args) => {
  const t = nf(args)[0] ?? '.';
  const parts = t.split('/');
  parts.pop();
  x.out(parts.length ? parts.join('/') : '/');
};

const realpath: Handler = (x, args) => {
  const t = nf(args)[0] ?? '.';
  const r = resolvePath(x.env, t);
  if (!r) { x.err(`realpath: ${t}: No such file or directory`); return; }
  x.out(r.path);
};

const readlink: Handler = (x, args) => {
  const t = nf(args)[0];
  const r = t ? resolvePath(x.env, t) : null;
  if (!r) { x.err(`readlink: ${t}: No such file`); return; }
  if (r.node.symlink) x.out(r.node.symlink);
  else x.err(`readlink: ${t}: ${r.node.type === 'dir' ? 'is a directory' : 'not a symbolic link'}`);
};

const less: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  const lines = f.content.split('\n');
  lines.slice(0, 40).forEach(l => x.out(l));
  if (lines.length > 40) x.show(`... ${lines.length - 40} more line(s) — (END)`, 'dim');
  else x.show('(END)', 'dim');
};

const more: Handler = less;

const MIME: Record<string, string> = {
  js: 'JavaScript source, ASCII text',
  ts: 'TypeScript source, ASCII text',
  json: 'JSON data',
  md: 'Unicode text, UTF-8 (with CRLF)',
  txt: 'ASCII text',
  sh: 'Bourne-Again shell script, ASCII text executable',
  html: 'HTML document text',
  css: 'CSS source, ASCII text',
  png: 'PNG image data, 3456 x 2234',
  jpg: 'JPEG image data',
  pdf: 'PDF document, version 1.7',
};
const fileCmd: Handler = (x, args) => {
  const t = nf(args)[0];
  const r = t ? resolvePath(x.env, t) : null;
  if (!r) { x.err(`file: ${t ?? ''}: No such file or directory`); return; }
  const n = r.node;
  if (n.type === 'dir') { x.out(`${t}: directory`); return; }
  const ext = n.name.includes('.') ? n.name.split('.').pop()! : 'txt';
  const bytes = (n.content ?? '').length;
  x.out(`${t}: ${MIME[ext] ?? 'ASCII text'}${n.exec ? ', executable' : ''} (${bytes} bytes)`);
};

const shasum: Handler = (x, args, flags) => {
  const a256 = flags.includes('256') || args.includes('-a256') || args.includes('-a 256');
  if (a256) { x.err('shasum: -a 256 not implemented in the sandbox (use -a 1)'); return; }
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  x.outSegs([
    { t: sha1Hex(f.content), c: 'amber' },
    { t: '  ' + f.path, c: 'fg' },
  ]);
  x.log('fs', `shasum ${f.path}`, '#c4a46b');
};
const sha1sum: Handler = shasum;

const cksum: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  x.out(`${crc32(f.content).toString(10)}  ${f.content.length}  ${f.path}`);
};

const nl: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  f.content.split('\n').forEach((l, i) => x.out(`${String(i + 1).padStart(6)}\t${l}`));
};

const rev: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  f.content.split('\n').forEach(l => x.out(l.split('').reverse().join('')));
};

const seq: Handler = (x, args) => {
  const nums = nf(args).map(Number).filter(n => !Number.isNaN(n));
  let a = 1, b = 1;
  if (nums.length === 1) b = nums[0];
  if (nums.length >= 2) { a = nums[0]; b = nums[1]; }
  if (b < 1 || b > 100000) { x.err(`seq: invalid range ${a}..${b}`); return; }
  for (let i = a; i <= b; i++) x.out(String(i));
};

const shuf: Handler = (x, args) => {
  const n = parseInt(nf(args)[0] ?? '10', 10);
  const pool = Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.slice(0, n).forEach(v => x.out(String(v)));
};

const base64: Handler = (x, args) => {
  const decode = args.includes('-d') || args.includes('--decode');
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  try {
    if (decode) x.out(b64decode(f.content.trim()));
    else x.out(b64encode(f.content));
  } catch {
    x.err(`base64: ${decode ? 'input is not valid base64' : 'encoding failed'}`);
  }
};

const xxd: Handler = (x, args) => {
  const plain = args.includes('-p') || args.includes('--plain');
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  const bytes = new TextEncoder().encode(f.content);
  if (plain) {
    let line = '';
    for (let i = 0; i < bytes.length; i++) {
      line += bytes[i].toString(16).padStart(2, '0');
      if ((i + 1) % 16 === 0 || i === bytes.length - 1) { x.out(line); line = ''; }
    }
  } else {
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = bytes.slice(off, off + 16);
      const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
      const asc = [...chunk].map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
      x.out(`${off.toString(16).padStart(8, '0')}: ${hex.padEnd(47)}  ${asc}`);
    }
  }
};

const od: Handler = (x, args) => {
  const c = args.includes('-c');
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  const bytes = new TextEncoder().encode(f.content);
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = bytes.slice(off, off + 16);
    const body = c
      ? [...chunk].map(b => (b === 9 ? '\\t' : b === 10 ? '\\n' : b >= 32 && b < 127 ? String.fromCharCode(b) : b.toString(8).padStart(3, '0'))).join(' ')
      : [...chunk].map(b => b.toString(8).padStart(3, '0')).join(' ');
    x.out(`${off.toString(8).padStart(7, '0')}  ${body}`);
  }
  x.out(`${bytes.length.toString(8).padStart(7, '0')}`);
};

const column: Handler = (x) => {
  const rows = (x.stdin || '').split('\n').filter(l => l.trim())
    .map(l => l.split(/\s+/));
  if (!rows.length) return;
  const widths = rows[0].map((_, ci) => Math.max(...rows.map(r => (r[ci] ?? '').length)));
  rows.forEach(r => x.out(r.map((c, ci) => (c ?? '').padEnd(widths[ci])).join('  ').trimEnd()));
};

const fmt: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  const wi = args.indexOf('-w');
  const width = wi >= 0 ? parseInt(args[wi + 1], 10) || 72 : 72;
  const words = f.content.split(/\s+/).filter(Boolean);
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { x.out(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) x.out(line);
};

/* real application of our unified-diff format (from git show / diff) */
const patch: Handler = (x, args) => {
  const f = firstFile(x, args, x.stdin);
  if (!f) return;
  const lines = f.content.split('\n');
  let target: string | null = null;
  const out: string[] = [];
  let inHunks = false;
  let added = 0, removed = 0;
  for (const l of lines) {
    if (l.startsWith('+++ b/')) { target = l.slice(6).trim(); inHunks = false; out.push(l); continue; }
    if (l.startsWith('--- ') || l.startsWith('diff --git') || l.startsWith('new file') || l.startsWith('deleted file')) { out.push(l); continue; }
    if (l.startsWith('@@')) { inHunks = true; out.push(l); continue; }
    if (inHunks && (l.startsWith('+') || l.startsWith('-'))) {
      out.push(l);
      if (l.startsWith('+')) added++; else removed++;
      continue;
    }
    out.push(l);
  }
  if (!target) { x.err('patch: no unified diff found in input (use: git show > p && patch < p)'); return; }
  const r = resolvePath(x.env, target);
  if (!r) { x.err(`patch: cannot find file ${target} in working directory`); return; }
  // naive re-apply: take "to" side of each hunk
  const rebuilt: string[] = [];
  for (const l of out) {
    if (l.startsWith('+') && !l.startsWith('+++')) rebuilt.push(l.slice(1));
    else if (l.startsWith('-') && !l.startsWith('---')) continue;
    else if (!l.startsWith('@@') && !l.startsWith('diff ') && !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('new file') && !l.startsWith('deleted file')) rebuilt.push(l);
  }
  r.node.content = rebuilt.join('\n');
  r.node.mtime = Date.now();
  x.flash(r.node.id, '#3fdc9b', 'patched', 150);
  x.show(`100 out of 100 hunks applied cleanly to ${target}`, 'ok');
  x.show(`(${added} added, ${removed} removed)`, 'dim');
  x.log('fs', `patch ${target} — ${added}+/${removed}-`, '#3fdc9b');
  x.markDirty(r.path);
};

/* ------------------------------------------------------------------ */
/* Network (lightweight flavors of the heavy ones)                     */
/* ------------------------------------------------------------------ */

const nslookup: Handler = (x, args) => {
  const host = nf(args)[0];
  if (!host) { x.err('nslookup: usage: nslookup <host>'); return; }
  x.out(`Server:\t\t192.168.1.1`);
  x.out('Address:\t192.168.1.1#53');
  x.out('');
  x.out(`Name:\t\t${host}`);
  x.out(`Address:\t${fakeIp(host)}`);
  x.log('net', `nslookup ${host} → ${fakeIp(host)}`, '#53c7f0');
};

const hostCmd: Handler = (x, args) => {
  const h = args.find(a => !a.startsWith('-'));
  if (!h) { x.err('host: usage: host <domain>'); return; }
  x.out(`${h} has address ${fakeIp(h)}`);
};

const nc: Handler = (x, args) => {
  const toks = args.filter(a => !a.startsWith('-'));
  const port = toks.find(t => /^\d+$/.test(t));
  x.show(`(CONNECTED) — listening on ${port ?? '1234'} (simulated)`, 'dim');
  x.proc('nc', 1200);
  x.show('closed by foreign host', 'dim');
};

const scp: Handler = (x, args) => {
  const src = args.find(a => a.includes('@') || a.startsWith('/'));
  const dst = args.find(a => a !== src && !a.startsWith('-'));
  if (!src || !dst) { x.err('scp: usage: scp user@host:/remote/path ./local'); return; }
  const name = src.split('/').pop() ?? 'file';
  const abs = resolvePath(x.env, '.');
  const content = `/* fetched from ${src} */\nexport const remote = true;\nexport const fetchedAt = ${Date.now()};\n`;
  const node = makeFile(x.env, name.split('/').pop()!, content);
  (abs?.node.children ?? []).push(node);
  x.packet(TTY, node.id, '#53c7f0', 'scp', 150);
  x.flash(node.id, '#53c7f0', 'scp', 300);
  x.out(`${src}  100%   124KB   8.4MB/s   00:00`);
  x.log('net', `scp ${src} → .`, '#53c7f0');
};

const rsync: Handler = (x, args) => {
  const toks = args.filter(a => !a.startsWith('-'));
  if (toks.length < 2) { x.err('rsync: usage: rsync -av <src> <dst>'); return; }
  const src = toks[toks.length - 2].replace(/\/$/, '');
  const dst = toks[toks.length - 1].replace(/\/$/, '');
  const s = resolvePath(x.env, src);
  if (!s) { x.err(`rsync: ${src}: no such file or directory`); return; }
  ensureDir(x.env, dst);
  const d = resolvePath(x.env, dst);
  let copied = 0;
  const copyInto = (dir: FsNode, name: string, children?: FsNode['children']) => {
    if (!children) return;
    for (const c of children) {
      if (c.name === '.git') continue;
      if (c.type === 'dir') {
        const sub = ensureDir(x.env, `${d?.path}/${name}/${c.name}`);
        if (sub) copyInto(sub, c.name, sub.children);
      } else {
        if (!dir.children?.some(cc => cc.name === c.name)) {
          (dir.children ?? (dir.children = [])).push(makeFile(x.env, c.name, c.content ?? ''));
          x.out(`${name}${name ? '/' : ''}${c.name}`);
          copied++;
        }
      }
    }
  };
  if (s.node.type === 'dir') copyInto(d?.node ?? s.node, '', s.node.children);
  else {
    if (!d?.node.children?.some(cc => cc.name === s.node.name)) {
      (d?.node.children ?? (d!.node.children = [])).push(makeFile(x.env, s.node.name, s.node.content ?? ''));
      x.out(s.node.name);
      copied++;
    }
  }
  x.show(`sent ${1024 * (copied + 1)} bytes  received 120 bytes  4336.00 bytes/sec (${copied} file(s))`, 'dim');
  x.log('fs', `rsync ${src} → ${dst}`, '#3fdc9b');
};

/* ------------------------------------------------------------------ */
/* Package managers (yarn / pnpm / pip / port)                         */
/* ------------------------------------------------------------------ */

function pkgInstall(x: any, as: 'yarn' | 'pnpm' | 'pip' | 'pip3' | 'port', args: string[]) {
  const names = args.slice(1).filter(a => !a.startsWith('-'));
  if (!names.length) {
    x.show(`${as}: (no packages named — list current)`, 'dim');
    (x.env.packages ?? []).forEach((p: any) => x.out(`  ${p.name}@${p.version}`));
    return;
  }
  const versions = ['4.1.2', '2.8.0', '1.14.3', '3.0.1', '0.9.7', '5.2.1', '18.3.1', '11.3.8'];
  const pkgs = names.map((n: string, i: number) => ({
    name: n,
    version: versions[(n.length + i) % versions.length],
    size: `${rand(18, 420)}.${rand(0, 9)} kB`,
  }));
  if (as === 'pip' || as === 'pip3' || as === 'port') {
    pkgs.forEach(p => x.env.packages.push({ ...p, python: as === 'pip' }));
    x.show(as === 'pip' || as === 'pip3' ? `Successfully installed ${pkgs.map(p => p.name + '-' + p.version).join(' ')}` : `--->  Installing ${pkgs.map(p => p.name).join(' ')}`, 'ok');
    x.log('npm', `${as} install ${pkgs.map(p => p.name).join(' ')}`, '#6ea1ff');
    return;
  }
  // node-style: materialize node_modules like npm does
  const cwdNode = resolvePath(x.env, '.');
  if (cwdNode) {
    let nm = cwdNode.node.children!.find(c => c.name === 'node_modules');
    if (!nm) {
      nm = makeFile(x.env, 'node_modules', '');
      nm.type = 'dir'; nm.children = [];
      cwdNode.node.children!.push(nm);
      x.flash(nm.id, '#a991f7', '+ node_modules', 1400);
    }
    pkgs.forEach(p => {
      if (nm!.children!.some(c => c.name === p.name)) return;
      const pkgDir = makeFile(x.env, p.name, '');
      pkgDir.type = 'dir';
      pkgDir.children = [makeFile(x.env, 'package.json', `{"name":"${p.name}","version":"${p.version}"}`)];
      nm!.children!.push(pkgDir);
    });
    (x.env.packages ?? []).push(...pkgs);
  }
  x.show(`${as === 'yarn' ? '➤' : '‣'} added ${pkgs.length} package${pkgs.length === 1 ? '' : 's'} in ${rand(2, 9)}.${rand(0, 9)}s`, 'ok');
  x.log('npm', `${as} install ${pkgs.map(p => p.name).join(' ')}`, '#6ea1ff');
}

const yarn: Handler = (x, args) => {
  if (args[0] === 'init') {
    const pj = makeFile(x.env, 'package.json', '{"name":"app","version":"1.0.0","dependencies":{}}');
    (resolvePath(x.env, '.')?.node.children ?? []).push(pj);
    x.flash(pj.id, '#a991f7', '+ package.json', 200);
    x.show('success Saved package.json', 'ok');
    return;
  }
  pkgInstall(x, 'yarn', args);
};
const pnpm: Handler = (x, args) => pkgInstall(x, 'pnpm', args);
const pip: Handler = (x, args) => pkgInstall(x, 'pip', args);
const pip3: Handler = (x, args) => pkgInstall(x, 'pip3', args);
const port: Handler = (x, args) => pkgInstall(x, 'port', args);

/* ------------------------------------------------------------------ */
/* Fun / misc                                                          */
/* ------------------------------------------------------------------ */

const cal: Handler = (x, args) => {
  const now = new Date();
  const mi = args[0] && !Number.isNaN(parseInt(args[0], 10)) ? parseInt(args[0], 10) - 1 : now.getMonth();
  const yi = args[1] ? parseInt(args[1], 10) : now.getFullYear();
  const first = new Date(yi, mi, 1);
  const days = new Date(yi, mi + 1, 0).getDate();
  const startDow = first.getDay();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  x.out('');
  x.out(months[mi].padStart(20) + ' ' + yi);
  x.out('Su Mo Tu We Th Fr Sa');
  let line = Array(startDow).fill('  ').join('');
  for (let d = 1; d <= days; d++) {
    line += String(d).padStart(2);
    if ((startDow + d) % 7 === 0 || d === days) { x.out(line); line = ''; }
  }
  x.out('');
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const EXTRA_HANDLERS: Record<string, Handler> = {
  unset, printenv, setenv, command: commandV, whereis, pushd, popd, dirs, jobs, kill,
  top, lsof, netstat, ifconfig, sysctl, sw_vers, who, w: who, groups, pbcopy, pbpaste,
  open: openCmd, screencapture, say, mdfind, mdls, osascript, diskutil, launchctl, caffeinate, system_profiler,
  basename, dirname, realpath, readlink, less, more, file: fileCmd, shasum, sha1sum, cksum,
  nl, rev, seq, shuf, base64, xxd, od, column, fmt, patch,
  nslookup, host: hostCmd, nc, netcat: nc, scp, rsync,
  yarn, pnpm, pip, pip3, port,
  cal,
};
