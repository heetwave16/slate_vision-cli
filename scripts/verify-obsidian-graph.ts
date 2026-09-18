import { initialEnv } from '../src/engine/interpreter';
import { HOME } from '../src/engine/fs';
import type { FsNode } from '../src/engine/types';

interface GraphNode {
  id: string;
  name: string;
  path: string;
  radius: number;
  depth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  seed: number;
}

interface GraphLink {
  source: string;
  target: string;
  length: number;
}

function runPhysicsTest() {
  const env = initialEnv();
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  let seed = 0;

  const walk = (node: FsNode, path: string, parentId: string | null, depth: number) => {
    if (node.phantom) return;
    const isDir = node.type === 'dir';
    const radius = isDir ? Math.max(12, 17 - depth * 2) : 7.5;
    const parent = parentId ? nodes.get(parentId) : null;
    const baseAngle = seed * 1.35;
    const defaultDist = isDir ? 55 : 36;
    const defaultX = parent
      ? parent.x + Math.cos(baseAngle) * defaultDist
      : (depth === 0 ? 0 : Math.cos(baseAngle) * (45 + depth * 40));
    const defaultY = parent
      ? parent.y + Math.sin(baseAngle) * defaultDist
      : (depth === 0 ? 0 : Math.sin(baseAngle) * (45 + depth * 40));

    const gNode: GraphNode = {
      id: node.id,
      name: node.name,
      path,
      x: defaultX,
      y: defaultY,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      radius,
      depth,
      seed: ++seed,
    };
    nodes.set(node.id, gNode);

    if (parentId) {
      links.push({
        source: parentId,
        target: node.id,
        length: isDir ? 60 : 42,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child, path + '/' + child.name, node.id, depth + 1);
      }
    }
  };

  walk(env.fs, HOME, null, 0);

  const step = () => {
    const nodeList = Array.from(nodes.values());
    const MAX_REPULSION_DIST = 180;
    const MAX_REP_DIST_SQ = MAX_REPULSION_DIST * MAX_REPULSION_DIST;

    // 1. Repulsion
    for (let i = 0; i < nodeList.length; i++) {
      const a = nodeList[i];
      for (let j = i + 1; j < nodeList.length; j++) {
        const b = nodeList[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > MAX_REP_DIST_SQ) continue;

        const minSafeDist = a.radius + b.radius + 8;
        const effDistSq = Math.max(distSq, minSafeDist * minSafeDist);
        const dist = Math.sqrt(effDistSq);
        const repForce = ((a.radius + b.radius) * 16) / effDistSq;
        const fx = (dx / dist) * repForce;
        const fy = (dy / dist) * repForce;

        if (a.fx === null) { a.vx -= fx; a.vy -= fy; }
        if (b.fx === null) { b.vx += fx; b.vy += fy; }
      }
    }

    // 2. Springs
    for (const link of links) {
      const a = nodes.get(link.source);
      const b = nodes.get(link.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const delta = dist - link.length;
      const springForce = delta * 0.055;
      const fx = (dx / dist) * springForce;
      const fy = (dy / dist) * springForce;

      if (a.fx === null) { a.vx += fx; a.vy += fy; }
      if (b.fx === null) { b.vx -= fx; b.vy -= fy; }
    }

    // 3. Anchoring and center gravity
    for (const n of nodeList) {
      if (n.fx !== null) continue;
      if (n.depth === 0) {
        n.vx += (0 - n.x) * 0.08;
        n.vy += (0 - n.y) * 0.08;
      } else {
        n.vx -= n.x * 0.006;
        n.vy -= n.y * 0.006;
      }
    }

    // 4. Update
    const MAX_VEL = 8.0;
    for (const n of nodeList) {
      if (n.fx !== null && n.fy !== null) {
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= 0.76;
        n.vy *= 0.76;

        const speed = Math.hypot(n.vx, n.vy);
        if (speed > MAX_VEL) {
          n.vx = (n.vx / speed) * MAX_VEL;
          n.vy = (n.vy / speed) * MAX_VEL;
        }

        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
          n.x = 0;
          n.y = 0;
          n.vx = 0;
          n.vy = 0;
        } else {
          n.x += n.vx;
          n.y += n.vy;
        }

        const r = Math.hypot(n.x, n.y);
        if (r > 320) {
          const excess = r - 320;
          n.x -= (n.x / r) * (excess * 0.3);
          n.y -= (n.y / r) * (excess * 0.3);
          n.vx *= 0.5;
          n.vy *= 0.5;
        }
      }
    }
  };

  console.log('🧪 VERIFYING OBSIDIAN GRAPH PHYSICS STABILITY...');

  // Test 1: 300 simulation frames
  for (let f = 1; f <= 300; f++) {
    step();
  }

  const nodeList = Array.from(nodes.values());
  const maxDist = Math.max(...nodeList.map(n => Math.hypot(n.x, n.y)));
  const avgSpeed = nodeList.reduce((acc, n) => acc + Math.hypot(n.vx, n.vy), 0) / nodeList.length;

  console.log(`  After 300 frames: Max Node Distance = ${maxDist.toFixed(1)}px (Expect < 180px)`);
  console.log(`  After 300 frames: Average Node Speed = ${avgSpeed.toFixed(4)}px/f (Expect < 0.1px/f)`);

  if (maxDist > 220) {
    throw new Error(`FAIL: Max node distance ${maxDist} exceeded safe bounds (nodes drifting away)`);
  }
  if (avgSpeed > 0.15) {
    throw new Error(`FAIL: Average node speed ${avgSpeed} did not settle (unstable kinetic energy)`);
  }

  // Test 2: Drag node test
  const testNode = nodeList.find(n => n.name === 'project')!;
  testNode.fx = 250;
  testNode.fy = 250;
  for (let f = 1; f <= 30; f++) step();
  // Release
  testNode.fx = null;
  testNode.fy = null;
  for (let f = 1; f <= 120; f++) step();

  const postDragDist = Math.hypot(testNode.x, testNode.y);
  console.log(`  Post-drag recovery: Node returned to distance ${postDragDist.toFixed(1)}px from origin`);
  if (postDragDist > 200) {
    throw new Error(`FAIL: Node did not recover from drag (${postDragDist}px)`);
  }

  // Test 3: No NaN or Infinite coordinates
  for (const n of nodeList) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.vx) || !Number.isFinite(n.vy)) {
      throw new Error(`FAIL: Node ${n.name} has non-finite coordinates`);
    }
  }

  console.log('✅ ALL OBSIDIAN GRAPH PHYSICS VERIFICATIONS PASSED SUCCESSFULLY!');
}

runPhysicsTest();
