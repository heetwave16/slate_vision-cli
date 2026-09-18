import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppTheme, EnvState, FsNode } from '../engine/types';
import { displayPath, HOME, humanSize } from '../engine/fs';
import { cn } from '../utils/cn';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  env: EnvState;
  onExecute: (cmd: string) => void;
  onSelectFile: (path: string) => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onExportZip: () => void;
  onToggleGraph: () => void;
  graphActive: boolean;
}

interface PaletteItem {
  id: string;
  category: 'action' | 'theme' | 'file';
  title: string;
  subtitle?: string;
  icon: string;
  badge?: string;
  action: () => void;
}

const THEMES: { id: AppTheme; label: string; desc: string }[] = [
  { id: 'slate', label: 'Slate', desc: 'Minimal graphite & steel default' },
  { id: 'dracula', label: 'Dracula', desc: 'Classic purple & cyan vampire theme' },
  { id: 'nord', label: 'Nord', desc: 'Arctic blue & cool frosty tones' },
  { id: 'tokyo-night', label: 'Tokyo Night', desc: 'Japanese neon dusk palette' },
  { id: 'monokai-pro', label: 'Monokai Pro', desc: 'Vibrant punchy warm accents' },
  { id: 'cyberpunk', label: 'Cyberpunk', desc: 'High-contrast electric cyan & yellow' },
];

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
  env,
  onExecute,
  onSelectFile,
  currentTheme,
  onSelectTheme,
  onExportZip,
  onToggleGraph,
  graphActive,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Flatten files from virtual filesystem
  const filesList = useMemo(() => {
    const files: { path: string; name: string; size: number }[] = [];
    const walk = (n: FsNode, p: string) => {
      if (n.phantom) return;
      if (n.type === 'file') {
        files.push({ path: p, name: n.name, size: (n.content ?? '').length });
      }
      if (n.children) {
        for (const child of n.children) {
          walk(child, p + '/' + child.name);
        }
      }
    };
    walk(env.fs, HOME);
    return files;
  }, [env.fs]);

  // Build items based on query
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const result: PaletteItem[] = [];

    // 1. Actions
    const actions: PaletteItem[] = [
      {
        id: 'action-tour',
        category: 'action',
        title: 'Run Interactive Sandbox Tour',
        subtitle: 'Automated walkthrough of commands, git, & filesystem mechanics',
        icon: '🚀',
        badge: 'demo',
        action: () => { onExecute('demo'); onClose(); },
      },
      {
        id: 'action-graph',
        category: 'action',
        title: graphActive ? 'Switch to Split Canvas View' : 'Open Obsidian Graph Physics View',
        subtitle: 'Interactive force-directed graph of files, directories, & dependencies',
        icon: '🕸️',
        badge: 'view',
        action: () => { onToggleGraph(); onClose(); },
      },
      {
        id: 'action-export-zip',
        category: 'action',
        title: 'Export Filesystem as ZIP',
        subtitle: 'Download complete virtual filesystem state to your local computer',
        icon: '📦',
        badge: 'export',
        action: () => { onExportZip(); onClose(); },
      },
      {
        id: 'action-clear',
        category: 'action',
        title: 'Clear Terminal Buffer',
        subtitle: 'Reset the terminal view without modifying filesystem state',
        icon: '🧹',
        badge: 'Ctrl+L',
        action: () => { onExecute('clear'); onClose(); },
      },
      {
        id: 'action-git-status',
        category: 'action',
        title: 'git status',
        subtitle: 'Check dirty working tree, staged index, and active branch',
        icon: '🌿',
        badge: 'git',
        action: () => { onExecute('git status'); onClose(); },
      },
      {
        id: 'action-neofetch',
        category: 'action',
        title: 'neofetch',
        subtitle: 'Display virtual system specifications and ASCII branding',
        icon: '💻',
        badge: 'sys',
        action: () => { onExecute('neofetch'); onClose(); },
      },
      {
        id: 'action-readme',
        category: 'action',
        title: 'Read README.md',
        subtitle: 'Inspect sandbox documentation and command cheat sheet',
        icon: '📄',
        badge: 'cat',
        action: () => { onExecute('cat README.md'); onClose(); },
      },
    ];

    for (const act of actions) {
      if (!q || act.title.toLowerCase().includes(q) || act.subtitle?.toLowerCase().includes(q)) {
        result.push(act);
      }
    }

    // 2. Themes
    for (const t of THEMES) {
      if (!q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || q.includes('theme')) {
        result.push({
          id: 'theme-' + t.id,
          category: 'theme',
          title: `Theme: ${t.label}`,
          subtitle: t.desc,
          icon: '🎨',
          badge: currentTheme === t.id ? 'active' : undefined,
          action: () => { onSelectTheme(t.id); onClose(); },
        });
      }
    }

    // 3. Files
    for (const f of filesList) {
      const disp = displayPath(f.path);
      if (!q || f.name.toLowerCase().includes(q) || disp.toLowerCase().includes(q)) {
        result.push({
          id: 'file-' + f.path,
          category: 'file',
          title: f.name,
          subtitle: `${disp} · ${humanSize(f.size)}`,
          icon: f.name.endsWith('.md') ? '📝' : f.name.endsWith('.json') ? '⚙️' : '📄',
          badge: 'file',
          action: () => { onSelectFile(f.path); onClose(); },
        });
      }
    }

    return result;
  }, [query, graphActive, currentTheme, filesList, onExecute, onClose, onToggleGraph, onExportZip, onSelectTheme, onSelectFile]);

  // Keep selection bounded
  useEffect(() => {
    setSelectedIdx(i => Math.min(Math.max(0, i), Math.max(0, items.length - 1)));
  }, [items.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item) item.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:pt-28">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.14 }}
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-overlay)] shadow-2xl z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-2.5 border-b border-[var(--border-default)] px-3.5 py-3">
              <svg className="h-4 w-4 text-[var(--text-muted)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="7" cy="7" r="5" />
                <line x1="11" y1="11" x2="14.5" y2="14.5" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search files…"
                className="w-full bg-transparent font-mono text-[13px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              />
              <kbd className="hidden sm:inline rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                ESC
              </kbd>
            </div>

            {/* List */}
            <div className="scroll-thin max-h-80 overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-[var(--text-muted)]">
                  No matching commands or files found
                </div>
              ) : (
                items.map((item, idx) => {
                  const isSelected = idx === selectedIdx;
                  return (
                    <div
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors',
                        isSelected
                          ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-card)]'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="text-sm shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[12px] font-medium text-[var(--text-primary)]">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.badge && (
                        <span className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px]',
                          item.badge === 'active'
                            ? 'bg-[var(--semantic-success)]/20 text-[var(--semantic-success)] border border-[var(--semantic-success)]/30'
                            : 'bg-[var(--surface-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                        )}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 font-mono text-[10px] text-[var(--text-muted)]">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Dismiss</span>
              </div>
              <div>
                <span>{items.length} items</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
