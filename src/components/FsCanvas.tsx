import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActivePreview, EnvState, FlashFx, LaidNode, LayoutResult, PacketFx } from '../engine/types';
import { HOME, displayPath, edgeD, NODE_H, NODE_W, PAD, TTY_W, TTY_H, getTtyCenter, humanSize } from '../engine/fs';
import { FilePreview } from './FilePreview';
import { ObsidianGraph } from './ObsidianGraph';
import { FORMULA_REGISTRY } from '../engine/brew';
import { highlightCode } from '../utils/highlight';
import { cn } from '../utils/cn';

interface Props {
  layout: LayoutResult;
  cwdPath: string;
  staged: Set<string>;
  dirty: Set<string>;
  flashes: FlashFx[];
  packets: PacketFx[];
  preview: ActivePreview | null;
  highlightedIds?: Set<string>;
  onClosePreview: () => void;
  onSaveFile: (nodeId: string, content: string) => void;
  onNodeClick: (n: LaidNode) => void;
  onNavigate?: (path: string) => void;
  env?: EnvState;
  onDropFiles?: (files: { name: string; content: string }[]) => void;
}

const trunc = (s: string, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* Pure SVG glyphs with fixed coordinates (prevents SVG viewport blowup bug) */
function FolderGlyph() {
  return (
    <g stroke="var(--semantic-warning)" strokeWidth="1.2" fill="none">
      <path
        d="M1.5 2.5 A1 1 0 0 1 2.5 1.5 H5 L6.5 3 H11.5 A1 1 0 0 1 12.5 4 V11 A1 1 0 0 1 11.5 12 H2.5 A1 1 0 0 1 1.5 11 Z"
        fill="rgba(196,164,107,0.2)"
      />
    </g>
  );
}

function FileGlyph({ exec }: { exec?: boolean }) {
  return (
    <g stroke={exec ? 'var(--semantic-success)' : 'var(--text-muted)'} strokeWidth="1.2" fill="none">
      <path
        d="M2.5 1.5 H8.5 L11.5 4.5 V12 A1 1 0 0 1 10.5 13 H2.5 A1 1 0 0 1 1.5 12 V2.5 A1 1 0 0 1 2.5 1.5 Z"
        fill={exec ? 'rgba(131,179,148,0.15)' : 'rgba(124,136,156,0.1)'}
      />
      <path d="M8.5 1.5 V4.5 H11.5" />
    </g>
  );
}

const NodeBox = memo(function NodeBox({ n, isCwd, isSelected, isHighlighted, stagedDot, dirtyDot, onClick }: {
  n: LaidNode; isCwd: boolean; isSelected: boolean; isHighlighted: boolean; stagedDot: boolean; dirtyDot: boolean;
  onClick: (n: LaidNode) => void;
}) {
  const { node } = n;
  const isDir = node.type === 'dir';

  const stroke = node.phantom
    ? 'var(--border-subtle)'
    : isCwd
      ? 'var(--semantic-warning)'
      : (isSelected || isHighlighted)
        ? 'var(--semantic-info)'
        : 'var(--border-default)';

  const fill = isCwd
    ? 'rgba(196,164,107,0.1)'
    : isSelected
      ? 'rgba(139,169,201,0.1)'
      : 'var(--surface-card)';

  return (
    <g transform={`translate(${n.x}, ${n.y})`}>
      <g
        className="fsnode focus:outline-none"
        onClick={() => onClick(n)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(n);
          }
        }}
        role="button"
        tabIndex={node.phantom ? -1 : 0}
        aria-label={`${node.name} (${isDir ? 'directory' : 'file'})`}
      >
        <title>{displayPath(n.path)}{node.phantom ? '' : isDir ? ' — directory (click to cd)' : ' — file (click to inspect)'}</title>

        {/* Active CWD Outer Boundary Halo */}
        {isCwd && (
          <rect
            className="nodebox-halo"
            x={-3} y={-3} width={NODE_W + 6} height={NODE_H + 6} rx={9}
            fill="none" stroke="var(--semantic-warning)" strokeWidth={1}
            strokeOpacity={0.45} strokeDasharray="4 2"
          />
        )}

        {/* Node card */}
        <rect
          className="nodebox"
          width={NODE_W} height={NODE_H} rx={6}
          fill={fill} stroke={stroke} strokeWidth={isCwd ? 1.8 : (isSelected || isHighlighted ? 1.5 : 1)}
          strokeDasharray={node.phantom ? '3 3' : undefined}
        />

        {/* Node Icon */}
        <g transform="translate(10, 11)">
          {isDir ? <FolderGlyph /> : <FileGlyph exec={node.exec} />}
        </g>

        {/* Node Label */}
        <text
          x={30} y={23} fontSize={11} fontFamily="JetBrains Mono, monospace"
          fill={node.phantom ? 'var(--text-muted)' : 'var(--text-primary)'}
          fontWeight={isCwd ? 600 : 400}
          fontStyle={node.phantom ? 'italic' : undefined}
        >
          {trunc(node.name)}
        </text>

        {/* File Size */}
        {!isDir && !node.phantom && (
          <text
            x={NODE_W - 8} y={23} fontSize={9} textAnchor="end"
            fontFamily="JetBrains Mono, monospace" fill="var(--text-muted)"
          >
            {(node.content ?? '').length}B
          </text>
        )}

        {/* Git Staged Indicator */}
        {stagedDot && (
          <circle cx={NODE_W - 22} cy={8} r={2.5} fill="var(--semantic-success)">
            <title>Staged in Git</title>
          </circle>
        )}

        {/* Git Dirty/Modified Indicator */}
        {dirtyDot && (
          <circle cx={NODE_W - 13} cy={8} r={2.5} fill="var(--semantic-warning)">
            <title>Modified in Git</title>
          </circle>
        )}

        {/* CWD Prominent Tag */}
        {isCwd && (
          <g transform={`translate(${NODE_W - 36}, -8)`}>
            <rect width={32} height={13} rx={3} fill="var(--semantic-warning)" />
            <text
              x={16} y={9.5} textAnchor="middle" fontSize={8} fontWeight={700}
              fontFamily="JetBrains Mono, monospace" fill="#08090d"
            >
              CWD
            </text>
          </g>
        )}
      </g>
    </g>
  );
});

/* Viewport-anchored File Preview Modal */
function ViewportPreviewModal({
  preview,
  onClose,
  onSave,
  onToggleDock,
}: {
  preview: ActivePreview;
  onClose: () => void;
  onSave: (nodeId: string, content: string) => void;
  onToggleDock: () => void;
}) {
  const [content, setContent] = useState(preview.content);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(preview.content);
    setIsEditing(false);
    setSaved(false);
  }, [preview.nodeId, preview.content]);

  const ext = preview.name.split('.').pop()?.toLowerCase() ?? 'txt';
  const hasUnsavedChanges = content !== preview.content;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleSave = () => {
    onSave(preview.nodeId, content);
    setSaved(true);
    setIsEditing(false);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    /* Backdrop — clicking it closes the preview */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={(e) => {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      {/* Card */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-[92%] max-w-[420px] max-h-[80%] rounded-lg border border-[var(--border-strong)] bg-[var(--surface-overlay)] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-card)] px-3">
          <div className="flex items-center gap-1.5 truncate">
            <span className="rounded bg-[var(--surface-hover)] border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--semantic-info)] uppercase">
              {ext}
            </span>
            <span className="font-mono text-[11px] font-medium text-[var(--text-primary)] truncate" title={preview.path}>
              {preview.name}
            </span>
            <span className="font-mono text-[9.5px] text-[var(--text-muted)]">
              {humanSize(content.length)}
            </span>
            {hasUnsavedChanges && !saved && (
              <span className="font-mono text-[9px] text-[var(--semantic-warning)] font-medium">
                • Unsaved
              </span>
            )}
            {saved && (
              <span className="font-mono text-[9px] text-[var(--semantic-success)] font-medium">
                ✓ Saved
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              title="Copy content"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={cn(
                'chip rounded border px-1.5 py-0.5 font-mono text-[9.5px]',
                isEditing
                  ? 'border-[var(--semantic-warning)] bg-[var(--surface-hover)] text-[var(--semantic-warning)] font-semibold'
                  : 'border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              title={isEditing ? 'View mode' : 'Edit mode'}
            >
              {isEditing ? 'View' : 'Edit'}
            </button>
            {isEditing && (
              <button
                onClick={handleSave}
                className="chip rounded border border-[var(--semantic-success)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[var(--semantic-success)] hover:bg-[var(--surface-hover)]"
                title="Save to virtual filesystem"
              >
                Save
              </button>
            )}
            <button
              onClick={onToggleDock}
              className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1 py-0.5 font-mono text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              title="Dock to sidebar"
            >
              Dock
            </button>
            <button
              onClick={onClose}
              className="chip rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 min-h-[140px] max-h-[340px] overflow-y-auto p-3 scroll-thin bg-[var(--surface-base)] font-mono text-[11.5px] leading-[1.5]">
          {FORMULA_REGISTRY[preview.name.toLowerCase()] && !isEditing ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 p-2 rounded border border-[var(--border-default)] bg-[var(--surface-card)]">
                <span className="text-xl">🍺</span>
                <div>
                  <div className="font-semibold text-[var(--semantic-info)] text-xs">
                    {FORMULA_REGISTRY[preview.name.toLowerCase()].name} v{FORMULA_REGISTRY[preview.name.toLowerCase()].version}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {FORMULA_REGISTRY[preview.name.toLowerCase()].desc}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                <div className="p-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Homepage</div>
                  <a
                    href={FORMULA_REGISTRY[preview.name.toLowerCase()].homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--semantic-info)] hover:underline truncate block"
                  >
                    {FORMULA_REGISTRY[preview.name.toLowerCase()].homepage.replace(/^https?:\/\//, '')}
                  </a>
                </div>
                <div className="p-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Bottle Size</div>
                  <div className="text-[var(--text-primary)] font-medium">
                    {FORMULA_REGISTRY[preview.name.toLowerCase()].size} ({FORMULA_REGISTRY[preview.name.toLowerCase()].filesCount} files)
                  </div>
                </div>
              </div>
              <div className="p-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Executable location</div>
                <code className="text-[var(--semantic-success)] text-[10.5px]">{preview.path}</code>
              </div>
            </div>
          ) : isEditing ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-56 bg-transparent text-[var(--text-primary)] outline-none resize-none font-mono text-[11.5px] leading-[1.5] caret-[var(--text-primary)]"
              spellCheck={false}
              autoFocus
            />
          ) : (
            highlightCode(content, ext)
          )}
        </div>

        {/* Footer */}
        <div className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-[9px] font-mono text-[var(--text-muted)]">
          <span>{content.split('\n').length} lines</span>
          <span className="flex items-center gap-2">
            <span>{preview.path}</span>
            <span className="text-[var(--border-strong)]">·</span>
            <span>Click outside or Esc to close</span>
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.12;
const MINIMAP_W = 160;
const MINIMAP_H = 100;

const FsCanvas = memo(function FsCanvas({
  layout, cwdPath, staged, dirty, flashes, packets, preview, highlightedIds,
  onClosePreview, onSaveFile, onNodeClick, onNavigate, env, onDropFiles,
}: Props) {
  const [viewMode, setViewMode] = useState<'tree' | 'graph'>('tree');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [docked, setDocked] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (!onDropFiles || !e.dataTransfer.files.length) return;
    const files: { name: string; content: string }[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      try {
        const text = await file.text();
        files.push({ name: file.name, content: text });
      } catch {
        // ignore unreadable
      }
    }
    if (files.length) {
      onDropFiles(files);
    }
  };
  const [zoomBadge, setZoomBadge] = useState<number | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);

  // refs for pan tracking
  const panOrigin = useRef<{ sx: number; sy: number; mx: number; my: number } | null>(null);
  const spaceDown = useRef(false);
  const zoomBadgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const tty = getTtyCenter(layout);

  const byId = useMemo(() => {
    if (layout.nodeMap) return layout.nodeMap;
    const m = new Map<string, LaidNode>();
    layout.nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [layout]);

  const cwdChain = useMemo(() => {
    const set = new Set<string>();
    const segs = cwdPath.split('/').filter(Boolean);
    let acc = '';
    for (const s of segs) {
      acc += '/' + s;
      const n = layout.pathMap ? layout.pathMap.get(acc) : layout.nodes.find(x => x.path === acc);
      if (n) set.add(n.id);
    }
    const root = layout.pathMap ? layout.pathMap.get(HOME) : layout.nodes.find(x => x.path === HOME);
    if (root) set.add(root.id);
    return set;
  }, [layout, cwdPath]);

  // Canvas bounds (needed early by zoomToFit and minimap)
  const canvasWidth = Math.max(layout.width + 480, 960);
  const canvasHeight = Math.max(layout.height + 260, 560);

  // ----------- Zoom helpers -----------

  const applyZoom = useCallback((newZoom: number, pivotClientX?: number, pivotClientY?: number) => {
    const el = scrollRef.current;
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom)) * 100) / 100;
    const prev = zoom;
    if (clamped === prev) return;

    if (el) {
      const rect = el.getBoundingClientRect();
      // cursor position relative to the scroll container viewport (default to center)
      const cx = pivotClientX !== undefined ? (pivotClientX - rect.left) : (rect.width / 2);
      const cy = pivotClientY !== undefined ? (pivotClientY - rect.top) : (rect.height / 2);
      // point in canvas-space that the cursor is over (before zoom)
      const canvasX = (el.scrollLeft + cx) / prev;
      const canvasY = (el.scrollTop + cy) / prev;
      // after zoom, that same canvas point should stay under the cursor
      requestAnimationFrame(() => {
        el.scrollLeft = canvasX * clamped - cx;
        el.scrollTop = canvasY * clamped - cy;
      });
    }

    setZoom(clamped);

    // Flash transient zoom badge
    clearTimeout(zoomBadgeTimer.current);
    setZoomBadge(clamped);
    zoomBadgeTimer.current = setTimeout(() => setZoomBadge(null), 600);
  }, [zoom]);

  const zoomIn = useCallback(() => applyZoom(zoom + ZOOM_STEP), [zoom, applyZoom]);
  const zoomOut = useCallback(() => applyZoom(zoom - ZOOM_STEP), [zoom, applyZoom]);

  // ----------- Center on CWD & Root Directory -----------

  const recenterCwd = useCallback(() => {
    const el = scrollRef.current;
    const n = layout.pathMap ? layout.pathMap.get(cwdPath) : layout.nodes.find(x => x.path === cwdPath);
    if (el && n) {
      el.scrollTo({
        left: Math.max(0, n.x * zoom - el.clientWidth / 2.5),
        top: Math.max(0, n.y * zoom - el.clientHeight / 2.8),
        behavior: 'smooth',
      });
    }
  }, [cwdPath, layout, zoom]);

  const recenterRoot = useCallback(() => {
    const el = scrollRef.current;
    const rootNode = layout.pathMap ? layout.pathMap.get(HOME) : layout.nodes.find(x => x.depth === 0);
    applyZoom(1);
    if (el) {
      requestAnimationFrame(() => {
        const targetY = rootNode ? Math.max(0, rootNode.y - el.clientHeight / 3) : 0;
        el.scrollTo({
          left: 0,
          top: targetY,
          behavior: 'smooth',
        });
      });
    }
  }, [layout, applyZoom]);

  const zoomReset = useCallback(() => {
    recenterRoot();
  }, [recenterRoot]);

  const zoomToFit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fitW = el.clientWidth / canvasWidth;
    const fitH = el.clientHeight / canvasHeight;
    const fit = Math.min(fitW, fitH, 1.2);
    applyZoom(fit);
    requestAnimationFrame(() => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
  }, [canvasWidth, canvasHeight, applyZoom]);

  const prevCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevCwdRef.current !== cwdPath) {
      prevCwdRef.current = cwdPath;
      recenterCwd();
    }
  }, [cwdPath]);

  // ----------- Mouse-wheel: 2-finger pan & pinch/Cmd zoom -----------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // If holding Ctrl or Cmd, or pinch-to-zoom on Mac trackpad (which fires wheel with e.ctrlKey = true):
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY;
        const zoomDelta = Math.sign(delta) * Math.min(Math.abs(delta) * 0.005, 0.12);
        applyZoom(zoom * (1 + zoomDelta), e.clientX, e.clientY);
      } else {
        // Natural 2-finger trackpad scroll or mouse scroll = PAN the tree canvas
        if (e.shiftKey && !e.deltaX) {
          el.scrollLeft += e.deltaY;
        } else {
          el.scrollLeft += e.deltaX;
          el.scrollTop += e.deltaY;
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, applyZoom]);

  // ----------- Click-drag and middle-click pan -----------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // Don't drag-pan if user clicked directly on a node button/card
      if ((e.target as HTMLElement).closest('.fsnode')) return;
      if (e.button === 0 || e.button === 1 || spaceDown.current) {
        setIsPanning(true);
        panOrigin.current = { sx: el.scrollLeft, sy: el.scrollTop, mx: e.clientX, my: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!panOrigin.current) return;
      el.scrollLeft = panOrigin.current.sx - (e.clientX - panOrigin.current.mx);
      el.scrollTop = panOrigin.current.sy - (e.clientY - panOrigin.current.my);
    };
    const onUp = () => {
      panOrigin.current = null;
      setIsPanning(false);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // ----------- Space key = temporary pan mode -----------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack if focus is on an input/textarea
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        spaceDown.current = true;
        setIsPanning(true);
      }
      // Keyboard zoom shortcuts: ⌘/Ctrl + =, ⌘/Ctrl + -, ⌘/Ctrl + 0
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); zoomReset(); }
      // F = fit to screen, Home = reset to root directory
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) { zoomToFit(); }
      if (e.key === 'Home') { recenterRoot(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (!panOrigin.current) setIsPanning(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [zoomIn, zoomOut, zoomReset, zoomToFit, recenterRoot, recenterCwd]);

  // ----------- Minimap -----------

  const [minimapView, setMinimapView] = useState({ x: 0, y: 0, w: 100, h: 60 });

  useEffect(() => {
    if (!showMinimap) return;
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const totalW = canvasWidth * zoom;
      const totalH = canvasHeight * zoom;
      setMinimapView({
        x: Math.max(0, (el.scrollLeft / totalW) * MINIMAP_W),
        y: Math.max(0, (el.scrollTop / totalH) * MINIMAP_H),
        w: Math.min(MINIMAP_W, (el.clientWidth / totalW) * MINIMAP_W),
        h: Math.min(MINIMAP_H, (el.clientHeight / totalH) * MINIMAP_H),
      });
    };

    update();
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [canvasWidth, canvasHeight, zoom, showMinimap]);

  const onMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = (e.target as HTMLElement).closest('.canvas-minimap')?.getBoundingClientRect();
    if (!rect) return;
    const rx = (e.clientX - rect.left) / MINIMAP_W;
    const ry = (e.clientY - rect.top) / MINIMAP_H;
    const totalW = canvasWidth * zoom;
    const totalH = canvasHeight * zoom;
    el.scrollTo({
      left: rx * totalW - el.clientWidth / 2,
      top: ry * totalH - el.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [canvasWidth, canvasHeight, zoom]);

  // ----------- Breadcrumbs -----------

  const breadcrumbs = useMemo(() => {
    const list: { name: string; path: string; isCwd: boolean }[] = [];
    list.push({ name: '~', path: HOME, isCwd: cwdPath === HOME });
    if (cwdPath.startsWith(HOME + '/')) {
      const rest = cwdPath.slice(HOME.length + 1).split('/');
      let cur = HOME;
      for (const seg of rest) {
        cur += '/' + seg;
        list.push({ name: seg, path: cur, isCwd: cur === cwdPath });
      }
    }
    return list;
  }, [cwdPath]);

  // ----------- Edges -----------

  const edges = useMemo(() => {
    return layout.edges.map(e => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return null;
      const p1 = { x: a.x + NODE_W, y: a.y + NODE_H / 2 };
      const p2 = { x: b.x, y: b.y + NODE_H / 2 };
      const onChain = cwdChain.has(e.from) && cwdChain.has(e.to);
      return { key: e.from + '>' + e.to, d: edgeD(p1, p2), onChain };
    }).filter(Boolean) as { key: string; d: string; onChain: boolean }[];
  }, [layout.edges, byId, cwdChain]);

  const root = layout.nodes.find(n => n.depth === 0);
  const ttyEdge = root
    ? edgeD({ x: PAD + TTY_W, y: tty.y }, { x: root.x, y: root.y + NODE_H / 2 })
    : '';


  // ----------- (preview positioning removed — now viewport-anchored) -----------


  // ========== RENDER ==========

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 flex-col bg-[var(--surface-panel)]"
    >
      {/* Drag and drop import overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--surface-overlay)]/95 backdrop-blur-sm border-2 border-dashed border-[var(--semantic-info)] m-2 rounded-xl"
          >
            <div className="text-3xl mb-2">📥</div>
            <div className="font-mono text-sm font-bold text-[var(--text-primary)]">
              Drop files to import into {displayPath(cwdPath)}
            </div>
            <div className="font-mono text-xs text-[var(--text-muted)] mt-1">
              Files will be mounted directly into your virtual environment
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pane Header with Interactive Breadcrumbs & Canvas Toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3 font-mono text-[11px]">
        {/* Interactive Breadcrumbs */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-sans text-[11px] font-semibold text-[var(--text-primary)] shrink-0 mr-1">
            Filesystem
          </span>
          <div className="flex items-center gap-1 overflow-x-auto scroll-thin py-0.5">
            {breadcrumbs.map((b, idx) => (
              <span key={b.path} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <span className="text-[var(--text-muted)]">/</span>}
                <button
                  onClick={() => {
                    if (b.path === HOME) recenterRoot();
                    if (onNavigate) onNavigate(b.path);
                  }}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10.5px] transition-colors',
                    b.isCwd
                      ? 'bg-[rgba(196,164,107,0.15)] text-[var(--semantic-warning)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  )}
                  title={`cd ${displayPath(b.path)}`}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Canvas Toolbar / Controls */}
        <div className="flex items-center gap-3 text-[10px] shrink-0 text-[var(--text-muted)]">
          {/* View Mode Switcher: Tree vs Obsidian Physics Graph */}
          <div className="flex rounded border border-[var(--border-default)] bg-[var(--surface-card)] p-0.5 font-mono text-[9.5px]">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                viewMode === 'tree'
                  ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Classic hierarchy DAG tree"
            >
              🌲 Tree
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                viewMode === 'graph'
                  ? 'bg-[var(--surface-hover)] text-[var(--semantic-info)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              title="Obsidian-style force-directed physics graph with draggable floating files"
            >
              🕸 Graph
            </button>
          </div>

          {viewMode === 'tree' && (
            <>
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-2.5">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-[var(--semantic-warning)] bg-[rgba(196,164,107,0.2)]" />
                  dir
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-[var(--border-default)] bg-[var(--surface-card)]" />
                  file
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--semantic-success)]" />
                  staged
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--semantic-warning)]" />
                  modified
                </span>
              </div>

              <div className="h-3 w-[1px] bg-[var(--border-default)] hidden sm:block" />

              {/* Zoom & Navigation buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={recenterRoot}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center gap-1"
                  title="Reset view from root directory ~ (Home)"
                >
                  <span className="text-[var(--semantic-info)]">⌂</span>
                  <span>Root</span>
                </button>
                <button
                  onClick={recenterCwd}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Center on CWD"
                >
                  CWD
                </button>
                <button
                  onClick={zoomToFit}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Fit to screen (F)"
                >
                  Fit
                </button>

                <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

                <button
                  onClick={zoomOut}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] w-6 h-5 flex items-center justify-center font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Zoom out (⌘−)"
                >
                  −
                </button>
                <button
                  onClick={zoomReset}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] h-5 px-1.5 font-mono text-[9.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-w-[38px] text-center"
                  title="Reset to 100% from root directory (⌘0)"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={zoomIn}
                  className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] w-6 h-5 flex items-center justify-center font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="Zoom in (⌘+)"
                >
                  +
                </button>

                <div className="h-3 w-[1px] bg-[var(--border-subtle)]" />

                <button
                  onClick={() => setShowMinimap(s => !s)}
                  className={cn(
                    'chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[9.5px]',
                    showMinimap ? 'text-[var(--semantic-info)]' : 'text-[var(--text-muted)]'
                  )}
                  title="Toggle minimap"
                >
                  Map
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        {viewMode === 'graph' && env ? (
          <ObsidianGraph env={env} onNodeClick={onNodeClick} preview={preview} />
        ) : (
          /* Canvas viewport */
          <div
            ref={scrollRef}
            className={cn('scroll-thin relative min-h-0 flex-1 overflow-auto bg-[var(--surface-base)] canvas-viewport', isPanning && 'panning')}
          >
          <div
            ref={canvasRef}
            className="relative origin-top-left"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <svg
              width={canvasWidth}
              height={canvasHeight}
              className="absolute inset-0"
            >
              {/* TTY Connection Edge */}
              <path
                d={ttyEdge}
                fill="none"
                stroke="var(--semantic-info)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />

              {/* Hierarchy Edges (with active CWD path illumination) */}
              {edges.map(e => (
                <g key={e.key}>
                  {e.onChain && (
                    <path
                      d={e.d}
                      fill="none"
                      stroke="var(--semantic-warning)"
                      strokeWidth={3.5}
                      strokeOpacity={0.25}
                    />
                  )}
                  <path
                    d={e.d}
                    fill="none"
                    stroke={e.onChain ? 'var(--semantic-warning)' : 'var(--border-default)'}
                    strokeWidth={e.onChain ? 1.8 : 1.1}
                    strokeOpacity={e.onChain ? 0.95 : 0.6}
                  />
                </g>
              ))}


              {/* (tether line removed — preview is now a viewport overlay) */}


              {/* TTY Terminal Node */}
              <g transform={`translate(${PAD}, ${tty.y - TTY_H / 2})`}>
                <rect
                  width={TTY_W} height={TTY_H} rx={6}
                  fill="var(--surface-card)" stroke="var(--semantic-info)" strokeWidth={1.5}
                />
                <text x={TTY_W / 2} y={17} textAnchor="middle" fontSize={11} fontWeight={600} fontFamily="JetBrains Mono, monospace" fill="var(--semantic-info)">&gt;_</text>
                <text x={TTY_W / 2} y={29} textAnchor="middle" fontSize={8} fontFamily="JetBrains Mono, monospace" fill="var(--text-muted)">tty0</text>
              </g>

              {/* File / Directory Nodes */}
              {layout.nodes.map(n => (
                <NodeBox
                  key={n.id} n={n}
                  isCwd={n.path === cwdPath}
                  isSelected={preview?.nodeId === n.id}
                  isHighlighted={highlightedIds?.has(n.id) ?? false}
                  stagedDot={staged.has(n.path)}
                  dirtyDot={dirty.has(n.path)}
                  onClick={onNodeClick}
                />
              ))}

              {/* Packets */}
              <AnimatePresence>
                {packets.map(p => (
                  <motion.g
                    key={p.key}
                    initial={{ x: p.xs[0], y: p.ys[0], opacity: 0 }}
                    animate={{ x: p.xs, y: p.ys, opacity: [0, 1, 1, 1, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: p.dur, ease: 'easeInOut' }}
                  >
                    <circle r={4} fill={p.color} />
                    {p.label && (
                      <text y={-9} textAnchor="middle" fontSize={9.5} fontWeight={600} fontFamily="JetBrains Mono, monospace" fill="var(--text-primary)" stroke="var(--surface-base)" strokeWidth={2} paintOrder="stroke">{p.label}</text>
                    )}
                  </motion.g>
                ))}
              </AnimatePresence>

              {/* Flashes */}
              <AnimatePresence>
                {flashes.map(f => (
                  <g key={f.key} transform={`translate(${f.x}, ${f.y})`}>
                    <motion.circle
                      initial={{ r: 8, opacity: 0.85 }}
                      animate={{ r: 28, opacity: 0 }}
                      transition={{ duration: f.dur, ease: 'easeOut' }}
                      fill="none" stroke={f.color} strokeWidth={1.8}
                    />
                    {f.label && (
                      <motion.text
                        initial={{ y: -12, opacity: 1 }}
                        animate={{ y: -28, opacity: 0 }}
                        transition={{ duration: f.dur, ease: 'easeOut' }}
                        textAnchor="middle" fontSize={10} fontWeight={600} fontFamily="JetBrains Mono, monospace" fill={f.color} stroke="var(--surface-base)" strokeWidth={2} paintOrder="stroke"
                      >
                        {f.label}
                      </motion.text>
                    )}
                  </g>
                ))}
              </AnimatePresence>
            </svg>

            {/* (old in-canvas preview removed — now rendered as viewport overlay below) */}
          </div>


          {/* Transient Zoom Badge HUD */}
          {zoomBadge !== null && (
            <div key={zoomBadge} className="zoom-badge">
              {Math.round(zoomBadge * 100)}%
            </div>
          )}
        </div>
        )}

        {/* Minimap (only shown in tree view) */}
        {viewMode === 'tree' && showMinimap && (
          <div
            className="canvas-minimap"
            style={{ width: MINIMAP_W, height: MINIMAP_H }}
            onClick={onMinimapClick}
            title="Click to navigate"
          >
            <svg width={MINIMAP_W} height={MINIMAP_H} className="absolute inset-0">
              {/* Minimap edges */}
              {layout.edges.map(e => {
                const a = byId.get(e.from);
                const b = byId.get(e.to);
                if (!a || !b) return null;
                const sx = MINIMAP_W / canvasWidth;
                const sy = MINIMAP_H / canvasHeight;
                return (
                  <line
                    key={e.from + '>' + e.to}
                    x1={(a.x + NODE_W) * sx} y1={(a.y + NODE_H / 2) * sy}
                    x2={b.x * sx} y2={(b.y + NODE_H / 2) * sy}
                    stroke={cwdChain.has(e.from) && cwdChain.has(e.to) ? 'var(--semantic-warning)' : 'var(--border-strong)'}
                    strokeWidth={0.7}
                    strokeOpacity={0.7}
                  />
                );
              })}
              {/* Minimap nodes */}
              {layout.nodes.map(n => {
                const sx = MINIMAP_W / canvasWidth;
                const sy = MINIMAP_H / canvasHeight;
                const isCwd = n.path === cwdPath;
                return (
                  <rect
                    key={n.id}
                    x={n.x * sx} y={n.y * sy}
                    width={Math.max(NODE_W * sx, 3)} height={Math.max(NODE_H * sy, 2)}
                    rx={1}
                    fill={isCwd ? 'var(--semantic-warning)' : (n.node.type === 'dir' ? 'var(--border-strong)' : 'var(--text-muted)')}
                    fillOpacity={isCwd ? 0.9 : 0.5}
                  />
                );
              })}
            </svg>
            {/* Viewport rectangle */}
            <div
              className="minimap-viewport"
              style={{
                left: Math.max(0, minimapView.x),
                top: Math.max(0, minimapView.y),
                width: Math.min(minimapView.w, MINIMAP_W),
                height: Math.min(minimapView.h, MINIMAP_H),
              }}
            />
          </div>
        )}
        {/* Viewport-anchored File Preview Modal */}
        <AnimatePresence>
          {preview && !docked && (
            <ViewportPreviewModal
              key={preview.nodeId}
              preview={preview}
              onClose={onClosePreview}
              onSave={onSaveFile}
              onToggleDock={() => setDocked(true)}
            />
          )}
        </AnimatePresence>

        {/* Docked File Inspector (if docked mode enabled) */}
        {preview && docked && (
          <FilePreview
            nodeId={preview.nodeId}
            name={preview.name}
            path={preview.path}
            initialContent={preview.content}
            onClose={onClosePreview}
            onSave={onSaveFile}
          />
        )}
      </div>
    </div>
  );
});

export default FsCanvas;
