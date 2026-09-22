/* ------------------------------------------------------------------ */
/* Virtual environment state                                           */
/* ------------------------------------------------------------------ */

export interface FsNode {
  id: string;
  name: string;
  type: 'dir' | 'file';
  children?: FsNode[];
  content?: string;
  exec?: boolean;
  mtime?: number;
  mode?: string;
  symlink?: string;
  /** synthetic "+N more" placeholder for crowded dirs */
  phantom?: boolean;
}

export interface GitCommit {
  hash: string;             // real SHA-1
  parents: string[];
  msg: string;
  author: string;
  at: number;
  tree: Record<string, string>;  // abs path → content snapshot
  files: string[];               // repo-relative paths changed
  stats: { path: string; add: number; del: number; status: 'added' | 'modified' | 'deleted' }[];
}

export interface GitState {
  init: boolean;
  root: string;      // repo root path
  branch: string;
  branches: Record<string, string | null>; // branch name → head hash (null = unborn)
  commits: Record<string, GitCommit>;
  order: string[];   // commit hashes in creation order
  index: Record<string, string>;  // abs path → staged content snapshot
  headHash: string | null;
  staged: string[];  // derived: abs paths whose staged content differs from HEAD
  dirty: string[];   // derived: abs paths modified/untracked vs index
}

export interface Pkg {
  name: string;
  version: string;
  size: string;
}

export interface EnvState {
  fs: FsNode;            // root = /home/user, displayed as ~
  cwd: string;           // absolute path
  git: GitState;
  packages: Pkg[];
  seq: number;           // id counter
  user: string;
  host: string;
  history: string[];
  vars: Record<string, string>;
  aliases: Record<string, string>;
  promptTheme?: string;
  installedBrew?: Record<string, { version: string; bin: string; formula: string; desc: string; installedAt: number }>;
  lastExit?: number;     // $?
  clipboard?: string;    // pbcopy / pbpaste
  pid?: number;          // $$ — fake but stable session pid
  pushdStack?: string[]; // directory stack
}

/* ------------------------------------------------------------------ */
/* Terminal output                                                     */
/* ------------------------------------------------------------------ */

export type TermColor =
  | 'dim' | 'out' | 'err' | 'ok' | 'info'
  | 'amber' | 'cyan' | 'green' | 'rose' | 'violet' | 'blue' | 'fg';

export interface TermSeg { t: string; c?: TermColor; b?: boolean }
export interface TermLine { segs: TermSeg[] }

export interface TermBlock {
  id: number;
  kind: 'motd' | 'cmd';
  prompt?: TermSeg[];
  cmd?: string;
  lines: TermLine[];
}

/* ------------------------------------------------------------------ */
/* Visual events (emitted by the interpreter, scheduled by the app)    */
/* ------------------------------------------------------------------ */

export interface NetworkTimings { dns: number; tcp: number; tls: number; ttfb: number; total: number }

export interface NetworkPayload {
  host: string;
  path: string;
  method: string;
  status: number;
  statusText: string;
  mime: string;
  size: string;
  timings: NetworkTimings;
  outFile?: string;
  mode?: 'http' | 'ping' | 'ssh' | 'traceroute' | 'dig';
  ip?: string;
  hops?: { hop: number; host: string; ip: string; time: string }[];
  /** first lines of the (simulated) response body — shown in the stage overlay */
  bodyPreview?: string[];
}

export interface PipelineStageInfo { name: string; arg: string }
export interface PipelinePayload { stages: PipelineStageInfo[]; output: string[] }

export interface DiffHunkView { header: string; lines: { t: string; c: 'add' | 'del' | 'ctx' }[] }
export interface DiffFileView {
  path: string;
  status: 'added' | 'deleted' | 'modified';
  add: number;
  del: number;
  hunks: DiffHunkView[];
}
export interface GitBranchView { name: string; hash: string | null; current: boolean }
export interface GitCommitView { hash: string; msg: string; files: string[]; stats: GitCommit['stats'] }

export interface GitPayload {
  mode: 'init' | 'add' | 'commit' | 'branch' | 'diff' | 'checkout' | 'push';
  root?: string;
  branch: string;
  files: string[];
  commit?: GitCommitView;
  commits: GitCommitView[];         // history of current branch, newest first
  branches: GitBranchView[];
  diffFiles?: DiffFileView[];       // real content diff hunks
  diffLabel?: string;
  changedFiles?: { path: string; action: 'added' | 'modified' | 'deleted' }[];
  pushInfo?: { remote: string; branch: string; from: string | null; to: string; objects: number };
}

export interface NpmPayload {
  pkgs: Pkg[];
  added: number;
  total: string;
  secs: string;
}

export type StageKind = 'network' | 'pipeline' | 'git' | 'npm';
export type StagePayload = NetworkPayload | PipelinePayload | GitPayload | NpmPayload;

export type LogTag = 'fs' | 'net' | 'git' | 'npm' | 'proc' | 'sys';

export type VizEvent =
  | { kind: 'flash'; id: string; color: string; label?: string; delay: number }
  | { kind: 'packet'; from: string; to: string; color: string; label?: string; delay: number }
  | { kind: 'stage'; stage: StageKind; payload: StagePayload; duration: number; delay: number }
  | { kind: 'proc'; name: string; duration: number; delay: number }
  | { kind: 'log'; tag: LogTag; text: string; color?: string; delay: number }
  | { kind: 'preview'; nodeId: string; path: string; delay: number }
  | { kind: 'highlight'; ids: string[]; color: string; duration: number; delay: number }
  | { kind: 'script'; delay: number };

export interface ActivePreview {
  nodeId: string;
  path: string;
  name: string;
  content: string;
}

export interface ExecResult {
  env: EnvState;
  lines: TermLine[];
  events: VizEvent[];
  clear?: boolean;
}

/* ------------------------------------------------------------------ */
/* Transient animation records (app-level)                             */
/* ------------------------------------------------------------------ */

export interface FlashFx {
  key: number;
  x: number; y: number;
  color: string;
  label?: string;
  dur: number;
}

export interface PacketFx {
  key: number;
  xs: number[]; ys: number[];
  color: string;
  label?: string;
  dur: number;
}

export interface ProcFx {
  pid: number;
  name: string;
  cpuDur: number;
  until: number;
}

export interface LogEntry {
  id: number;
  time: string;
  tag: LogTag;
  text: string;
  color?: string;
}

export interface StageFx {
  id: number;
  kind: StageKind;
  payload: StagePayload;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface LaidNode {
  id: string;
  node: FsNode;
  x: number; y: number;
  depth: number;
  parentId: string | null;
  path: string;
}

export interface LayoutResult {
  nodes: LaidNode[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
  nodeMap: Map<string, LaidNode>;
  pathMap: Map<string, LaidNode>;
}

