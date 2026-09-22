/* Command-line → preview stage classifier.
 * Mirrors the sandbox interpreter's mapping so the SAME StagePanels
 * components light up for real commands. */

export type StageKind = 'network' | 'pipeline' | 'git' | 'npm';

export interface Classified {
  kind: StageKind | null;
  gitSub?: string;
  detail: string;
}

const GIT_SUBS = ['init','add','commit','status','log','diff','branch','checkout','switch','show','push','rm','pull','merge'];
const NET_CMDS = new Set(['curl', 'wget', 'ping', 'ssh', 'scp', 'rsync', 'dig', 'nslookup', 'host', 'traceroute', 'nc', 'ncat']);
const PKG_CMDS = new Set(['npm', 'yarn', 'pnpm', 'pip', 'pip3', 'brew', 'port']);

export function classify(cmdLine: string): Classified {
  const line = cmdLine.trim();
  const head = line.split(/\s+/)[0] ?? '';

  if (head === 'git') {
    const sub = line.split(/\s+/)[1] ?? '';
    const known = GIT_SUBS.includes(sub) ? sub : sub;
    return { kind: 'git', gitSub: known || 'status', detail: `git ${sub}` };
  }
  if (NET_CMDS.has(head)) return { kind: 'network', detail: line };
  if (PKG_CMDS.has(head)) return { kind: 'npm', detail: line };
  if (line.includes('|')) {
    const stages = line.split('|').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    return { kind: 'pipeline', detail: stages.join(' → ') };
  }
  return { kind: null, detail: line };
}
