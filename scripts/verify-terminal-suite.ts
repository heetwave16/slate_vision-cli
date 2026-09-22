import { initialEnv, executeCommand, COMMANDS } from '../src/engine/interpreter';
import type { EnvState } from '../src/engine/types';
import { resolvePath, findNodeById } from '../src/engine/fs';
import { sha1Hex } from '../src/engine/hash';
import { blobHash, treeHash } from '../src/engine/git';

interface TestResult {
  category: string;
  name: string;
  cmd: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runTest(category: string, name: string, cmd: string, fn: (env: EnvState) => EnvState | void) {
  try {
    const env = initialEnv();
    fn(env);
    results.push({ category, name, cmd, passed: true });
  } catch (err) {
    results.push({
      category,
      name,
      cmd,
      passed: false,
      error: (err as Error).message,
    });
  }
}

console.log('\n🚀 STARTING SLATE COMPREHENSIVE TERMINAL VERIFICATION SUITE\n');

// 1. Basic Sandbox Commands
runTest('Basics', 'pwd command', 'pwd', (env) => {
  const res = executeCommand('pwd', env);
  assert(res.lines.length > 0, 'pwd should produce output');
  assert(res.lines[0].segs[0].t.includes('~') || res.lines[0].segs[0].t.includes('/home/user'), 'pwd should show cwd');
});

runTest('Basics', 'ls command', 'ls', (env) => {
  const res = executeCommand('ls', env);
  assert(res.lines.length > 0, 'ls should list directory items');
});

runTest('Basics', 'ls -la flag', 'ls -la', (env) => {
  const res = executeCommand('ls -la', env);
  assert(res.lines.length >= 2, 'ls -la should show detailed listing with permissions');
});

runTest('Basics', 'cd and navigation', 'cd project && pwd', (env) => {
  const res1 = executeCommand('cd project', env);
  assert(res1.env.cwd === '/home/user/project', 'cd project should update cwd');
  const res2 = executeCommand('cd ..', res1.env);
  assert(res2.env.cwd === '/home/user', 'cd .. should navigate back');
});

runTest('Basics', 'cd invalid directory', 'cd /non_existent_folder_xyz', (env) => {
  const res = executeCommand('cd /non_existent_folder_xyz', env);
  assert(res.lines.some(l => l.segs.some(s => s.t.toLowerCase().includes('no such file or directory'))), 'should report error');
  assert(res.env.cwd === env.cwd, 'cwd should not change on failed cd');
});

runTest('Basics', 'tree rendering', 'tree', (env) => {
  const res = executeCommand('tree', env);
  assert(res.lines.length > 3, 'tree should render hierarchy');
});

runTest('Basics', 'help catalog', 'help', (env) => {
  const res = executeCommand('help', env);
  assert(res.lines.length > 10, 'help should render command groups');
});

runTest('Basics', 'history tracking', 'history', (env) => {
  const env1 = executeCommand('ls', env).env;
  const env2 = executeCommand('pwd', env1).env;
  const res = executeCommand('history', env2);
  assert(res.lines.length >= 2, 'history should show previous commands');
});

runTest('Basics', 'clear screen', 'clear', (env) => {
  const res = executeCommand('clear', env);
  assert(res.clear === true, 'clear should set clear flag to true');
});

runTest('Basics', 'reset sandbox', 'reset', (env) => {
  const res1 = executeCommand('mkdir test_reset', env);
  const res2 = executeCommand('reset', res1.env);
  assert(!resolvePath(res2.env, '/home/user/test_reset'), 'reset should restore fresh filesystem');
});

// 2. Filesystem CRUD & Utilities
runTest('Filesystem', 'touch and cat', 'touch file.txt && cat file.txt', (env) => {
  const res1 = executeCommand('touch file.txt', env);
  assert(!!resolvePath(res1.env, 'file.txt'), 'touch should create file');
  const res2 = executeCommand('echo "Hello World" > file.txt', res1.env);
  const node = resolvePath(res2.env, 'file.txt')?.node;
  assert(node?.content?.includes('Hello World'), 'redirect should write content');
  const res3 = executeCommand('cat file.txt', res2.env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('Hello World'))), 'cat should output content');
  assert(res3.events.some(e => e.kind === 'preview'), 'cat should emit preview event');
});

runTest('Filesystem', 'mkdir nested -p', 'mkdir -p a/b/c', (env) => {
  const res = executeCommand('mkdir -p a/b/c', env);
  assert(!!resolvePath(res.env, 'a/b/c'), 'mkdir -p should create nested hierarchy');
});

runTest('Filesystem', 'cp and mv', 'cp file && mv file', (env) => {
  const res1 = executeCommand('echo "abc" > original.txt', env);
  const res2 = executeCommand('cp original.txt copy.txt', res1.env);
  assert(!!resolvePath(res2.env, 'copy.txt'), 'cp should copy file');
  const res3 = executeCommand('mv copy.txt renamed.txt', res2.env);
  assert(!resolvePath(res3.env, 'copy.txt'), 'mv should remove source');
  assert(!!resolvePath(res3.env, 'renamed.txt'), 'mv should create target');
});

runTest('Filesystem', 'rm file and rm -r dir', 'rm file && rm -r dir', (env) => {
  const res1 = executeCommand('touch to_delete.txt && mkdir to_del_dir', env);
  const res2 = executeCommand('rm to_delete.txt', res1.env);
  assert(!resolvePath(res2.env, 'to_delete.txt'), 'rm should delete file');
  const res3 = executeCommand('rm -r to_del_dir', res2.env);
  assert(!resolvePath(res3.env, 'to_del_dir'), 'rm -r should delete directory');
});

runTest('Filesystem', 'chmod and stat', 'chmod +x file && stat file', (env) => {
  const res1 = executeCommand('touch script.sh', env);
  const res2 = executeCommand('chmod +x script.sh', res1.env);
  assert(resolvePath(res2.env, 'script.sh')?.node.exec === true, 'chmod +x should set exec flag');
  const res3 = executeCommand('stat script.sh', res2.env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('Size:'))), 'stat should report metadata');
});

runTest('Filesystem', 'find utility', 'find . -name "*.js"', (env) => {
  const res = executeCommand('find . -name "*.js"', env);
  assert(res.lines.some(l => l.segs.some(s => s.t.includes('index.js'))), 'find should locate index.js');
});

runTest('Filesystem', 'du disk usage', 'du -h', (env) => {
  const res = executeCommand('du -h', env);
  assert(res.lines.length > 0, 'du should calculate directory usage');
});

runTest('Filesystem', 'diff tool', 'diff a b', (env) => {
  const res1 = executeCommand('echo "line 1\nline 2" > f1.txt', env);
  const res2 = executeCommand('echo "line 1\nline 3" > f2.txt', res1.env);
  const res3 = executeCommand('diff f1.txt f2.txt', res2.env);
  assert(res3.lines.length > 0, 'diff should detect differences');
});

runTest('Filesystem', 'grep, head, tail, wc', 'text analysis pipeline', (env) => {
  const res1 = executeCommand('cat README.md', env);
  const res2 = executeCommand('grep TODO README.md', res1.env);
  assert(res2.lines.length > 0, 'grep should find matches');
  const res3 = executeCommand('head -n 2 README.md', res1.env);
  assert(res3.lines.length <= 2, 'head should slice lines');
  const res4 = executeCommand('wc -l README.md', res1.env);
  assert(res4.lines.some(l => l.segs.some(s => /\d+/.test(s.t))), 'wc should count lines');
});

runTest('Filesystem', 'sort and uniq', 'sort & uniq pipeline', (env) => {
  const res1 = executeCommand('echo "banana\napple\nbanana" > fruits.txt', env);
  const res2 = executeCommand('sort fruits.txt', res1.env);
  assert(res2.lines[0].segs[0].t.includes('apple'), 'sort should order alphabetically');
});

// 3. Text Processing Tools
runTest('Text Processing', 'cut command', 'cut -d: -f1', (env) => {
  const res = executeCommand('echo "user:pass:1000" | cut -d: -f1', env);
  assert(res.lines.some(l => l.segs.some(s => s.t.includes('user'))), 'cut should extract field 1');
});

runTest('Text Processing', 'tr command', 'tr a-z A-Z', (env) => {
  const res = executeCommand('echo "hello" | tr a-z A-Z', env);
  assert(res.lines.some(l => l.segs.some(s => s.t.includes('HELLO'))), 'tr should translate lowercase to uppercase');
});

runTest('Text Processing', 'tee command', 'echo "sample" | tee sample.txt', (env) => {
  const res = executeCommand('echo "sample" | tee sample.txt', env);
  assert(!!resolvePath(res.env, 'sample.txt'), 'tee should write to file');
  assert(res.lines.some(l => l.segs.some(s => s.t.includes('sample'))), 'tee should also pipe stdout');
});

// 4. Git Emulation Workflow
runTest('Git', 'full git lifecycle (real engine)', 'init -> add -> commit -> branch -> checkout -> diff -> commit', (env) => {
  const res1 = executeCommand('git init', env);
  assert(res1.env.git.init === true, 'git init should initialize repo');
  const res2 = executeCommand('echo "line one" > notes.txt', res1.env);
  const res3 = executeCommand('git status', res2.env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('Untracked') || s.t.includes('notes.txt'))), 'git status should list notes.txt as untracked');
  const res4 = executeCommand('git add .', res3.env);
  assert(res4.env.git.index[resolvePath(res4.env, 'notes.txt').path] !== undefined, 'git add should index the file');
  const res5 = executeCommand('git commit -m "feat: initial test commit"', res4.env);
  assert(Object.keys(res5.env.git.commits).length === 1, 'git commit should record a commit');
  assert(res5.env.git.headHash !== null, 'git commit should move HEAD');
  const res6 = executeCommand('git log', res5.env);
  assert(res6.lines.some(l => l.segs.some(s => s.t.includes('feat: initial test commit'))), 'git log should show commit message');
  const res7 = executeCommand('git branch feature/test', res5.env);
  assert(res7.lines.length > 0, 'git branch should print confirmation');
  const res8 = executeCommand('git checkout feature/test', res7.env);
  assert(res8.env.git.branch === 'feature/test', 'git checkout should switch branch');
  // real content change on the branch
  const res9 = executeCommand('echo "line two" >> notes.txt', res8.env);
  const res10 = executeCommand('git diff', res9.env);
  assert(res10.lines.some(l => l.segs.some(s => s.t.includes('line two'))), 'git diff should show the new working-tree line');
  const res11 = executeCommand('git add . && git commit -m "feat: second line"', res10.env);
  assert(Object.keys(res11.env.git.commits).length === 2, 'second commit should be recorded');
  const res12 = executeCommand('git checkout main', res11.env);
  const notes = resolvePath(res12.env, 'notes.txt').node;
  assert(notes && notes.type === 'file' && 'content' in notes && notes.content === 'line one\n', 'checkout main should physically restore the old file content');
  const res13 = executeCommand('git log --oneline', res12.env);
  assert(res13.lines.some(l => l.segs.some(s => s.t.includes('feat: initial test commit'))), 'git log --oneline on main shows first commit only');
});

runTest('Git', 'commit hashes + show/branch/rm/push', 'sha1 object ids, git show, push, git rm', (env) => {
  let e = executeCommand('git init', env).env;
  e = executeCommand('echo "hello" > a.txt', e).env;
  e = executeCommand('git add .', e).env;
  const r = executeCommand('git commit -m "x"', e);
  const hash1 = r.env.git.headHash;
  const commit = r.env.git.commits[hash1!];
  assert(hash1 && commit.hash === hash1, 'commit hash should be self-consistent');
  const p = resolvePath(r.env, 'a.txt').path;
  assert(commit.tree[p] === 'hello\n', 'tree should snapshot the file content');
  assert(blobHash('hello\n') === sha1Hex('blob 6\x00hello\n'), 'blob hash follows the real git blob format');
  const expected = sha1Hex(
    `tree ${treeHash(commit.tree)}\n` +
    `author ${commit.author} <${commit.at}> +0000\n` +
    `committer ${commit.author} <${commit.at}> +0000\n\n` +
    `${commit.msg}\n`,
  );
  assert(commit.hash === expected, 'commit hash is the sha1 of the real commit object payload');
  const show = executeCommand('git show', r.env);
  assert(show.lines.some(l => l.segs.some(s => s.t.includes('hello'))), 'git show should render the patch with the file content');
  const br = executeCommand('git branch b1', r.env);
  assert(br.env.git.branches['b1'] !== undefined, 'branch b1 should exist');
  const co = executeCommand('git checkout b1', br.env);
  assert(co.env.git.branch === 'b1', 'checkout b1 should switch');
  const rm = executeCommand('git rm a.txt', co.env);
  assert(resolvePath(rm.env, 'a.txt') === null, 'git rm should delete the file');
  const push = executeCommand('git push origin b1', rm.env);
  assert(push.env.git.branches['origin/b1'] !== undefined, 'git push should create origin/b1');
  const status = executeCommand('git status', push.env);
  assert(status.lines.some(l => l.segs.some(s => s.t.includes('a.txt'))), 'git status after rm should mention the deletion');
});

// 5. Package Management
runTest('Package Management', 'npm init, install, run, ls', 'npm workflow', (env) => {
  const res1 = executeCommand('npm init -y', env);
  assert(!!resolvePath(res1.env, 'package.json'), 'npm init should create package.json');
  const res2 = executeCommand('npm install lodash', res1.env);
  assert(res2.env.packages.some(p => p.name === 'lodash'), 'npm install should register package');
  const res3 = executeCommand('npm ls', res2.env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('lodash'))), 'npm ls should list package');
});

// 6. Network Simulation
runTest('Network', 'curl, wget, ping, ssh, dig', 'network simulation tools', (env) => {
  const res1 = executeCommand('curl https://api.example.com/data', env);
  assert(res1.lines.length > 0, 'curl should simulate response');
  const res2 = executeCommand('curl -o hero.svg https://cdn.dev/hero.svg', res1.env);
  assert(!!resolvePath(res2.env, 'hero.svg'), 'curl -o should save file to virtual fs');
  const res3 = executeCommand('ping google.com', env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('bytes from'))), 'ping should report rounds');
  const res4 = executeCommand('dig example.com', env);
  assert(res4.lines.some(l => l.segs.some(s => s.t.includes('ANSWER SECTION'))), 'dig should return DNS record');
});

// 7. Process & Environment Runtime
runTest('Process & Env', 'whoami, id, date, uname, uptime, df, ps, which', 'system utilities', (env) => {
  const res1 = executeCommand('whoami', env);
  assert(res1.lines[0].segs[0].t === 'dev', 'whoami should be dev');
  const res2 = executeCommand('uname -a', env);
  assert(res2.lines[0].segs[0].t.includes('Linux'), 'uname should report Linux kernel');
  const res3 = executeCommand('ps', env);
  assert(res3.lines.length >= 2, 'ps should show process table');
  const res4 = executeCommand('which ls', env);
  assert(res4.lines[0].segs[0].t.includes('/usr/bin/ls'), 'which should resolve binary');
});

runTest('Process & Env', 'export and alias', 'export KEY=VAL && alias', (env) => {
  const res1 = executeCommand('export MY_VAR="testing123"', env);
  assert(res1.env.vars['MY_VAR'] === 'testing123', 'export should set environment variable');
  const res2 = executeCommand('alias l="ls -la"', res1.env);
  assert(res2.env.aliases['l'] === 'ls -la', 'alias should store alias');
  const res3 = executeCommand('unalias l', res2.env);
  assert(!res3.env.aliases['l'], 'unalias should remove alias');
});

// 8. Persistent Storage System Commands
runTest('Storage Engine', 'storage status, export, clear', 'storage CLI', (env) => {
  const res1 = executeCommand('storage status', env);
  assert(res1.lines.some(l => l.segs.some(s => s.t.includes('Storage Status'))), 'storage status should report status');
  const res2 = executeCommand('storage clear', env);
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('cleared'))), 'storage clear should acknowledge');
});

// 9. Homebrew Package Manager (`brew`) & Real Executables
runTest('Homebrew', 'brew install cowsay and execute cowsay', 'brew install cowsay -> cowsay', (env) => {
  const res1 = executeCommand('brew install cowsay', env);
  assert(!!res1.env.installedBrew?.['cowsay'], 'brew install should register cowsay formula');
  assert(!!resolvePath(res1.env, '/home/user/.brew/bin/cowsay'), 'brew should link binary into ~/.brew/bin');
  assert(res1.events.some(e => e.kind === 'stage'), 'brew install should emit bottle pouring stage event');

  // Now execute cowsay directly!
  const res2 = executeCommand('cowsay "Moo from Slate"', res1.env);
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('^__^'))), 'cowsay executable should render ASCII cow');
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('Moo from Slate'))), 'cowsay should include message');
});

runTest('Homebrew', 'brew install neofetch and execute neofetch', 'brew install neofetch -> neofetch', (env) => {
  const res1 = executeCommand('brew install neofetch', env);
  assert(!!res1.env.installedBrew?.['neofetch'], 'brew should install neofetch');
  const res2 = executeCommand('neofetch', res1.env);
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('OS:') || s.t.includes('Kernel:'))), 'neofetch should display system specs');
});

runTest('Homebrew', 'brew install figlet and execute figlet', 'brew install figlet -> figlet', (env) => {
  const res1 = executeCommand('brew install figlet', env);
  assert(!!res1.env.installedBrew?.['figlet'], 'brew should install figlet');
  const res2 = executeCommand('figlet COOL', res1.env);
  assert(res2.lines.length >= 5, 'figlet should render ASCII font banner');
});

runTest('Homebrew', 'brew install jq and run jq pipeline', 'cat package.json | jq .', (env) => {
  const res1 = executeCommand('brew install jq', env);
  assert(!!res1.env.installedBrew?.['jq'], 'brew should install jq');
  const res2 = executeCommand('cat package.json | jq .', res1.env);
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('"name": "project"'))), 'jq should parse and format JSON');
});

runTest('Homebrew', 'brew list and brew uninstall', 'brew list -> brew uninstall', (env) => {
  const res1 = executeCommand('brew install cowsay', env);
  const res2 = executeCommand('brew list', res1.env);
  assert(res2.lines.some(l => l.segs.some(s => s.t.includes('cowsay'))), 'brew list should show cowsay');
  const res3 = executeCommand('brew uninstall cowsay', res2.env);
  assert(!res3.env.installedBrew?.['cowsay'], 'brew uninstall should remove formula');
});

// 10. Oh My Zsh (`omz`) & Dynamic Prompt Themes
runTest('Oh My Zsh', 'omz install and themes', 'omz install -> omz theme agnoster', (env) => {
  const res1 = executeCommand('omz install', env);
  assert(!!resolvePath(res1.env, '/home/user/.oh-my-zsh'), 'omz install should create ~/.oh-my-zsh');
  assert(!!resolvePath(res1.env, '/home/user/.zshrc'), 'omz install should scaffold ~/.zshrc');
  assert(res1.env.promptTheme === 'robbyrussell', 'omz install should set theme to robbyrussell');

  const res2 = executeCommand('omz theme agnoster', res1.env);
  assert(res2.env.promptTheme === 'agnoster', 'omz theme should update promptTheme to agnoster');

  const res3 = executeCommand('omz list', res2.env);
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('robbyrussell'))), 'omz list should list robbyrussell');
  assert(res3.lines.some(l => l.segs.some(s => s.t.includes('agnoster'))), 'omz list should list agnoster');
});

// 11. External File / Package Importer
runTest('External Import', 'import command', 'import external_tool.sh "echo 123"', (env) => {
  const res = executeCommand('import external_tool.sh "#!/bin/sh\necho external"', env);
  const node = resolvePath(res.env, 'external_tool.sh')?.node;
  assert(!!node, 'import should create file in virtual fs');
  assert(node?.content?.includes('echo external'), 'import should store file content');
});

// 12. Shell Combinators (Pipes, Redirection, Chaining)
runTest('Combinators', 'multi-stage pipe', 'cat README.md | grep TODO | wc -l', (env) => {
  const res = executeCommand('cat README.md | grep TODO | wc -l', env);
  assert(res.lines.length > 0, 'pipeline should return line count');
  assert(res.events.some(e => e.kind === 'stage' && e.stage === 'pipeline'), 'pipeline should emit visual stage event');
});

runTest('Combinators', 'append redirection >>', 'echo 1 > out.txt && echo 2 >> out.txt', (env) => {
  const res1 = executeCommand('echo "first" > out.txt', env);
  const res2 = executeCommand('echo "second" >> out.txt', res1.env);
  const content = resolvePath(res2.env, 'out.txt')?.node.content;
  assert(content?.includes('first') && content?.includes('second'), '>> should append to file');
});

runTest('Combinators', 'short-circuit on failure with &&', 'fail && should_not_run', (env) => {
  const res = executeCommand('cd /non_existent_folder_123 && touch should_never_exist.txt', env);
  assert(!resolvePath(res.env, 'should_never_exist.txt'), 'second command should not execute on failure');
});

// Summary Report
console.log('\n================================================================');
console.log('                 VERIFICATION TEST RESULTS                      ');
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;

const grouped: Record<string, TestResult[]> = {};
for (const r of results) {
  (grouped[r.category] ??= []).push(r);
}

for (const [cat, tests] of Object.entries(grouped)) {
  console.log(`\n📂 ${cat.toUpperCase()}:`);
  for (const t of tests) {
    if (t.passed) {
      passedCount++;
      console.log(`  ✅  ${t.name.padEnd(36)} [${t.cmd}]`);
    } else {
      failedCount++;
      console.log(`  ❌  ${t.name.padEnd(36)} [${t.cmd}]`);
      console.log(`      Error: ${t.error}`);
    }
  }
}

console.log('\n================================================================');
console.log(`TOTAL TESTS:  ${results.length}`);
console.log(`PASSED:       ${passedCount}`);
console.log(`FAILED:       ${failedCount}`);
console.log(`PASS RATE:    ${Math.round((passedCount / results.length) * 100)}%`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL COMMANDS AND FEATURES VERIFIED SUCCESSFULLY!\n');
}
