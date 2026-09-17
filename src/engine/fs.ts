import type { EnvState, FsNode, LayoutResult, LaidNode } from './types';

export const HOME = '/home/user';

/* ---------------- path helpers ---------------- */

export function displayPath(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(HOME + '/')) return '~' + p.slice(HOME.length);
  return p;
}

/** Normalize an arbitrary user path against cwd. Returns null if outside the sandbox. */
export function normalize(cwd: string, p: string): string | null {
  let raw = p.trim();
  if (raw === '' ) raw = '.';
  if (raw === '~' || raw === '/') raw = HOME;
  else if (raw.startsWith('~/')) raw = HOME + raw.slice(1);
  const base = raw.startsWith('/') ? '' : cwd;
  const parts = (base ? base + '/' + raw : raw).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (stack.length) stack.pop(); continue; }
    stack.push(part);
  }
  const abs = '/' + stack.join('/');
  if (abs === '/') return HOME;
  if (abs !== HOME && !abs.startsWith(HOME + '/')) return null; // outside sandbox
  return abs;
}

export interface Resolved {
  node: FsNode;
  parent: FsNode | null;
  path: string;
}

export function resolvePath(env: EnvState, p: string): Resolved | null {
  const abs = normalize(env.cwd, p);
  if (abs === null) return null;
  const segs = abs.split('/').filter(Boolean);
  // segs: home, user, ...
  let node: FsNode = env.fs;
  let parent: FsNode | null = null;
  // root node represents /home/user -> first two segments are implicit
  let i = 0;
  if (segs[0] === 'home' && segs[1] === 'user') i = 2;
  for (; i < segs.length; i++) {
    const child = node.children?.find(c => c.name === segs[i]);
    if (!child) return null;
    parent = node;
    node = child;
  }
  return { node, parent, path: abs };
}

export function parentDir(env: EnvState, absPath: string): FsNode | null {
  const segs = absPath.split('/').filter(Boolean).slice(0, -1);
  let node: FsNode = env.fs;
  let i = 0;
  if (segs[0] === 'home' && segs[1] === 'user') i = 2;
  for (; i < segs.length; i++) {
    const child = node.children?.find(c => c.name === segs[i]);
    if (!child || child.type !== 'dir') return null;
    node = child;
  }
  return node;
}

/* ---------------- mutations (draft-based) ---------------- */

export function newId(env: EnvState): string {
  env.seq += 1;
  return 'n' + env.seq;
}

export function makeDir(env: EnvState, name: string): FsNode {
  return { id: newId(env), name, type: 'dir', children: [] };
}

export function makeFile(env: EnvState, name: string, content = ''): FsNode {
  return { id: newId(env), name, type: 'file', content, exec: name.endsWith('.sh') };
}

/** mkdir -p semantics; returns the final dir (creates missing pieces). */
export function ensureDir(env: EnvState, absPath: string): FsNode | null {
  const segs = absPath.split('/').filter(Boolean);
  if (segs[0] !== 'home' || segs[1] !== 'user') return null;
  let node: FsNode = env.fs;
  for (let i = 2; i < segs.length; i++) {
    if (!node.children) node.children = [];
    let child = node.children.find(c => c.name === segs[i]);
    if (!child) {
      child = makeDir(env, segs[i]);
      node.children.push(child);
    } else if (child.type !== 'dir') return null;
    node = child;
  }
  return node;
}

export function removeAtPath(env: EnvState, absPath: string): boolean {
  const parent = parentDir(env, absPath);
  if (!parent || !parent.children) return false;
  const name = absPath.split('/').filter(Boolean).pop();
  const idx = parent.children.findIndex(c => c.name === name);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  return true;
}

export function deepCloneNode(env: EnvState, n: FsNode, name?: string): FsNode {
  const copy: FsNode = {
    id: newId(env),
    name: name ?? n.name,
    type: n.type,
    content: n.content,
    exec: n.exec,
  };
  if (n.children) copy.children = n.children.map(c => deepCloneNode(env, c));
  return copy;
}

export function countNodes(n: FsNode): { dirs: number; files: number } {
  let dirs = 0, files = 0;
  const walk = (x: FsNode) => {
    if (x.phantom) return;
    if (x.type === 'dir') { dirs++; x.children?.forEach(walk); }
    else files++;
  };
  walk(n);
  return { dirs: dirs - 1, files }; // exclude root
}

export function nodeSize(n: FsNode): number {
  if (n.type === 'file') return (n.content ?? '').length;
  return (n.children ?? []).reduce((a, c) => a + nodeSize(c), 0);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/* ---------------- layout ---------------- */

export const PAD = 28;
export const COL_W = 210;
export const ROW_H = 56;
export const NODE_W = 160;
export const NODE_H = 38;
export const MAX_KIDS = 13;
export const TTY_ID = 'tty';
export const TTY_W = 74;
export const TTY_H = 38;

export function getTtyCenter(layout: LayoutResult): { x: number; y: number } {
  const root = layout.pathMap?.get(HOME) ?? layout.nodes.find(n => n.depth === 0);
  const ry = root ? root.y : PAD;
  return { x: PAD + TTY_W / 2, y: ry + TTY_H / 2 };
}

export function computeLayout(root: FsNode): LayoutResult {
  const nodes: LaidNode[] = [];
  const edges: { from: string; to: string }[] = [];
  let leaf = 0;

  const walk = (node: FsNode, depth: number, parentId: string | null, path: string): number => {
    const kids = (node.children ?? []).slice().sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const visKids = kids.length > MAX_KIDS
      ? [...kids.slice(0, MAX_KIDS), {
          id: node.id + ':more', name: `+${kids.length - MAX_KIDS} more`,
          type: 'dir' as const, phantom: true, children: [],
        }]
      : kids;

    let y: number;
    if (visKids.length === 0) {
      y = leaf++;
    } else {
      const ys = visKids.map(k => walk(k, depth + 1, node.id, path + '/' + k.name));
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    nodes.push({
      id: node.id, node, depth, parentId, path,
      x: PAD + COL_W + depth * COL_W,
      y: PAD + y * ROW_H,
    });
    if (parentId) edges.push({ from: parentId, to: node.id });
    return y;
  };

  walk(root, 0, null, HOME);
  const width = PAD + COL_W * 2 + (nodes.reduce((m, n) => Math.max(m, n.depth), 0)) * COL_W + NODE_W + PAD;
  const height = Math.max(leaf, 4) * ROW_H + PAD * 2;
  const nodeMap = new Map<string, LaidNode>();
  const pathMap = new Map<string, LaidNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
    pathMap.set(n.path, n);
  }
  return { nodes, edges, width, height, nodeMap, pathMap };
}

export function nodeCenter(n: { x: number; y: number }): { x: number; y: number } {
  return { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 };
}

/** Cubic bezier with horizontal tangents between two centers. */
export function edgeD(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function sampleBezier(a: { x: number; y: number }, b: { x: number; y: number }, n: number) {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45);
  const p0 = a, p1 = { x: a.x + dx, y: a.y }, p2 = { x: b.x - dx, y: b.y }, p3 = b;
  const pts: { x: number; y: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

/**
 * Waypoints for a packet travelling between two node ids (via their LCA),
 * or from/to the virtual TTY node. Returns sampled points + approx length.
 */
export function packetRoute(
  layout: LayoutResult,
  ttyPos: { x: number; y: number },
  from: string,
  to: string,
): { xs: number[]; ys: number[]; len: number } | null {
  const pos = new Map<string, { x: number; y: number }>();
  const parent = new Map<string, string | null>();
  for (const n of layout.nodes) {
    pos.set(n.id, nodeCenter(n));
    parent.set(n.id, n.parentId);
  }
  pos.set(TTY_ID, ttyPos);

  if (!pos.has(from) || !pos.has(to)) return null;

  const upChain = (id: string): string[] => {
    const chain = [id];
    let cur = parent.get(id) ?? null;
    while (cur) { chain.push(cur); cur = parent.get(cur) ?? null; }
    return chain; // id ... root
  };

  let ids: string[];
  if (from === TTY_ID) {
    ids = [TTY_ID, ...upChain(to).reverse()];
  } else if (to === TTY_ID) {
    ids = [...upChain(from), TTY_ID];
  } else {
    const upA = upChain(from);
    const upB = new Set(upChain(to));
    const lca = upA.find(id => upB.has(id)) ?? layout.nodes[0]?.id;
    const downTo: string[] = [];
    let cur: string | null | undefined = to;
    while (cur && cur !== lca) { downTo.push(cur); cur = parent.get(cur); }
    ids = [...upA.slice(0, upA.indexOf(lca as string) + 1), ...downTo.reverse()];
  }

  const xs: number[] = [];
  const ys: number[] = [];
  let len = 0;
  const first = pos.get(ids[0])!;
  xs.push(first.x); ys.push(first.y);
  for (let i = 1; i < ids.length; i++) {
    const a = pos.get(ids[i - 1])!;
    const b = pos.get(ids[i])!;
    const pts = sampleBezier(a, b, 7);
    let prev = a;
    for (const p of pts) {
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      xs.push(p.x); ys.push(p.y);
    }
  }
  return { xs, ys, len };
}
