import {
  ALL_MOVES,
  Cube,
  invertSequence,
  mulberry32,
  randomScramble,
  type Move,
} from "./model";

export interface GraphNode {
  id: string;
  cube: Cube;
  x: number;
  y: number;
  z: number;
  onPath: boolean;
  walkIndex: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  onPath: boolean;
}

export interface CubeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  walk: string[];
  scramble: Move[];
  solution: Move[];
  idToIndex: Map<string, number>;
}

const NODE_CAP = 92;

function trefoil(t: number, s = 2.55): [number, number, number] {
  return [
    s * (Math.sin(t) + 2 * Math.sin(2 * t)),
    s * (Math.cos(t) - 2 * Math.cos(2 * t)) * 1.02,
    s * -Math.sin(3 * t) * 1.12,
  ];
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addState(map: Map<string, Cube>, cube: Cube): string {
  const k = cube.key();
  if (!map.has(k)) map.set(k, cube.clone());
  return k;
}

function expandNeighbors(
  map: Map<string, Cube>,
  sources: Cube[],
  cap: number,
): void {
  for (const src of sources) {
    if (map.size >= cap) return;
    for (const mv of ALL_MOVES) {
      if (map.size >= cap) return;
      addState(map, src.clone().apply(mv));
    }
  }
}

export function buildPathGraph(seed = 7, scrambleLen = 12): CubeGraph {
  const rng = mulberry32(seed);
  const scramble = randomScramble(scrambleLen, rng);
  const solution = invertSequence(scramble);

  const map = new Map<string, Cube>();
  const walk: string[] = [];
  const walker = Cube.solved(3);
  walk.push(addState(map, walker));
  for (const mv of scramble) {
    walker.apply(mv);
    walk.push(addState(map, walker));
  }

  const pathCubes = [...map.values()].map((c) => c.clone());
  expandNeighbors(map, pathCubes, NODE_CAP);
  if (map.size < NODE_CAP) {
    expandNeighbors(
      map,
      [...map.values()].map((c) => c.clone()),
      NODE_CAP,
    );
  }

  const pathSet = new Set(walk);
  const ids = [...map.keys()];
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);

  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  const pushEdge = (a: string, b: string, onPath: boolean) => {
    if (a === b) return;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const ek = `${lo}|${hi}`;
    if (edgeSet.has(ek)) {
      if (onPath) {
        const existing = edges.find(
          (e) => (e.from === lo && e.to === hi) || (e.from === hi && e.to === lo),
        );
        if (existing) existing.onPath = true;
      }
      return;
    }
    edgeSet.add(ek);
    edges.push({ from: lo, to: hi, onPath });
    adj.get(lo)!.push(hi);
    adj.get(hi)!.push(lo);
  };

  for (const id of ids) {
    const cube = map.get(id)!;
    for (const mv of ALL_MOVES) {
      const nk = cube.clone().apply(mv).key();
      if (map.has(nk)) pushEdge(id, nk, false);
    }
  }

  for (let i = 0; i < walk.length - 1; i++) {
    pushEdge(walk[i]!, walk[i + 1]!, true);
  }

  const pos = layoutGraph(ids, walk, adj, rng);

  const walkIndexOf = new Map<string, number>();
  walk.forEach((id, i) => {
    if (!walkIndexOf.has(id)) walkIndexOf.set(id, i);
  });

  const nodes: GraphNode[] = ids.map((id) => {
    const p = pos.get(id)!;
    return {
      id,
      cube: map.get(id)!,
      x: p[0],
      y: p[1],
      z: p[2],
      onPath: pathSet.has(id),
      walkIndex: walkIndexOf.get(id) ?? -1,
    };
  });

  const idToIndex = new Map<string, number>();
  nodes.forEach((n, i) => idToIndex.set(n.id, i));

  return { nodes, edges, walk, scramble, solution, idToIndex };
}

function layoutGraph(
  ids: string[],
  walk: string[],
  adj: Map<string, string[]>,
  rng: () => number,
): Map<string, [number, number, number]> {
  const pos = new Map<string, [number, number, number]>();
  const uniqueWalk: string[] = [];
  const seen = new Set<string>();
  for (const id of walk) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueWalk.push(id);
  }
  const nPath = Math.max(uniqueWalk.length, 1);
  const pathIndex = new Map<string, number>();
  uniqueWalk.forEach((id, i) => pathIndex.set(id, i));

  uniqueWalk.forEach((id, i) => {
    const t = (i / nPath) * Math.PI * 2;
    pos.set(id, trefoil(t));
  });

  const distToPath = new Map<string, number>();
  const nearestPath = new Map<string, string>();
  const queue: string[] = [...uniqueWalk];
  for (const id of uniqueWalk) {
    distToPath.set(id, 0);
    nearestPath.set(id, id);
  }
  let qh = 0;
  while (qh < queue.length) {
    const cur = queue[qh++]!;
    const d = distToPath.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      if (distToPath.has(nb)) continue;
      distToPath.set(nb, d + 1);
      nearestPath.set(nb, nearestPath.get(cur)!);
      queue.push(nb);
    }
  }

  for (const id of ids) {
    if (pathIndex.has(id)) continue;
    const anchorId = nearestPath.get(id) ?? uniqueWalk[0]!;
    const pi = pathIndex.get(anchorId) ?? 0;
    const t = (pi / nPath) * Math.PI * 2;
    const p = trefoil(t);
    const q = trefoil(t + 0.04);
    let tx = q[0] - p[0];
    let ty = q[1] - p[1];
    let tz = q[2] - p[2];
    const tm = Math.hypot(tx, ty, tz) || 1;
    tx /= tm;
    ty /= tm;
    tz /= tm;
    const h = hash32(id);
    const layer = distToPath.get(id) ?? 2;
    const side = h & 1 ? 1 : -1;
    const upx = ty * 0.31 - tz * 0.17;
    const upy = tz * 0.31 - tx * 0.17;
    const upz = tx * 0.31 - ty * 0.17;
    const um = Math.hypot(upx, upy, upz) || 1;
    const out = 1.25 * layer + ((h >> 3) % 11) * 0.07;
    const along = ((h % 13) - 6) * 0.07;
    pos.set(id, [
      p[0] + tx * along + (upx / um) * side * out,
      p[1] + ty * along + (upy / um) * side * out,
      p[2] + tz * along + (upz / um) * side * out,
    ]);
  }

  const n = ids.length;
  const pts = ids.map((id) => pos.get(id)!);
  const minDist = 1.62;
  for (let iter = 0; iter < 36; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pts[i]![0] - pts[j]![0];
        let dy = pts[i]![1] - pts[j]![1];
        let dz = pts[i]![2] - pts[j]![2];
        let dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) {
          dx = (rng() - 0.5) * 0.04;
          dy = (rng() - 0.5) * 0.04;
          dz = (rng() - 0.5) * 0.04;
          dist = Math.hypot(dx, dy, dz);
        }
        if (dist >= minDist) continue;
        const push = ((minDist - dist) / dist) * 0.38;
        const am = pathIndex.has(ids[i]!) ? 0.08 : 1;
        const bm = pathIndex.has(ids[j]!) ? 0.08 : 1;
        pts[i]![0] += dx * push * am;
        pts[i]![1] += dy * push * am;
        pts[i]![2] += dz * push * am;
        pts[j]![0] -= dx * push * bm;
        pts[j]![1] -= dy * push * bm;
        pts[j]![2] -= dz * push * bm;
      }
    }
    uniqueWalk.forEach((id, i) => {
      const t = (i / nPath) * Math.PI * 2;
      const p = trefoil(t);
      const pt = pts[ids.indexOf(id)]!;
      pt[0] += (p[0] - pt[0]) * 0.5;
      pt[1] += (p[1] - pt[1]) * 0.5;
      pt[2] += (p[2] - pt[2]) * 0.5;
    });
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let maxR = 0.001;
  for (const p of pts) {
    maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
  }
  const s = 7.6 / maxR;
  ids.forEach((id, i) => {
    pos.set(id, [
      (pts[i]![0] - cx) * s,
      (pts[i]![1] - cy) * s,
      (pts[i]![2] - cz) * s,
    ]);
  });
  return pos;
}
