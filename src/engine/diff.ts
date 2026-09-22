/* ------------------------------------------------------------------ */
/* Line diff engine (LCS-based) producing unified-diff style hunks     */
/* Powers the REAL git diffs inside the sandbox.                       */
/* ------------------------------------------------------------------ */

export type DiffOpType = 'add' | 'del' | 'ctx';

export interface DiffOp { type: DiffOpType; text: string }

export interface DiffHunk { header: string; lines: DiffOp[] }

export interface FileDiff {
  path: string;
  status: 'added' | 'deleted' | 'modified';
  hunks: DiffHunk[];
  add: number;
  del: number;
}

/** LCS line diff: old vs new → per-line operations (ctx/del/add). */
export function diffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  if (n === 0) return newLines.map(text => ({ type: 'add' as const, text }));
  if (m === 0) return oldLines.map(text => ({ type: 'del' as const, text }));

  // safety valve for huge files — crude replace-all
  if (n * m > 9_000_000) {
    return [
      ...oldLines.map(text => ({ type: 'del' as const, text })),
      ...newLines.map(text => ({ type: 'add' as const, text })),
    ];
  }

  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = oldLines[i] === newLines[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) { ops.push({ type: 'ctx', text: oldLines[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ type: 'del', text: oldLines[i] }); i++; }
    else { ops.push({ type: 'add', text: newLines[j] }); j++; }
  }
  while (i < n) ops.push({ type: 'del', text: oldLines[i++] });
  while (j < m) ops.push({ type: 'add', text: newLines[j++] });
  return ops;
}

/** Group diff ops into unified-diff hunks with N lines of context. */
export function groupHunks(ops: DiffOp[], context = 3): DiffHunk[] {
  const n = ops.length;

  // maximal runs of non-context lines
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (ops[i].type === 'ctx') continue;
    let e = i;
    while (e + 1 < n && ops[e + 1].type !== 'ctx') e++;
    runs.push([i, e]);
    i = e;
  }
  if (!runs.length) return [];

  // extend each run by context, merge overlapping extensions
  const merged: [number, number][] = [];
  for (const [s, e] of runs) {
    const s0 = Math.max(0, s - context);
    const e0 = Math.min(n - 1, e + context);
    const last = merged[merged.length - 1];
    if (last && s0 <= last[1] + 1) last[1] = Math.max(last[1], e0);
    else merged.push([s0, e0]);
  }

  return merged.map(([s, e]) => {
    const slice = ops.slice(s, e + 1);
    let oldStart = 1, newStart = 1;
    for (let k = 0; k < s; k++) {
      if (ops[k].type !== 'add') oldStart++;
      if (ops[k].type !== 'del') newStart++;
    }
    let oldCount = 0, newCount = 0;
    for (const op of slice) {
      if (op.type !== 'add') oldCount++;
      if (op.type !== 'del') newCount++;
    }
    const hOld = oldCount === 0 ? '0,0' : `${oldStart},${oldCount}`;
    const hNew = newCount === 0 ? '0,0' : `${newStart},${newCount}`;
    return { header: `@@ -${hOld} +${hNew} @@`, lines: slice };
  });
}

/** Diff two file contents (null = side does not exist). */
export function diffFile(relPath: string, oldC: string | null, newC: string | null): FileDiff {
  const oL = oldC ? oldC.split('\n') : [];
  const nL = newC ? newC.split('\n') : [];
  const status: FileDiff['status'] =
    oldC === null ? 'added' : newC === null ? 'deleted' : 'modified';

  const ops = diffOps(oL, nL);
  let add = 0, del = 0;
  for (const op of ops) {
    if (op.type === 'add') add++;
    else if (op.type === 'del') del++;
  }
  if (status === 'modified' && add === 0 && del === 0) {
    return { path: relPath, status: 'modified', hunks: [], add: 0, del: 0 };
  }
  return { path: relPath, status, hunks: groupHunks(ops), add, del };
}

/** "2 files changed, 5 insertions(+), 1 deletion(-)" */
export function diffSummary(files: FileDiff[]): string {
  const n = files.length;
  const add = files.reduce((a, f) => a + f.add, 0);
  const del = files.reduce((a, f) => a + f.del, 0);
  const parts = [`${n} file${n === 1 ? '' : 's'} changed`];
  if (add) parts.push(`${add} insertion${add === 1 ? '' : 's'}(+)`);
  if (del) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`);
  return parts.join(', ');
}
