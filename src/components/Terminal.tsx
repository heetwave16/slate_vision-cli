import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { EnvState, TermBlock, TermColor, TermLine, TermSeg } from '../engine/types';
import { COMMANDS } from '../engine/interpreter';
import { displayPath, resolvePath } from '../engine/fs';
import { highlightShellInput } from '../utils/syntaxHighlight';
import { cn } from '../utils/cn';

interface Props {
  blocks: TermBlock[];
  input: string;
  setInput: (s: string) => void;
  onExecute: (line: string) => void;
  onClear: () => void;
  onHint: (lines: TermLine[]) => void;
  onCancelDemo: () => void;
  demoRunning: boolean;
  env: EnvState;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const Segs = memo(function Segs({ segs }: { segs: TermSeg[] }) {
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} className={cn(s.c ? `c-${s.c}` : 'c-out', s.b && 'b-bold')}>{s.t}</span>
      ))}
    </>
  );
});

export function getPromptSegs(env: EnvState): TermSeg[] {
  const theme = env.promptTheme ?? 'default';
  const cwd = displayPath(env.cwd);
  const gitInfo = env.git.init
    ? `git:(${env.git.branch})${env.git.dirty.length > 0 ? '*' : ''}`
    : '';

  if (theme === 'robbyrussell') {
    const segs: TermSeg[] = [
      { t: '➜  ', c: env.git.dirty.length > 0 ? 'amber' : 'green', b: true },
      { t: cwd, c: 'cyan', b: true },
      { t: ' ', c: 'dim' },
    ];
    if (gitInfo) segs.splice(2, 0, { t: ' ' + gitInfo, c: env.git.dirty.length > 0 ? 'amber' : 'info' });
    return segs;
  }

  if (theme === 'agnoster') {
    return [
      { t: ` ${env.user}@${env.host} `, c: 'violet', b: true },
      { t: ' ', c: 'dim' },
      { t: `${cwd} `, c: 'info', b: true },
      { t: '', c: 'dim' },
      ...(gitInfo ? [{ t: ` ${gitInfo} `, c: 'amber' as const, b: true }] : []),
      { t: ' ', c: 'fg' },
    ];
  }

  if (theme === 'powerlevel10k') {
    return [
      { t: `${env.user} `, c: 'ok', b: true },
      { t: `${cwd} `, c: 'cyan', b: true },
      ...(gitInfo ? [{ t: `on ${env.git.branch} `, c: 'amber' as const }] : []),
      { t: '❯ ', c: 'green', b: true },
    ];
  }

  if (theme === 'minimal') {
    return [
      { t: cwd, c: 'info', b: true },
      { t: ' ❯ ', c: 'green', b: true },
    ];
  }

  // Default theme
  return [
    { t: `${env.user}@${env.host}`, c: 'fg', b: true },
    { t: ':', c: 'dim' },
    { t: cwd, c: 'info' },
    { t: ' $ ', c: 'dim' },
  ];
}

const Prompt = memo(function Prompt({ env }: { env: EnvState }) {
  const segs = useMemo(() => getPromptSegs(env), [env]);
  return (
    <span className="whitespace-pre font-mono text-[13px]">
      <Segs segs={segs} />
    </span>
  );
});

const GIT_SUBS = ['init', 'add', 'commit', 'status', 'log', 'diff', 'branch', 'checkout', 'switch', 'show', 'push', 'rm', '-b', '-p', '--oneline', '--staged'];
const NPM_SUBS = ['init -y', 'install', 'run', 'ls'];
const BREW_SUBS = ['install', 'list', 'info', 'uninstall', 'update'];
const OMZ_SUBS = ['install', 'theme', 'list'];
const STORAGE_SUBS = ['status', 'export', 'import', 'clear'];
const FORMULAS = ['cowsay', 'neofetch', 'figlet', 'jq', 'bat', 'ripgrep', 'rg', 'htop', 'brew', 'omz', 'storage', 'import'];
const TOP = [...new Set([...COMMANDS.map(c => c.name.split(' ')[0]), ...FORMULAS])];

const SUGGESTIONS = [
  'brew install cowsay',
  'cowsay "Hello Slate!"',
  'neofetch',
  'omz theme agnoster',
  'cat README.md',
  'git status',
  'storage status',
];

/* Set of known top-level command names for syntax highlighting */
const KNOWN_COMMANDS = new Set(TOP);

/* Syntax-highlighted inline overlay for the command input */
const InputHighlight = memo(function InputHighlight({ input }: { input: string }) {
  const segs = useMemo(() => highlightShellInput(input, KNOWN_COMMANDS), [input]);
  if (!segs.length) return null;
  return (
    <span className="pointer-events-none whitespace-pre font-mono text-[13px] leading-[1.55]">
      {segs.map((s, i) => (
        <span key={i} className={cn(s.c ? `c-${s.c}` : 'c-out', s.b && 'b-bold')}>{s.t}</span>
      ))}
    </span>
  );
});

/* Syntax-colored command name in terminal history blocks */
export const HighlightedCmd = memo(function HighlightedCmd({ cmd }: { cmd: string }) {
  const segs = useMemo(() => highlightShellInput(cmd, KNOWN_COMMANDS), [cmd]);
  return (
    <span className="whitespace-pre">
      {segs.map((s, i) => (
        <span key={i} className={cn(s.c ? `c-${s.c}` : 'c-out', s.b && 'b-bold')}>{s.t}</span>
      ))}
    </span>
  );
});

const Terminal = memo(function Terminal({
  blocks, input, setInput, onExecute, onClear, onHint, onCancelDemo,
  demoRunning, env, inputRef,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const histIdx = useRef(-1);
  const draft = useRef('');
  const [tryOpen, setTryOpen] = useState(false);
  const tryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [blocks, input]);

  // Close try dropdown on click outside
  useEffect(() => {
    if (!tryOpen) return;
    const handler = (e: MouseEvent) => {
      if (tryRef.current && !tryRef.current.contains(e.target as Node)) {
        setTryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tryOpen]);

  const prompt = (
    <Prompt env={env} />
  );

  const complete = () => {
    if (!input || input.endsWith(' ')) return;
    const parts = input.split(' ');
    const last = parts[parts.length - 1];
    const first = parts[0];
    let candidates: string[] = [];

    if (parts.length === 1) {
      candidates = TOP.filter(c => c.startsWith(last));
    } else if (first === 'git') {
      candidates = GIT_SUBS.filter(c => c.startsWith(last)).map(c => 'git ' + c);
      if (candidates.length) { setInput(candidates.length === 1 ? candidates[0] + ' ' : input); showIfMany(candidates); return; }
    } else if (first === 'npm') {
      candidates = NPM_SUBS.filter(c => c.startsWith(last)).map(c => 'npm ' + c);
      if (candidates.length) { setInput(candidates.length === 1 ? candidates[0] + ' ' : input); showIfMany(candidates); return; }
    } else if (first === 'brew') {
      candidates = BREW_SUBS.filter(c => c.startsWith(last)).map(c => 'brew ' + c);
      if (candidates.length) { setInput(candidates.length === 1 ? candidates[0] + ' ' : input); showIfMany(candidates); return; }
    } else if (first === 'omz') {
      candidates = OMZ_SUBS.filter(c => c.startsWith(last)).map(c => 'omz ' + c);
      if (candidates.length) { setInput(candidates.length === 1 ? candidates[0] + ' ' : input); showIfMany(candidates); return; }
    } else if (first === 'storage') {
      candidates = STORAGE_SUBS.filter(c => c.startsWith(last)).map(c => 'storage ' + c);
      if (candidates.length) { setInput(candidates.length === 1 ? candidates[0] + ' ' : input); showIfMany(candidates); return; }
    }

    if (!candidates.length && parts.length > 1) {
      const slash = last.lastIndexOf('/');
      const dirPart = slash >= 0 ? last.slice(0, slash) : '.';
      const prefix = slash >= 0 ? last.slice(slash + 1) : last;
      const res = resolvePath(env, dirPart);
      if (res && res.node.type === 'dir') {
        candidates = (res.node.children ?? [])
          .filter(c => !c.phantom && c.name.startsWith(prefix))
          .map(c => {
            const base = dirPart === '.' ? '' : dirPart.replace(/\/$/, '') + '/';
            return (parts.slice(0, -1).join(' ') + ' ' + base + c.name + (c.type === 'dir' ? '/' : '')).trimStart();
          });
      }
    }

    if (candidates.length === 1) setInput(candidates[0]);
    else showIfMany(candidates);
  };

  const showIfMany = (candidates: string[]) => {
    if (candidates.length > 1) {
      onHint([{
        segs: candidates.map((c, i) => ({
          t: c.padEnd(16) + ((i + 1) % 4 === 0 ? '\n' : '  '),
          c: 'dim',
        })),
      }]);
    }
  };

  const ghostSuggestion = useMemo(() => {
    if (!input.trim() || demoRunning) return '';
    for (let i = env.history.length - 1; i >= 0; i--) {
      const h = env.history[i];
      if (h.startsWith(input) && h !== input) return h.slice(input.length);
    }
    const match = COMMANDS.find(c => c.name.startsWith(input) && c.name !== input);
    if (match) return match.name.slice(input.length);
    return '';
  }, [input, env.history, demoRunning]);

  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const line = input.trim();
      histIdx.current = -1;
      setInput('');
      if (line) onExecute(line);
    } else if (e.key === 'ArrowRight' && ghostSuggestion && inputRef.current?.selectionStart === input.length) {
      e.preventDefault();
      setInput(input + ghostSuggestion);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = env.history;
      if (!h.length) return;
      if (histIdx.current === -1) { draft.current = input; histIdx.current = h.length - 1; }
      else histIdx.current = Math.max(0, histIdx.current - 1);
      setInput(h[histIdx.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = env.history;
      if (histIdx.current === -1) return;
      histIdx.current += 1;
      if (histIdx.current >= h.length) { histIdx.current = -1; setInput(draft.current); }
      else setInput(h[histIdx.current]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (ghostSuggestion) {
        setInput(input + ghostSuggestion);
      } else {
        complete();
      }
    } else if (e.key === 'Escape') {
      if (tryOpen) { setTryOpen(false); return; }
      if (demoRunning) onCancelDemo();
      else setInput('');
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      onHint([{ segs: [{ t: '^C', c: 'err' }] }]);
      setInput('');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      onClear();
    }
  };

  const handleSuggestionClick = useCallback((cmd: string) => {
    setInput(cmd);
    setTryOpen(false);
    inputRef.current?.focus();
  }, [setInput, inputRef]);

  return (
    <div
      className="relative flex h-full flex-col bg-[var(--surface-panel)]"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Titlebar with muted window controls */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-default)] px-3 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a3f4d] transition-colors duration-150 hover:bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a3f4d] transition-colors duration-150 hover:bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a3f4d] transition-colors duration-150 hover:bg-[#28c840]" />
          </div>
          <span className="ml-1 text-[var(--text-secondary)]">
            zsh — dev@sandbox
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          {demoRunning && (
            <span className="rounded border border-[var(--border-strong)] bg-[var(--surface-hover)] px-2 py-0.5 text-[var(--semantic-warning)]">
              Tour running · Esc to stop
            </span>
          )}

          {/* 💡 Try Commands Dropdown */}
          <div ref={tryRef} className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setTryOpen(o => !o); }}
              className={cn(
                'chip flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] transition-colors',
                tryOpen
                  ? 'border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text-primary)]'
                  : 'border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Try example commands"
            >
              <span className="text-[11px]">💡</span>
              <span>Try</span>
            </button>

            <AnimatePresence>
              {tryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-overlay)] py-1 shadow-2xl"
                >
                  <div className="px-2.5 py-1.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Example Commands
                  </div>
                  {SUGGESTIONS.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={(e) => { e.stopPropagation(); handleSuggestionClick(cmd); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left font-mono text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    >
                      <span className="mr-2 text-[var(--text-muted)]">$</span>
                      {cmd}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Terminal output buffer */}
      <div
        ref={scrollRef}
        className="scroll-thin flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-[1.55] select-text"
      >
        {blocks.map(b => (
          <div key={b.id} className="mb-2">
            {b.kind === 'cmd' && (
              <div className="whitespace-pre-wrap break-words">
                {b.prompt && <Segs segs={b.prompt} />}
                <HighlightedCmd cmd={b.cmd ?? ''} />
              </div>
            )}
            {b.lines.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-words">
                <Segs segs={l.segs} />
              </div>
            ))}
          </div>
        ))}

        {/* Live input prompt with syntax highlighting */}
        <div className="relative flex items-center whitespace-pre">
          {prompt}
          <div className="relative min-w-0 flex-1">
            {/* Hidden real input for focus/keyboard/caret */}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={keyDown}
              autoFocus
              readOnly={demoRunning}
              className="term-input min-w-0 w-full bg-transparent font-mono text-[13px] leading-[1.55] text-transparent caret-[var(--text-primary)] outline-none"
              placeholder={blocks.length < 3 ? 'Try: ls, cat README.md, or demo…' : ''}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="terminal command input"
            />
            {/* Syntax-highlighted overlay (visible text) */}
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              {input ? (
                <InputHighlight input={input} />
              ) : blocks.length < 3 ? null : null}
            </div>
            {/* Ghost suggestion */}
            {ghostSuggestion && (
              <span
                className="pointer-events-none absolute top-0 font-mono text-[13px] leading-[1.55] text-[var(--text-muted)] opacity-50"
                style={{ left: `${input.length}ch` }}
              >
                {ghostSuggestion}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default Terminal;
