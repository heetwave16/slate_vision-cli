import type { TermSeg } from '../engine/types';

/**
 * Tokenize a shell command input and return colored TermSeg[] segments
 * mimicking real terminal syntax highlighting (zsh-syntax-highlighting style).
 *
 * Colors:
 *  - Known command  → 'ok'    (green)
 *  - Unknown command→ 'err'   (red)
 *  - Flags (-x, --x)→ 'info'  (cyan)
 *  - Strings ("…",'…')→ 'amber' (yellow)
 *  - Operators (|,>,>>)→ 'dim'
 *  - Paths / args   → 'fg'   (primary)
 *  - Subcommands    → 'violet'
 */

// Commands that take subcommands
const SUB_CMD_PARENTS: Record<string, Set<string>> = {
  git: new Set(['init', 'add', 'commit', 'status', 'log', 'branch', 'diff', 'push', 'pull', 'clone', 'checkout', 'merge', 'rebase', 'stash', 'remote', 'fetch', 'reset', 'tag']),
  npm: new Set(['init', 'install', 'run', 'ls', 'test', 'start', 'publish', 'uninstall', 'update', 'audit', 'ci']),
  docker: new Set(['build', 'run', 'ps', 'images', 'pull', 'push', 'exec', 'stop', 'rm', 'rmi', 'compose']),
  brew: new Set(['install', 'list', 'info', 'uninstall', 'update', 'search', 'cleanup', 'help']),
  omz: new Set(['install', 'theme', 'list', 'plugin', 'update', 'help']),
  storage: new Set(['status', 'export', 'import', 'clear', 'info', 'reset', 'backup']),
};

/**
 * Quick tokenizer — splits shell input into typed tokens preserving whitespace.
 */
function shellTokenize(input: string): { text: string; kind: 'word' | 'ws' | 'op' | 'string' }[] {
  const tokens: { text: string; kind: 'word' | 'ws' | 'op' | 'string' }[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Whitespace
    if (input[i] === ' ' || input[i] === '\t') {
      let j = i;
      while (j < len && (input[j] === ' ' || input[j] === '\t')) j++;
      tokens.push({ text: input.slice(i, j), kind: 'ws' });
      i = j;
      continue;
    }

    // Quoted strings
    if (input[i] === '"' || input[i] === "'") {
      const q = input[i];
      let j = i + 1;
      while (j < len && input[j] !== q) {
        if (input[j] === '\\' && j + 1 < len) j++;
        j++;
      }
      if (j < len) j++; // consume closing quote
      tokens.push({ text: input.slice(i, j), kind: 'string' });
      i = j;
      continue;
    }

    // Two-char operators
    if (i + 1 < len) {
      const two = input.slice(i, i + 2);
      if (two === '>>' || two === '&&' || two === '||') {
        tokens.push({ text: two, kind: 'op' });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if (input[i] === '|' || input[i] === '>' || input[i] === ';' || input[i] === '&') {
      tokens.push({ text: input[i], kind: 'op' });
      i++;
      continue;
    }

    // Words (commands, args, flags, paths)
    let j = i;
    while (j < len && input[j] !== ' ' && input[j] !== '\t' && input[j] !== '"' && input[j] !== "'" && input[j] !== '|' && input[j] !== '>' && input[j] !== ';' && input[j] !== '&') {
      j++;
    }
    tokens.push({ text: input.slice(i, j), kind: 'word' });
    i = j;
  }

  return tokens;
}

export function highlightShellInput(input: string, knownCommands: Set<string>): TermSeg[] {
  if (!input) return [];

  const tokens = shellTokenize(input);
  const segs: TermSeg[] = [];

  // Track position in logical command segments (reset after operators like |, ;, &&)
  let wordIndex = 0; // index of word-type token within current command segment
  let currentCommand = ''; // the first word of the current segment

  for (const tok of tokens) {
    if (tok.kind === 'ws') {
      segs.push({ t: tok.text, c: 'fg' });
      continue;
    }

    if (tok.kind === 'op') {
      segs.push({ t: tok.text, c: 'dim', b: true });
      // Reset for next command segment after pipe/semicolon/&&
      wordIndex = 0;
      currentCommand = '';
      continue;
    }

    if (tok.kind === 'string') {
      segs.push({ t: tok.text, c: 'amber' });
      if (wordIndex === 0) {
        currentCommand = tok.text;
        wordIndex++;
      } else {
        wordIndex++;
      }
      continue;
    }

    // tok.kind === 'word'
    if (wordIndex === 0) {
      // First word = command name
      currentCommand = tok.text;
      const isKnown = knownCommands.has(tok.text);
      segs.push({ t: tok.text, c: isKnown ? 'ok' : 'err', b: true });
      wordIndex++;
      continue;
    }

    if (wordIndex === 1 && SUB_CMD_PARENTS[currentCommand]) {
      // Second word could be a subcommand
      const subs = SUB_CMD_PARENTS[currentCommand];
      if (subs.has(tok.text)) {
        segs.push({ t: tok.text, c: 'info', b: true });
        wordIndex++;
        continue;
      }
    }

    // Flags
    if (tok.text.startsWith('-')) {
      segs.push({ t: tok.text, c: 'info' });
      wordIndex++;
      continue;
    }

    // Variable assignments in export/env (KEY=VAL)
    if ((currentCommand === 'export' || currentCommand === 'alias') && tok.text.includes('=')) {
      const eqIdx = tok.text.indexOf('=');
      const key = tok.text.slice(0, eqIdx + 1);
      const val = tok.text.slice(eqIdx + 1);
      segs.push({ t: key, c: 'info' });
      if (val) segs.push({ t: val, c: 'amber' });
      wordIndex++;
      continue;
    }

    // Default: argument / path
    segs.push({ t: tok.text, c: 'fg' });
    wordIndex++;
  }

  return segs;
}
