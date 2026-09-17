import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ActivePreview, EnvState, FsNode, LaidNode } from '../engine/types';
import { displayPath, humanSize, HOME } from '../engine/fs';
import { cn } from '../utils/cn';

interface GraphNode {
  id: string;
  name: string;
  path: string;
  type: 'dir' | 'file' | 'brew' | 'git' | 'config';
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  radius: number;
  color: string;
  glowColor: string;
  seed: number;
  depth: number;
  content?: string;
  fsNode?: FsNode;
}

interface GraphLink {
  source: string;
  target: string;
  length: number;
}

interface Props {
  env: EnvState;
  onNodeClick: (node: LaidNode) => void;
  preview: ActivePreview | null;
}

function getNodeCategory(name: string, isDir: boolean, path: string): { type: GraphNode['type']; color: string; glowColor: string } {
  if (isDir) {
    if (name === '.git') return { type: 'git', color: '#83b394', glowColor: 'rgba(131,179,148,0.45)' };
    if (name === '.brew' || path.includes('/Cellar')) return { type: 'brew', color: '#a991f7', glowColor: 'rgba(169,145,247,0.45)' };
    return { type: 'dir', color: '#c4a46b', glowColor: 'rgba(196,164,107,0.45)' };
  }
  if (name.endsWith('.json') || name.endsWith('.yml') || name.startsWith('.')) {
    return { type: 'config', color: '#8ba9c9', glowColor: 'rgba(139,169,201,0.45)' };
  }
  if (path.includes('/.brew/bin') || path.includes('/Cellar')) {
    return { type: 'brew', color: '#a991f7', glowColor: 'rgba(169,145,247,0.45)' };
  }
  return { type: 'file', color: '#7c889c', glowColor: 'rgba(124,136,156,0.35)' };
}

export const ObsidianGraph = memo(function ObsidianGraph({ env, onNodeClick, preview }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  hoveredNodeIdRef.current = hoveredNodeId;

  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const linksRef = useRef<GraphLink[]>([]);
  const isDraggingRef = useRef<string | null>(null);
  const dragDistanceRef = useRef(0);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const timeRef = useRef(0);

  // Extract flat graph of nodes & links from virtual filesystem
  useEffect(() => {
    const nodes = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    let seed = 0;
    const walk = (node: FsNode, path: string, parentId: string | null, depth: number) => {
      if (node.phantom) return;
      const isDir = node.type === 'dir';
      const cat = getNodeCategory(node.name, isDir, path);
      const existing = nodesRef.current.get(node.id);

      const radius = isDir ? Math.max(12, 17 - depth * 2) : 7.5;
      const initialAngle = seed * 0.45;
      const initialDist = 45 + depth * 55;

      const gNode: GraphNode = {
        id: node.id,
        name: node.name,
        path,
        type: cat.type,
        size: (node.content ?? '').length,
        x: existing ? existing.x : Math.cos(initialAngle) * initialDist + (Math.random() - 0.5) * 20,
        y: existing ? existing.y : Math.sin(initialAngle) * initialDist + (Math.random() - 0.5) * 20,
        vx: existing ? existing.vx * 0.5 : 0,
        vy: existing ? existing.vy * 0.5 : 0,
        fx: existing ? existing.fx : null,
        fy: existing ? existing.fy : null,
        radius,
        color: cat.color,
        glowColor: cat.glowColor,
        seed: ++seed,
        depth,
        content: node.content,
        fsNode: node,
      };

      nodes.set(node.id, gNode);

      if (parentId) {
        links.push({
          source: parentId,
          target: node.id,
          length: isDir ? 70 : 48,
        });
      }

      if (node.children) {
        for (const child of node.children) {
          walk(child, path + '/' + child.name, node.id, depth + 1);
        }
      }
    };

    walk(env.fs, HOME, null, 0);

    // Also link installed brew packages if any
    if (env.installedBrew) {
      Object.keys(env.installedBrew).forEach(pkgName => {
        const pkg = env.installedBrew![pkgName];
        if (!nodes.has('brew-' + pkgName)) {
          const id = 'brew-' + pkgName;
          const existing = nodesRef.current.get(id);
          nodes.set(id, {
            id,
            name: pkgName,
            path: pkg.bin,
            type: 'brew',
            size: 4096,
            x: existing ? existing.x : (Math.random() - 0.5) * 200,
            y: existing ? existing.y : (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0,
            fx: null,
            fy: null,
            radius: 10,
            color: '#a991f7',
            glowColor: 'rgba(169,145,247,0.5)',
            seed: ++seed,
            depth: 2,
          });
          links.push({ source: env.fs.id, target: id, length: 90 });
        }
      });
    }

    nodesRef.current = nodes;
    linksRef.current = links;
  }, [env.fs, env.installedBrew]);

  // Set of nodes connected to hovered node
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    for (const link of linksRef.current) {
      if (link.source === hoveredNodeId) set.add(link.target);
      if (link.target === hoveredNodeId) set.add(link.source);
    }
    return set;
  }, [hoveredNodeId]);

  const connectedNodeIdsRef = useRef(connectedNodeIds);
  connectedNodeIdsRef.current = connectedNodeIds;

  // Handle Canvas Resize (Retina / DPR Aware)
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Screen to Canvas Coordinates helper (1:1 with CSS logical pixels)
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cx = (sx - rect.width / 2 - panRef.current.x) / zoomRef.current;
    const cy = (sy - rect.height / 2 - panRef.current.y) / zoomRef.current;
    return { x: cx, y: cy };
  }, []);

  // Find node under mouse (generous hit testing)
  const getNodeAt = useCallback((x: number, y: number): GraphNode | null => {
    const nodes = Array.from(nodesRef.current.values());
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      const hitRadius = n.radius + 16;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return n;
      }
    }
    return null;
  }, []);

  // Physics Simulation Loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const tick = () => {
      if (!running) return;
      timeRef.current += 0.02;
      const t = timeRef.current;

      const nodes = Array.from(nodesRef.current.values());
      const links = linksRef.current;
      const nodeMap = nodesRef.current;

      // 1. Repulsion between nodes (Coulomb force)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 100;
          const dist = Math.sqrt(distSq);
          const force = (a.radius * b.radius * 260) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (a.fx === null) { a.vx -= fx; a.vy -= fy; }
          if (b.fx === null) { b.vx += fx; b.vy += fy; }
        }
      }

      // 2. Spring attraction along links (Hooke's Law)
      for (const link of links) {
        const a = nodeMap.get(link.source);
        const b = nodeMap.get(link.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const delta = dist - link.length;
        const springForce = delta * 0.045;
        const fx = (dx / dist) * springForce;
        const fy = (dy / dist) * springForce;

        if (a.fx === null) { a.vx += fx; a.vy += fy; }
        if (b.fx === null) { b.vx += fx; b.vy += fy; }
      }

      // 3. Center gravity (pull gently toward origin)
      for (const n of nodes) {
        const distFromCenter = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
        const centerForce = distFromCenter * 0.0035;
        if (n.fx === null) {
          n.vx -= (n.x / distFromCenter) * centerForce;
          n.vy -= (n.y / distFromCenter) * centerForce;
        }
      }

      // 4. Update velocity and position with damping + ambient hover micro-drift
      for (const n of nodes) {
        if (n.fx !== null && n.fy !== null) {
          n.x = n.fx;
          n.y = n.fy;
          n.vx = 0;
          n.vy = 0;
        } else {
          // Ambient gentle floating motion
          const driftX = Math.sin(t + n.seed) * 0.18;
          const driftY = Math.cos(t * 0.8 + n.seed * 1.3) * 0.18;

          n.vx = (n.vx + driftX) * 0.88;
          n.vy = (n.vy + driftY) * 0.88;
          n.x += n.vx;
          n.y += n.vy;
        }
      }

      // 5. Render Canvas with proper Retina scaling
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const curPan = panRef.current;
      const curZoom = zoomRef.current;
      const curHovered = hoveredNodeIdRef.current;
      const curConnected = connectedNodeIdsRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(dpr, dpr);
      // Center based on CSS client dimensions
      ctx.translate(rect.width / 2 + curPan.x, rect.height / 2 + curPan.y);
      ctx.scale(curZoom, curZoom);

      // Render links
      for (const link of links) {
        const a = nodeMap.get(link.source);
        const b = nodeMap.get(link.target);
        if (!a || !b) continue;

        const isHighlighted = curHovered && (link.source === curHovered || link.target === curHovered);
        const isDimmed = curHovered && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isHighlighted) {
          ctx.strokeStyle = '#8ba9c9';
          ctx.lineWidth = 2.4;
          ctx.globalAlpha = 0.95;
        } else if (isDimmed) {
          ctx.strokeStyle = '#242b3d';
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.15;
        } else {
          ctx.strokeStyle = '#242b3d';
          ctx.lineWidth = 1.1;
          ctx.globalAlpha = 0.65;
        }
        ctx.stroke();
      }

      // Render nodes
      for (const n of nodes) {
        const isHovered = curHovered === n.id;
        const isConnected = curConnected?.has(n.id);
        const isDimmed = curHovered !== null && !isConnected;

        ctx.globalAlpha = isDimmed ? 0.22 : 1;

        // Glow ring for hovered/selected nodes
        if (isHovered || isConnected) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + (isHovered ? 9 : 4), 0, Math.PI * 2);
          ctx.fillStyle = n.glowColor;
          ctx.fill();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, isHovered ? n.radius + 2.5 : n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(8,9,13,0.85)';
        ctx.lineWidth = isHovered ? 2.2 : 1.2;
        ctx.stroke();

        // Node label
        const showLabel = isHovered || n.type === 'dir' || curZoom > 0.82 || isConnected;
        if (showLabel) {
          ctx.font = `${isHovered ? 'bold ' : ''}${Math.max(9.5, 10 / curZoom)}px JetBrains Mono, monospace`;
          ctx.fillStyle = isHovered ? '#ffffff' : (isDimmed ? 'rgba(160,170,188,0.3)' : '#a0aabc');
          ctx.textAlign = 'center';
          ctx.fillText(n.name, n.x, n.y + n.radius + 12);
        }
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Pointer Handlers: Hold & Drag Physics with Single vs Double Click
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const targetNode = getNodeAt(x, y);

    dragDistanceRef.current = 0;

    if (targetNode) {
      isDraggingRef.current = targetNode.id;
      setIsDraggingNode(true);
      targetNode.fx = x;
      targetNode.fy = y;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (isDraggingRef.current) {
      dragDistanceRef.current += Math.hypot(e.movementX, e.movementY);
      const node = nodesRef.current.get(isDraggingRef.current);
      if (node) {
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
      }
    } else if (isPanningRef.current) {
      dragDistanceRef.current += Math.hypot(e.movementX, e.movementY);
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    } else {
      const hovered = getNodeAt(x, y);
      setHoveredNodeId(hovered ? hovered.id : null);
      if (hovered) {
        setHoverPos({ x: e.clientX, y: e.clientY });
      } else {
        setHoverPos(null);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const draggedId = isDraggingRef.current;

    if (draggedId) {
      const node = nodesRef.current.get(draggedId);
      if (node) {
        // Release fixed position so physics takes over
        node.fx = null;
        node.fy = null;
      }
      isDraggingRef.current = null;
      setIsDraggingNode(false);
    }

    const wasDragging = dragDistanceRef.current > 4;
    isPanningRef.current = false;

    // If this was a click (not a drag):
    if (!wasDragging && draggedId) {
      const node = nodesRef.current.get(draggedId);
      if (node) {
        const laid: LaidNode = {
          id: node.id,
          x: node.x,
          y: node.y,
          depth: node.depth,
          parentId: null,
          path: node.path,
          node: node.fsNode ?? {
            id: node.id,
            name: node.name,
            type: node.type === 'dir' ? 'dir' : 'file',
            content: node.content ?? (node.size ? `// Virtual file: ${node.name}\n` : ''),
          },
        };
        onNodeClick(laid);
      }
    }
  };

  // Wheel to Zoom
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.max(0.3, Math.min(3.0, Math.round(z * zoomFactor * 100) / 100)));
  };

  const hoveredNode = hoveredNodeId ? nodesRef.current.get(hoveredNodeId) : null;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[var(--surface-base)] select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className={cn(
          'w-full h-full block cursor-grab touch-none',
          (isDraggingNode || isPanningRef.current) && 'cursor-grabbing'
        )}
      />

      {/* Floating HUD Tooltip on Node Hover */}
      {hoveredNode && hoverPos && !isDraggingNode && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full mb-3 px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-overlay)]/95 shadow-2xl backdrop-blur font-mono text-[11px] flex items-center gap-2"
          style={{ left: hoverPos.x, top: hoverPos.y - 12 }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
          <span className="font-semibold text-[var(--text-primary)]">{hoveredNode.name}</span>
          <span className="text-[var(--text-muted)] text-[10px]">
            {hoveredNode.type === 'dir' ? 'dir' : humanSize(hoveredNode.size)}
          </span>
          <span className="text-[var(--border-strong)]">·</span>
          <span className="text-[var(--semantic-info)] text-[9.5px]">click to inspect</span>
        </div>
      )}

      {/* Graph View Controls */}
      <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 font-mono text-[10px]">
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Recenter and reset zoom"
        >
          Recenter
        </button>
        <span className="rounded border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1.5 py-1 text-[var(--text-muted)]">
          {Math.round(zoom * 100)}%
        </span>
        <span className="text-[var(--text-muted)] text-[9.5px] ml-2 hidden sm:inline">
          Hold & drag files to pull spring connections · Click to inspect · Scroll to zoom
        </span>
      </div>
    </div>
  );
});
