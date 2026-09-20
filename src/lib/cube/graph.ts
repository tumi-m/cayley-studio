import {
  ALL_MOVES,
  COLOR,
  Cube,
  invertMove,
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
  ring: 0 | 1 | 2;
  color: number;
  onPath: boolean;
  walkIndex: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  onPath: boolean;
  moveLoToHi: Move;
}

export interface CubeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  walk: string[];
  scramble: Move[];
  solution: Move[];
  idToIndex: Map<string, number>;
  adj: Map<string, { id: string; move: Move }[]>;
}

const NODE_CAP = 64;
const RING_R = [0.3, 0.56, 0.82] as const;
const NODE_PALETTE = [COLOR.U, COLOR.D, COLOR.F, COLOR.B, COLOR.L, COLOR.R];

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

export function buildPathGraph(seed = 7, scrambleLen = 10): CubeGraph {
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

  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  const adj = new Map<string, { id: string; move: Move }[]>();
  for (const id of ids) adj.set(id, []);

  const pushEdge = (a: string, b: string, move: Move, onPath: boolean) => {
    if (a === b) return;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const ek = `${lo}|${hi}`;
    const moveLoToHi = a === lo ? move : invertMove(move);
    if (edgeSet.has(ek)) {
      if (onPath) {
        const existing = edges.find((e) => e.from === lo && e.to === hi);
        if (existing) existing.onPath = true;
      }
      return;
    }
    edgeSet.add(ek);
    edges.push({ from: lo, to: hi, onPath, moveLoToHi });
    adj.get(a)!.push({ id: b, move });
    adj.get(b)!.push({ id: a, move: invertMove(move) });
  };

  for (const id of ids) {
    const cube = map.get(id)!;
    for (const mv of ALL_MOVES) {
      const nk = cube.clone().apply(mv).key();
      if (map.has(nk)) pushEdge(id, nk, mv, false);
    }
  }

  for (let i = 0; i < scramble.length; i++) {
    pushEdge(walk[i]!, walk[i + 1]!, scramble[i]!, true);
  }

  const pos = layoutRings(ids, walk, adj, rng);

  const walkIndexOf = new Map<string, number>();
  walk.forEach((id, i) => {
    if (!walkIndexOf.has(id)) walkIndexOf.set(id, i);
  });

  const nodes: GraphNode[] = ids.map((id) => {
    const p = pos.get(id)!;
    const r = Math.hypot(p[0], p[1]);
    let ring: 0 | 1 | 2 = 2;
    if (r < (RING_R[0] + RING_R[1]) / 2) ring = 0;
    else if (r < (RING_R[1] + RING_R[2]) / 2) ring = 1;
    return {
      id,
      cube: map.get(id)!,
      x: p[0],
      y: p[1],
      ring,
      color: NODE_PALETTE[hash32(id) % NODE_PALETTE.length]!,
      onPath: pathSet.has(id),
      walkIndex: walkIndexOf.get(id) ?? -1,
    };
  });

  const idToIndex = new Map<string, number>();
  nodes.forEach((n, i) => idToIndex.set(n.id, i));

  return { nodes, edges, walk, scramble, solution, idToIndex, adj };
}

export function bfsMoves(
  graph: CubeGraph,
  fromId: string,
  toId: string,
): Move[] | null {
  if (fromId === toId) return [];
  if (!graph.adj.has(fromId) || !graph.adj.has(toId)) return null;
  const prev = new Map<string, { id: string; move: Move }>();
  const q = [fromId];
  const seen = new Set([fromId]);
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++]!;
    for (const nb of graph.adj.get(cur) ?? []) {
      if (seen.has(nb.id)) continue;
      seen.add(nb.id);
      prev.set(nb.id, { id: cur, move: nb.move });
      if (nb.id === toId) {
        const moves: Move[] = [];
        let at = toId;
        while (at !== fromId) {
          const step = prev.get(at)!;
          moves.push(step.move);
          at = step.id;
        }
        moves.reverse();
        return moves;
      }
      q.push(nb.id);
    }
  }
  return null;
}

function layoutRings(
  ids: string[],
  walk: string[],
  adj: Map<string, { id: string; move: Move }[]>,
  rng: () => number,
): Map<string, [number, number]> {
  const pos = new Map<string, [number, number]>();
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

  const dist = new Map<string, number>();
  const nearestPath = new Map<string, string>();
  const queue: string[] = [...uniqueWalk];
  uniqueWalk.forEach((id) => {
    dist.set(id, 0);
    nearestPath.set(id, id);
  });
  let qh = 0;
  while (qh < queue.length) {
    const cur = queue[qh++]!;
    const d = dist.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      if (dist.has(nb.id)) continue;
      dist.set(nb.id, d + 1);
      nearestPath.set(nb.id, nearestPath.get(cur)!);
      queue.push(nb.id);
    }
  }

  uniqueWalk.forEach((id, i) => {
    const t = i / Math.max(nPath - 1, 1);
    const angle = -2.45 + t * 4.55;
    const r = RING_R[2];
    pos.set(id, [Math.cos(angle) * r, Math.sin(angle) * r]);
  });

  const extras = ids.filter((id) => !pathIndex.has(id));
  extras.forEach((id, i) => {
    const ring = (i < 14 ? 0 : i < 34 ? 1 : 2) as 0 | 1 | 2;
    const k = ring === 0 ? i : ring === 1 ? i - 14 : i - 34;
    const nOn =
      ring === 0
        ? Math.min(14, extras.length)
        : ring === 1
          ? Math.min(20, Math.max(0, extras.length - 14))
          : Math.max(1, extras.length - 34);
    const h = hash32(id);
    const angle =
      (k / Math.max(nOn, 1)) * Math.PI * 2 + ((h % 9) - 4) * 0.05;
    const r = RING_R[ring];
    pos.set(id, [Math.cos(angle) * r, Math.sin(angle) * r]);
  });

  const minArc = 0.13;
  for (let iter = 0; iter < 40; iter++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i]!)!;
        const b = pos.get(ids[j]!)!;
        const ra = Math.hypot(a[0], a[1]);
        const rb = Math.hypot(b[0], b[1]);
        if (Math.abs(ra - rb) > 0.12) continue;
        let dx = a[0] - b[0];
        let dy = a[1] - b[1];
        let distab = Math.hypot(dx, dy);
        if (distab < 1e-6) {
          dx = (rng() - 0.5) * 0.02;
          dy = (rng() - 0.5) * 0.02;
          distab = Math.hypot(dx, dy);
        }
        const ringR = ra;
        const chord = minArc * ringR * 2;
        if (distab >= chord) continue;
        const push = ((chord - distab) / distab) * 0.4;
        const am = pathIndex.has(ids[i]!) ? 0.2 : 1;
        const bm = pathIndex.has(ids[j]!) ? 0.2 : 1;
        a[0] += dx * push * am;
        a[1] += dy * push * am;
        b[0] -= dx * push * bm;
        b[1] -= dy * push * bm;
      }
    }
    for (const id of ids) {
      const p = pos.get(id)!;
      const r = Math.hypot(p[0], p[1]) || 1;
      let ring: 0 | 1 | 2 = 2;
      if (r < (RING_R[0] + RING_R[1]) / 2) ring = 0;
      else if (r < (RING_R[1] + RING_R[2]) / 2) ring = 1;
      const target = RING_R[ring];
      p[0] *= target / r;
      p[1] *= target / r;
    }
    uniqueWalk.forEach((id, i) => {
      const t = i / Math.max(nPath - 1, 1);
      const angle = -2.45 + t * 4.55;
      const r = RING_R[2];
      const p = pos.get(id)!;
      p[0] += (Math.cos(angle) * r - p[0]) * 0.55;
      p[1] += (Math.sin(angle) * r - p[1]) * 0.55;
    });
  }

  return pos;
}
