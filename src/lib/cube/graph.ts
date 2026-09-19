import {
  ALL_MOVES,
  Cube,
  invertSequence,
  moveFace,
  mulberry32,
  randomScramble,
  type Move,
  type Vec3,
} from "./model";

export interface GraphNode {
  id: string;
  cube: Cube;
  position: Vec3;
  depth: number;
  onPath: boolean;
  pathIndex: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  onPath: boolean;
}

export interface CubeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  path: string[];
  scramble: Move[];
  solution: Move[];
  explored: number;
  shortest: boolean;
}

interface Meta {
  key: string;
  depth: number;
  parent: string | null;
  move: Move | null;
}

export function bfsSolve(
  start: Cube,
  maxDepth = 4,
  maxNodes = 50000,
): { path: Move[]; meta: Map<string, Meta>; found: boolean } {
  const goal = Cube.solved(start.size).key();
  const startKey = start.key();
  const meta = new Map<string, Meta>();
  meta.set(startKey, { key: startKey, depth: 0, parent: null, move: null });
  if (startKey === goal) return { path: [], meta, found: true };

  const queue: Cube[] = [start.clone()];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++]!;
    const ck = cur.key();
    const info = meta.get(ck)!;
    if (info.depth >= maxDepth) continue;
    const prevFace = info.move ? moveFace(info.move) : null;

    for (const mv of ALL_MOVES) {
      if (prevFace && moveFace(mv) === prevFace) continue;
      const nxt = cur.clone();
      nxt.apply(mv);
      const nk = nxt.key();
      if (meta.has(nk)) continue;
      meta.set(nk, { key: nk, depth: info.depth + 1, parent: ck, move: mv });
      if (nk === goal) {
        return { path: reconstruct(meta, nk), meta, found: true };
      }
      queue.push(nxt);
      if (meta.size >= maxNodes) {
        return { path: [], meta, found: false };
      }
    }
  }
  return { path: [], meta, found: false };
}

function reconstruct(meta: Map<string, Meta>, end: string): Move[] {
  const moves: Move[] = [];
  let cur: string | null = end;
  while (cur) {
    const m = meta.get(cur);
    if (!m || !m.move) break;
    moves.push(m.move);
    cur = m.parent;
  }
  moves.reverse();
  return moves;
}

function ancestorChain(meta: Map<string, Meta>, key: string): string[] {
  const chain: string[] = [];
  let cur: string | null = key;
  while (cur) {
    chain.push(cur);
    cur = meta.get(cur)?.parent ?? null;
  }
  return chain;
}

function sampleSearchTree(
  meta: Map<string, Meta>,
  pathKeys: string[],
  limit: number,
  rng: () => number,
): Set<string> {
  const keep = new Set<string>(pathKeys);
  for (const [k, v] of meta) {
    if (v.depth <= 2) keep.add(k);
  }
  const extras = [...meta.keys()].filter((k) => !keep.has(k));
  for (let i = extras.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = extras[i]!;
    extras[i] = extras[j]!;
    extras[j] = tmp;
  }
  for (const k of extras) {
    if (keep.size >= limit) break;
    keep.add(k);
  }
  const withAncestors = new Set<string>();
  for (const k of keep) {
    for (const a of ancestorChain(meta, k)) withAncestors.add(a);
  }
  return withAncestors;
}

function layoutNodes(
  ids: string[],
  path: string[],
  depthOf: (id: string) => number,
  rng: () => number,
): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  const pathSet = new Set(path);
  const nPath = Math.max(path.length - 1, 1);

  path.forEach((id, i) => {
    const t = i / nPath;
    const theta = t * Math.PI * 1.35 - 0.4;
    const r = 6.4;
    pos.set(id, [
      Math.sin(theta) * r,
      (t - 0.5) * 5.2,
      Math.cos(theta) * r * 0.85,
    ]);
  });

  const others = ids.filter((id) => !pathSet.has(id));
  const golden = Math.PI * (3 - Math.sqrt(5));
  others.forEach((id, i) => {
    const d = depthOf(id);
    const y = 1 - (i / Math.max(others.length - 1, 1)) * 2;
    const radiusXY = Math.sqrt(Math.max(1 - y * y, 0));
    const theta = i * golden;
    const shell = 4.2 + d * 1.55 + rng() * 0.6;
    pos.set(id, [
      Math.cos(theta) * radiusXY * shell,
      y * shell * 0.72,
      Math.sin(theta) * radiusXY * shell,
    ]);
  });

  const list = ids.map((id) => pos.get(id)!);
  for (let iter = 0; iter < 28; iter++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        const dist = Math.hypot(dx, dy, dz) || 0.0001;
        const min = pathSet.has(ids[i]!) && pathSet.has(ids[j]!) ? 2.2 : 1.55;
        if (dist < min) {
          const push = ((min - dist) / dist) * 0.42;
          a[0] += dx * push;
          a[1] += dy * push;
          a[2] += dz * push;
          b[0] -= dx * push;
          b[1] -= dy * push;
          b[2] -= dz * push;
        }
      }
    }
  }
  return pos;
}

function cubesFromMeta(
  start: Cube,
  meta: Map<string, Meta>,
  keys: Set<string>,
): Map<string, Cube> {
  const cubes = new Map<string, Cube>();
  cubes.set(start.key(), start.clone());
  const remaining = [...keys].filter((k) => k !== start.key());
  const byDepth = remaining.sort(
    (a, b) => (meta.get(a)?.depth ?? 0) - (meta.get(b)?.depth ?? 0),
  );
  for (const k of byDepth) {
    const info = meta.get(k);
    if (!info || !info.parent || !info.move) continue;
    const parent = cubes.get(info.parent);
    if (!parent) continue;
    const c = parent.clone();
    c.apply(info.move);
    cubes.set(k, c);
  }
  return cubes;
}

export function buildShortestPathGraph(scrambleLen = 4, seed = 7): CubeGraph {
  const rng = mulberry32(seed);
  const scramble = randomScramble(scrambleLen, rng);
  const start = Cube.solved(3).applySequence(scramble);
  const { path: solution, meta, found } = bfsSolve(start, scrambleLen, 80000);
  const pathMoves = found ? solution : invertSequence(scramble);

  const pathKeys: string[] = [start.key()];
  const walker = start.clone();
  for (const m of pathMoves) {
    walker.apply(m);
    pathKeys.push(walker.key());
  }

  const keep = sampleSearchTree(meta, pathKeys, 68, rng);
  for (const k of pathKeys) keep.add(k);
  const cubeMap = cubesFromMeta(start, meta, keep);
  if (!found) {
    const w = Cube.solved(3);
    cubeMap.set(w.key(), w);
    const s = Cube.solved(3);
    for (const m of scramble) {
      s.apply(m);
      cubeMap.set(s.key(), s.clone());
    }
  }

  const ids = [...cubeMap.keys()];
  const depthOf = (id: string) => meta.get(id)?.depth ?? 0;
  const positions = layoutNodes(ids, pathKeys, depthOf, rng);
  const pathSet = new Set(pathKeys);

  const nodes: GraphNode[] = ids.map((id) => ({
    id,
    cube: cubeMap.get(id)!,
    position: positions.get(id) ?? [0, 0, 0],
    depth: depthOf(id),
    onPath: pathSet.has(id),
    pathIndex: pathKeys.indexOf(id),
  }));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const id of keep) {
    const info = meta.get(id);
    if (!info?.parent || !cubeMap.has(info.parent)) continue;
    const a = info.parent < id ? info.parent : id;
    const b = info.parent < id ? id : info.parent;
    const ek = `${a}|${b}`;
    if (seen.has(ek)) continue;
    seen.add(ek);
    const onPath =
      pathSet.has(id) &&
      pathSet.has(info.parent) &&
      Math.abs(pathKeys.indexOf(id) - pathKeys.indexOf(info.parent)) === 1;
    edges.push({ from: info.parent, to: id, onPath });
  }

  return {
    nodes,
    edges,
    path: pathKeys,
    scramble,
    solution: pathMoves,
    explored: meta.size,
    shortest: found,
  };
}

export function buildCayleyCloud(scrambleLen = 8, seed = 11): CubeGraph {
  const rng = mulberry32(seed);
  const scramble = randomScramble(scrambleLen, rng);
  const solution = invertSequence(scramble);
  const solved = Cube.solved(3);
  const cubes = new Map<string, Cube>();
  const pathKeys: string[] = [];
  const edges: GraphEdge[] = [];

  const record = (c: Cube) => {
    const k = c.key();
    if (!cubes.has(k)) cubes.set(k, c.clone());
    return k;
  };

  let prev: string | null = null;
  const cursor = solved.clone();
  prev = record(cursor);
  pathKeys.push(prev);
  for (const m of scramble) {
    cursor.apply(m);
    const k = record(cursor);
    pathKeys.push(k);
    edges.push({ from: prev, to: k, onPath: true });
    prev = k;
  }
  for (const m of solution) {
    cursor.apply(m);
    const k = record(cursor);
    pathKeys.push(k);
    edges.push({ from: prev, to: k, onPath: true });
    prev = k;
  }

  const pathCubes = pathKeys.map((k) => cubes.get(k)!);
  for (const pc of pathCubes) {
    const walks = 2 + (rng() > 0.5 ? 1 : 0);
    for (let w = 0; w < walks; w++) {
      const walker = pc.clone();
      let pk = pc.key();
      let last: Move | null = null;
      const len = 1 + Math.floor(rng() * 2);
      for (let s = 0; s < len; s++) {
        let mv: Move;
        do {
          mv = ALL_MOVES[Math.floor(rng() * ALL_MOVES.length)]!;
        } while (last && moveFace(mv) === moveFace(last));
        walker.apply(mv);
        const nk = record(walker);
        edges.push({ from: pk, to: nk, onPath: false });
        pk = nk;
        last = mv;
      }
    }
  }

  const ids = [...cubes.keys()];
  const pathIndex = new Map(pathKeys.map((k, i) => [k, i]));
  const depthOf = (id: string) => {
    const idx = pathIndex.get(id);
    if (idx !== undefined) return Math.min(idx, pathKeys.length - 1 - idx);
    return 3;
  };
  const positions = layoutNodes(ids, [...new Set(pathKeys)], depthOf, rng);
  const pathSet = new Set(pathKeys);

  const nodes: GraphNode[] = ids.map((id) => ({
    id,
    cube: cubes.get(id)!,
    position: positions.get(id) ?? [0, 0, 0],
    depth: depthOf(id),
    onPath: pathSet.has(id),
    pathIndex: pathKeys.indexOf(id),
  }));

  return {
    nodes,
    edges,
    path: pathKeys,
    scramble,
    solution,
    explored: cubes.size,
    shortest: false,
  };
}

export const FILM_SCRIPTS = {
  shortest: {
    id: "shortest" as const,
    title: "Shortest path",
    kicker: "Breadth-first search",
    caption: "Each node is a cube. Each edge is a face turn. The gold path is a shortest route home.",
  },
  cloud: {
    id: "cloud" as const,
    title: "Cayley cloud",
    kicker: "The move graph",
    caption: "A walk on the Cayley graph of the cube group, 43 quintillion vertices out of frame.",
  },
  search: {
    id: "search" as const,
    title: "Search wave",
    kicker: "Layer by layer",
    caption: "BFS expands in shells of equal distance. God's number for 3×3 is twenty.",
  },
} as const;

export type FilmId = keyof typeof FILM_SCRIPTS;
