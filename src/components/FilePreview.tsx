import { memo, useEffect, useRef, useState } from 'react';
import { humanSize } from '../engine/fs';
import { cn } from '../utils/cn';

interface Props {
  nodeId: string;
  name: string;
  path: string;
  initialContent: string;
  onClose: () => void;
  onSave: (nodeId: string, content: string) => void;
}

import { highlightCode } from '../utils/highlight';

export const FilePreview = memo(function FilePreview({
  nodeId, name, path, initialContent, onClose, onSave,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(initialContent);
    setIsEditing(false);
    setSaved(false);
  }, [nodeId, initialContent]);

  const ext = name.split('.').pop()?.toLowerCase() ?? 'txt';
  const hasUnsavedChanges = content !== initialContent;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  const handleSave = () => {
    onSave(nodeId, content);
    setSaved(true);
    setIsEditing(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const lineCount = content.split('\n').length;

  return (
    <aside
      className="flex h-full w-80 md:w-96 shrink-0 flex-col border-l border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-primary)]"
      aria-label="File Inspector"
    >
      {/* Title bar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3">
        <span className="rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-[var(--text-secondary)] uppercase">
          {ext}
        </span>
        <span className="truncate font-mono text-xs font-medium text-[var(--text-primary)]" title={path}>
          {name}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {humanSize(content.length)}
        </span>

        {hasUnsavedChanges && !saved && (
          <span className="rounded bg-[var(--surface-card)] border border-[var(--border-default)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--semantic-warning)]">
            Unsaved
          </span>
        )}

        {saved && (
          <span className="font-mono text-[10px] font-medium text-[var(--semantic-success)]">
            Saved
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            title="Copy file content"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => {
              setIsEditing(!isEditing);
              if (!isEditing) setTimeout(() => textareaRef.current?.focus(), 40);
            }}
            className={cn(
              'chip rounded border px-2 py-0.5 font-mono text-[10px]',
              isEditing
                ? 'border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text-primary)]'
                : 'border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
            )}
            title={isEditing ? 'View mode' : 'Edit mode'}
          >
            {isEditing ? 'View' : 'Edit'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              className="chip rounded border border-[var(--semantic-success)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--semantic-success)] hover:bg-[var(--surface-hover)]"
              title="Save changes to virtual filesystem"
            >
              Save
            </button>
          )}
          <button
            onClick={onClose}
            className="chip rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            title="Close inspector"
            aria-label="Close inspector"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M2.2 2.2a.7.7 0 0 1 1 0L6 4.9l2.8-2.7a.7.7 0 1 1 1 1L7 6l2.8 2.8a.7.7 0 1 1-1 1L6 7.1 3.2 9.9a.7.7 0 0 1-1-1L5 6 2.2 3.2a.7.7 0 0 1 0-1Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Code Content Area */}
      <div className="scroll-thin flex-1 overflow-y-auto p-3">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="scroll-thin h-full min-h-[180px] w-full resize-none bg-transparent font-mono text-[12px] leading-[1.55] text-[var(--text-primary)] outline-none"
            spellCheck={false}
          />
        ) : content.trim().length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-[var(--text-muted)] italic">
            (empty file)
          </div>
        ) : (
          <div className="space-y-0.5 select-text">
            {highlightCode(content, ext)}
          </div>
        )}
      </div>

      {/* Footer metadata */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-panel)] px-3 font-mono text-[10px] text-[var(--text-muted)]">
        <span>{lineCount} lines</span>
        <span>{path}</span>
      </div>
    </aside>
  );
});
