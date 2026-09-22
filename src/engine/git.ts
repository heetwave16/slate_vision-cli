/* ================================================================== */
/*  Shellscope real git engine                                        */
/*  Implements genuine git semantics on top of the virtual FS:        */
/*  content snapshots (trees), SHA-1 object hashes, LCS line diffs,   */
/*  index (staging), branches, and working-tree sync on checkout.     */
/* ================================================================== */

import type { EnvState, FsNode, GitCommit } from './types';
import {
  HOME, displayPath, resolvePath, parentDir, ensureDir, makeFile, removeAtPath,
} from './fs';
import { sha1Hex } from './hash';
import { diffFile, diffSummary, type FileDiff } from './diff';

export class GitError extends Error {}

const short = (h: string | null | undefined) => (h ? h.slice(0, 7) : '');

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

function collectNodes(node: FsNode, prefix: string, out: Map<string, FsNode>): void {
  for (const c of node.children ?? []) {
    const p = prefix + '/' + c.name;
    if (c.name === '.git') continue; // git metadata never enters trees
    if (c.type === 'file') out.set(p, c);
    else collectNodes(c, p, out);
  }
}

/** abs path → FsNode for every file under repo root (excluding .git) */
export function snapshotNodes(env: EnvState, root: string): Map<string, FsNode> {
  const out = new Map<string, FsNode>();
  const res = resolvePath(env, root);
  if (res) collectNodes(res.node, root, out);
  return out;
}

/** abs path → content */
export function snapshotContent(env: EnvState, root: string): Map<string, string> {
  const nodes = snapshotNodes(env, root);
  const out = new Map<string, string>();
  for (const [p, n] of nodes) out.set(p, n.content ?? '');
  return out;
}

export function relPath(root: string, p: string): string {
  return p.startsWith(root + '/') ? p.slice(root.length + 1) : p;
}

/* ------------------------------------------------------------------ */
/* .gitignore                                                          */
/* ------------------------------------------------------------------ */

function globToRe(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '*') {
      if (s[i + 1] === '*') { out += '.*'; i++; }
      else out += '[^/]*';
    } else {
      out += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return out;
}

/** True when a repo-relative path is ignored by the repo-root .gitignore. */
export function isIgnored(env: EnvState, root: string, rel: string): boolean {
  const res = resolvePath(env, root + '/.gitignore');
  if (!res || res.node.type !== 'file') return false;
  for (const raw of (res.node.content ?? '').split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.endsWith('/')) line = line.slice(0, -1);
    const anchored = line.startsWith('/') || line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    const re = new RegExp((anchored ? '^' : '(^|/)') + globToRe(line) + '(/.*)?$');
    if (re.test(rel)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Object hashing (blob → tree → commit, all SHA-1)                    */
/* ------------------------------------------------------------------ */

const blobCache = new Map<string, string>();
export function blobHash(content: string): string {
  let h = blobCache.get(content);
  if (!h) {
    h = sha1Hex(`blob ${new TextEncoder().encode(content).length}\0${content}`);
    if (blobCache.size < 8192) blobCache.set(content, h);
  }
  return h;
}

export function treeHash(tree: Record<string, string>): string {
  const entries = Object.keys(tree)
    .sort()
    .map(p => `100644 blob ${blobHash(tree[p])}\t${p}`)
    .join('\n');
  return sha1Hex(entries);
}

function makeCommit(
  env: EnvState,
  tree: Record<string, string>,
  parentHash: string | null,
  message: string,
): GitCommit {
  const parent = parentHash ? env.git.commits[parentHash] : null;
  const parentTree = parent ? parent.tree : {};
  const files: string[] = [];
  const stats: GitCommit['stats'] = [];
  const touched = new Set<string>([...Object.keys(tree), ...Object.keys(parentTree)]);
  for (const p of [...touched].sort()) {
    const a = parentTree[p] ?? null;
    const b = tree[p] ?? null;
    if (a === b) continue;
    const fd = diffFile(relPath(env.git.root, p), a, b);
    files.push(relPath(env.git.root, p));
    stats.push({ path: relPath(env.git.root, p), add: fd.add, del: fd.del, status: fd.status });
  }
  const at = Date.now();
  const author = `${env.user}@${env.host}`;
  const payload =
    `tree ${treeHash(tree)}\n` +
    (parentHash ? `parent ${parentHash}\n` : '') +
    `author ${author} <${at}> +0000\n` +
    `committer ${author} <${at}> +0000\n\n` +
    `${message}\n`;
  const hash = sha1Hex(payload);
  return {
    hash,
    parents: parentHash ? [parentHash] : [],
    msg: message,
    author,
    at,
    tree: { ...tree },
    files,
    stats,
  };
}

/* ------------------------------------------------------------------ */
/* Derived state (staged / dirty) — recomputed from real content       */
/* ------------------------------------------------------------------ */

export function retrack(env: EnvState): void {
  const g = env.git;
  if (!g.init) return;
  const work = snapshotContent(env, g.root);
  const head = g.headHash ? g.commits[g.headHash] : null;
  const headTree: Record<string, string> = head ? head.tree : {};
  const dirty = new Set<string>();
  const staged = new Set<string>();
  const all = new Set<string>([...work.keys(), ...Object.keys(g.index), ...Object.keys(headTree)]);
  for (const p of all) {
    const cur = work.get(p);
    const idx = g.index[p];
    const hd = headTree[p];
    const tracked = idx !== undefined || hd !== undefined;
    if (!tracked) { if (!isIgnored(env, g.root, relPath(g.root, p))) dirty.add(p); continue; } // untracked / ignored
    if (idx !== cur) dirty.add(p);            // modified / deleted vs index
    if (idx !== hd) staged.add(p);            // staged content differs from HEAD
  }
  g.dirty = [...dirty].sort();
  g.staged = [...staged].sort();
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

export function gitInit(env: EnvState): { ok: boolean; error?: string } {
  if (env.git.init) {
    return { ok: false, error: `fatal: re-init: already a git repository at ${displayPath(env.git.root)}` };
  }
  env.git = {
    init: true,
    root: env.cwd,
    branch: 'main',
    branches: { main: null },
    commits: {},
    order: [],
    index: {},
    headHash: null,
    staged: [],
    dirty: [],
  };
  retrack(env);
  return { ok: true };
}

export interface GitAddResult { ok: boolean; error?: string; paths: string[] }

export function gitAdd(env: EnvState, target: string): GitAddResult {
  const g = env.git;
  if (!g.init) return { ok: false, paths: [], error: 'fatal: not a git repository (or any of the parent directories): .git' };
  const work = snapshotNodes(env, g.root);

  let matched: string[] = [];
  if (target === '.') {
    matched = [...work.keys()].filter(p => !isIgnored(env, g.root, relPath(g.root, p)));
  } else {
    const res = resolvePath(env, target);
    if (res) {
      if (res.path !== g.root && !res.path.startsWith(g.root + '/')) {
        return { ok: false, paths: [], error: `fatal: '${target}': is outside repository ${displayPath(g.root)}` };
      }
      if (res.node.type === 'file') matched = [res.path];
      else matched = [...work.keys()].filter(p => p === res.path || p.startsWith(res.path + '/'));
    } else {
      // path no longer on disk — allow staging its deletion
      const key = Object.keys(g.index).find(k => displayPath(k) === target || k.endsWith('/' + target));
      if (key) matched = [key];
    }
  }

  if (!matched.length) {
    return { ok: false, paths: [], error: `error: pathspec '${target}' did not match any file(s) known to git` };
  }

  for (const p of matched) {
    const node = work.get(p);
    if (node) g.index[p] = node.content ?? '';
    else delete g.index[p]; // stage deletion
  }
  retrack(env);
  return { ok: true, paths: matched };
}

export interface GitCommitResult { ok: boolean; error?: string; commit?: GitCommit }

export function gitCommit(env: EnvState, message: string): GitCommitResult {
  const g = env.git;
  const head = g.headHash ? g.commits[g.headHash] : null;
  const headTree: Record<string, string> = head ? head.tree : {};
  const anythingStaged = Object.keys(g.index).some(p => g.index[p] !== headTree[p]);
  if (!anythingStaged) {
    return { ok: false, error: 'nothing to commit — stage changes first (git add .)' };
  }
  const tree: Record<string, string> = { ...headTree, ...g.index };
  const commit = makeCommit(env, tree, g.headHash, message);
  g.commits[commit.hash] = commit;
  g.order.push(commit.hash);
  g.branches[g.branch] = commit.hash;
  g.headHash = commit.hash;
  g.index = { ...tree }; // index now matches HEAD
  retrack(env);
  return { ok: true, commit };
}

export interface GitStatus {
  branch: string;
  head: string | null;
  staged: { path: string; kind: 'new' | 'modified' | 'deleted' }[];
  unstaged: { path: string; kind: 'modified' | 'deleted' }[];
  untracked: string[];
  clean: boolean;
}

export function gitStatus(env: EnvState): GitStatus {
  const g = env.git;
  const work = snapshotContent(env, g.root);
  const head = g.headHash ? g.commits[g.headHash] : null;
  const headTree: Record<string, string> = head ? head.tree : {};
  const staged: GitStatus['staged'] = [];
  const unstaged: GitStatus['unstaged'] = [];
  const untracked: string[] = [];
  const seen = new Set<string>([...g.staged, ...g.dirty]);
  for (const p of [...seen].sort()) {
    const cur = work.get(p);
    const idx = g.index[p];
    const hd = headTree[p];
    const tracked = idx !== undefined || hd !== undefined;
    if (!tracked) { untracked.push(p); continue; }
    if (idx !== hd) {
      staged.push({
        path: p,
        kind: hd === undefined ? (cur === undefined ? 'deleted' : 'new') : (cur === undefined ? 'deleted' : 'modified'),
      });
    }
    if (idx !== cur) {
      unstaged.push({ path: p, kind: cur === undefined ? 'deleted' : 'modified' });
    }
  }
  return {
    branch: g.branch,
    head: g.headHash,
    staged,
    unstaged,
    untracked,
    clean: !staged.length && !unstaged.length && !untracked.length,
  };
}

/* ---------------- diffing ---------------- */

export interface GitDiffResult {
  files: FileDiff[];
  summary: string;
  label: string;
}

export function resolveRef(env: EnvState, ref: string): GitCommit | null {
  const g = env.git;
  if (ref === 'HEAD') return g.headHash ? g.commits[g.headHash] : null;
  const branchHash = g.branches[ref];
  if (branchHash && g.commits[branchHash]) return g.commits[branchHash];
  if (ref.length >= 4) {
    for (const h of Object.keys(g.commits)) {
      if (h.startsWith(ref)) return g.commits[h];
    }
  }
  return null;
}

export interface GitDiffOpts {
  staged?: boolean;
  file?: string;
  ref?: string;
  refA?: string;
  refB?: string;
}

export function gitDiff(env: EnvState, opts: GitDiffOpts = {}): GitDiffResult {
  const g = env.git;
  const work = Object.fromEntries(snapshotContent(env, g.root));
  const head = g.headHash ? g.commits[g.headHash] : null;
  const headTree: Record<string, string> = head ? head.tree : {};

  let base: Record<string, string>;
  let target: Record<string, string>;
  let keys: string[];
  let label: string;

  if (opts.refA && opts.refB) {
    const a = resolveRef(env, opts.refA);
    const b = resolveRef(env, opts.refB);
    if (!a || !b) throw new GitError(`fatal: unknown revision '${!a ? opts.refA : opts.refB}'`);
    base = a.tree; target = b.tree;
    keys = [...new Set([...Object.keys(base), ...Object.keys(target)])];
    label = `${short(a.hash)}..${short(b.hash)}`;
  } else if (opts.ref) {
    const r = resolveRef(env, opts.ref);
    if (!r) throw new GitError(`fatal: ambiguous argument '${opts.ref}': unknown revision`);
    base = r.tree; target = work;
    keys = [...new Set([...Object.keys(base), ...Object.keys(target)])];
    label = `${short(r.hash)} vs worktree`;
  } else if (opts.staged) {
    base = headTree; target = { ...g.index };
    keys = [...new Set([...Object.keys(headTree), ...Object.keys(g.index)])];
    label = 'staged vs HEAD';
  } else {
    base = { ...headTree, ...g.index }; target = work;
    keys = [...new Set([...Object.keys(headTree), ...Object.keys(g.index)])];
    label = 'worktree vs index';
  }

  const files: FileDiff[] = [];
  for (const p of [...keys].sort()) {
    const a = base[p] ?? null;
    const b = target[p] ?? null;
    if (a === b) continue;
    const rel = relPath(g.root, p);
    if (opts.file && rel !== opts.file && p !== opts.file && displayPath(p) !== opts.file) continue;
    files.push(diffFile(rel, a, b));
  }
  return { files, summary: diffSummary(files), label };
}

export function commitDiff(env: EnvState, hash: string): FileDiff[] {
  const g = env.git;
  const c = g.commits[hash];
  if (!c) return [];
  const parent = c.parents[0] ? g.commits[c.parents[0]] : null;
  const pt: Record<string, string> = parent ? parent.tree : {};
  const files: FileDiff[] = [];
  for (const p of [...new Set([...Object.keys(c.tree), ...Object.keys(pt)])].sort()) {
    const a = pt[p] ?? null;
    const b = c.tree[p] ?? null;
    if (a === b) continue;
    files.push(diffFile(relPath(g.root, p), a, b));
  }
  return files;
}

/* ---------------- log / show ---------------- */

export function gitLog(env: EnvState): GitCommit[] {
  const g = env.git;
  const out: GitCommit[] = [];
  const seen = new Set<string>();
  let h = g.headHash;
  while (h && g.commits[h] && !seen.has(h)) {
    seen.add(h);
    out.push(g.commits[h]);
    h = g.commits[h].parents[0] ?? null;
  }
  return out;
}

export interface GitShowResult { commit: GitCommit; files: FileDiff[] }

export function gitShow(env: EnvState, ref: string): GitShowResult | { error: string } {
  const c = resolveRef(env, ref);
  if (!c) return { error: `fatal: unknown revision or object: ${ref}` };
  return { commit: c, files: commitDiff(env, c.hash) };
}

/* ---------------- branches ---------------- */

export interface GitBranchInfo { name: string; hash: string | null; current: boolean }

export function gitBranchList(env: EnvState): GitBranchInfo[] {
  return Object.entries(env.git.branches)
    .sort(([a], [b]) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)))
    .map(([name, hash]) => ({ name, hash, current: name === env.git.branch }));
}

export function gitBranchCreate(env: EnvState, name: string): { ok: boolean; error?: string } {
  const g = env.git;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) {
    return { ok: false, error: `error: refname '${name}' is not valid` };
  }
  if (g.branches[name] !== undefined) {
    return { ok: false, error: `fatal: a branch named '${name}' already exists` };
  }
  if (!g.headHash) {
    return { ok: false, error: 'fatal: cannot create branch — make at least one commit first' };
  }
  g.branches[name] = g.headHash;
  return { ok: true };
}

export function gitBranchDelete(env: EnvState, name: string): { ok: boolean; error?: string; was?: string } {
  const g = env.git;
  if (name === g.branch) return { ok: false, error: `error: cannot delete branch '${name}' which is currently checked out` };
  if (g.branches[name] === undefined) return { ok: false, error: `error: branch '${name}' not found` };
  const was = g.branches[name] ?? undefined;
  delete g.branches[name];
  return { ok: true, was };
}

/* ---------------- checkout (real working-tree sync) ---------------- */

export interface CheckoutChange { path: string; action: 'added' | 'modified' | 'deleted' }
export interface GitCheckoutResult {
  ok: boolean;
  error?: string;
  changes?: CheckoutChange[];
  created?: boolean;
}

export function gitCheckout(
  env: EnvState,
  name: string,
  opts: { create?: boolean } = {},
): GitCheckoutResult {
  const g = env.git;
  let created = false;
  if (g.branches[name] === undefined) {
    if (!opts.create) {
      return { ok: false, error: `error: pathspec '${name}' did not match any branch(es) known to git` };
    }
    const res = gitBranchCreate(env, name);
    if (!res.ok) return { ok: false, error: res.error };
    created = true;
  }
  if (name === g.branch) return { ok: true, changes: [], created };

  const targetHash = g.branches[name];
  if (!targetHash) return { ok: false, error: `fatal: cannot check out unborn branch '${name}'` };
  const targetTree = g.commits[targetHash].tree;
  const sourceHash = g.headHash;
  const sourceTree: Record<string, string> = sourceHash ? g.commits[sourceHash].tree : {};

  const workNodes = snapshotNodes(env, g.root);
  const workContent = new Map<string, string>([...workNodes].map(([p, n]) => [p, n.content ?? '']));

  // conflict detection: local uncommitted changes that the switch would overwrite
  const conflicts: string[] = [];
  for (const p of new Set([...Object.keys(sourceTree), ...Object.keys(targetTree)])) {
    const wc = workContent.get(p);
    const sc = sourceTree[p];
    const tc = targetTree[p];
    const hasLocalChange = wc !== undefined && wc !== sc;
    const wouldOverwrite = tc !== undefined && tc !== sc;
    if (hasLocalChange && wouldOverwrite) conflicts.push(relPath(g.root, p));
  }
  if (conflicts.length) {
    return {
      ok: false,
      error: `error: Your local changes to the following files would be overwritten by checkout:\n  ${conflicts.join('\n  ')}\nPlease commit your changes or stash them before you switch branches.`,
    };
  }

  // apply target tree to the working tree (this is what makes the switch REAL)
  const changes: CheckoutChange[] = [];
  for (const p of Object.keys(targetTree).sort()) {
    if (workContent.get(p) === targetTree[p]) continue;
    const node = workNodes.get(p);
    if (node) {
      node.content = targetTree[p];
      node.mtime = Date.now();
      changes.push({ path: p, action: 'modified' });
    } else {
      ensureDir(env, p);
      const parent = parentDir(env, p);
      if (parent) {
        parent.children!.push(makeFile(env, p.split('/').pop()!, targetTree[p]));
        changes.push({ path: p, action: 'added' });
      }
    }
  }
  for (const p of Object.keys(sourceTree).sort()) {
    if (targetTree[p] !== undefined) continue;
    if (workContent.get(p) !== sourceTree[p]) continue; // keep local new files
    removeAtPath(env, p);
    changes.push({ path: p, action: 'deleted' });
  }

  g.branch = name;
  g.headHash = targetHash;
  g.index = { ...targetTree };
  if (!resolvePath(env, env.cwd)) env.cwd = g.root; // cwd may have vanished
  retrack(env);
  return { ok: true, changes, created };
}

/* ---------------- push (simulated remote) ---------------- */

export interface GitPushResult {
  ok: boolean;
  error?: string;
  info?: { remote: string; branch: string; from: string | null; to: string; objects: number };
}

export function gitPush(env: EnvState, branchName?: string, remoteName = 'origin'): GitPushResult {
  const g = env.git;
  const branch = branchName ?? g.branch;
  const to = g.branches[branch];
  if (!to) return { ok: false, error: `fatal: You are on a branch with no commits (${branch})` };
  const from = g.branches[remoteName + '/' + branch] ?? null;
  const objects = (g.commits[to]?.files.length ?? 0) + 1;
  g.branches[remoteName + '/' + branch] = to;
  return { ok: true, info: { remote: `sandbox://${remoteName}`, branch, from, to, objects } };
}

/* ---------------- git rm ---------------- */

export function gitRm(env: EnvState, target: string): { ok: boolean; error?: string; path?: string } {
  const g = env.git;
  if (!g.init) return { ok: false, error: 'fatal: not a git repository' };
  const res = resolvePath(env, target);
  if (!res) return { ok: false, error: `error: the path '${target}' does not exist in 'HEAD'` };
  if (res.path === HOME) return { ok: false, error: "error: refusing to remove the sandbox root '~'" };
  if (res.node.type === 'dir' && (res.node.children?.filter(c => !c.phantom).length ?? 0) > 0) {
    return { ok: false, error: `error: ${target}: not a regular file (directories require git rm -r)` };
  }
  removeAtPath(env, res.path);
  delete g.index[res.path];
  if (res.path === env.cwd || env.cwd.startsWith(res.path + '/')) env.cwd = HOME;
  retrack(env);
  return { ok: true, path: res.path };
}
