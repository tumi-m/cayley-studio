export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export type Face = "U" | "D" | "L" | "R" | "F" | "B";
export type Move = `${Face}` | `${Face}'` | `${Face}2`;

export const FACES: Face[] = ["U", "R", "F", "D", "L", "B"];

export const ALL_MOVES: Move[] = FACES.flatMap((f) => [
  f,
  `${f}'` as Move,
  `${f}2` as Move,
]);

export const QTM_MOVES: Move[] = FACES.flatMap((f) => [f, `${f}'` as Move]);

export const FACE_AXIS: Record<Face, { axis: 0 | 1 | 2; layer: 1 | -1 }> = {
  R: { axis: 0, layer: 1 },
  L: { axis: 0, layer: -1 },
  U: { axis: 1, layer: 1 },
  D: { axis: 1, layer: -1 },
  F: { axis: 2, layer: 1 },
  B: { axis: 2, layer: -1 },
};

/** Right-hand quarter turns around the world axis for a clockwise face turn. */
export const FACE_RH: Record<Face, number> = {
  R: -1,
  L: 1,
  U: -1,
  D: 1,
  F: -1,
  B: 1,
};

/** Illustrated cube palette — light plastic, sticker colours from the reference. */
export const COLOR = {
  U: 0xf7f6f2,
  D: 0xf0c12e,
  F: 0x2f9a48,
  B: 0x2c5ec4,
  L: 0xe87828,
  R: 0xd1322c,
  PLASTIC: 0xf2f0ea,
} as const;

export const COLOR_ID: Record<Face, number> = {
  U: COLOR.U,
  R: COLOR.R,
  F: COLOR.F,
  D: COLOR.D,
  L: COLOR.L,
  B: COLOR.B,
};

export const FACE_NORMAL_INDEX: Record<Face, number> = {
  R: 0,
  L: 1,
  U: 2,
  D: 3,
  F: 4,
  B: 5,
};

export interface Cubie {
  home: Vec3;
  pos: Vec3;
  rot: Mat3;
}

export function cssHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function identityMat(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function rotRH(v: Vec3, axis: 0 | 1 | 2, k: number): Vec3 {
  let t = ((k % 4) + 4) % 4;
  let x = v[0];
  let y = v[1];
  let z = v[2];
  while (t--) {
    if (axis === 0) {
      const ny = -z;
      const nz = y;
      y = ny;
      z = nz;
    } else if (axis === 1) {
      const nx = z;
      const nz = -x;
      x = nx;
      z = nz;
    } else {
      const nx = -y;
      const ny = x;
      x = nx;
      y = ny;
    }
  }
  return [x, y, z];
}

export function matFromRotRH(axis: 0 | 1 | 2, k: number): Mat3 {
  const X = rotRH([1, 0, 0], axis, k);
  const Y = rotRH([0, 1, 0], axis, k);
  const Z = rotRH([0, 0, 1], axis, k);
  return [
    [X[0], Y[0], Z[0]],
    [X[1], Y[1], Z[1]],
    [X[2], Y[2], Z[2]],
  ];
}

export function matMul(a: Mat3, b: Mat3): Mat3 {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
    ],
  ];
}

export function applyMat(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export function parseMove(move: Move): { face: Face; turns: 1 | 2 | 3 } {
  const face = move[0] as Face;
  if (move.endsWith("2")) return { face, turns: 2 };
  if (move.endsWith("'")) return { face, turns: 3 };
  return { face, turns: 1 };
}

export function invertMove(move: Move): Move {
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move[0] as Move;
  return `${move}'` as Move;
}

export function invertSequence(moves: Move[]): Move[] {
  return moves.slice().reverse().map(invertMove);
}

export function moveFace(move: Move): Face {
  return move[0] as Face;
}

export function rhQuarters(move: Move): number {
  const { face, turns } = parseMove(move);
  return FACE_RH[face] * turns;
}

function homeIndex(h: Vec3): number {
  return (h[0] + 1) * 9 + (h[1] + 1) * 3 + (h[2] + 1);
}

export class Cube {
  size: 2 | 3;
  cubies: Cubie[];

  constructor(size: 2 | 3 = 3, cubies?: Cubie[]) {
    this.size = size;
    this.cubies = cubies ?? Cube.makeSolvedCubies(size);
  }

  static makeSolvedCubies(size: 2 | 3): Cubie[] {
    const cubies: Cubie[] = [];
    const coords: number[] = size === 2 ? [-1, 1] : [-1, 0, 1];
    for (const x of coords) {
      for (const y of coords) {
        for (const z of coords) {
          if (x === 0 && y === 0 && z === 0) continue;
          if (size === 2 && (Math.abs(x) !== 1 || Math.abs(y) !== 1 || Math.abs(z) !== 1)) {
            continue;
          }
          cubies.push({
            home: [x, y, z],
            pos: [x, y, z],
            rot: identityMat(),
          });
        }
      }
    }
    return cubies;
  }

  static solved(size: 2 | 3 = 3): Cube {
    return new Cube(size);
  }

  clone(): Cube {
    return new Cube(
      this.size,
      this.cubies.map((c) => ({
        home: [c.home[0], c.home[1], c.home[2]],
        pos: [c.pos[0], c.pos[1], c.pos[2]],
        rot: [
          [c.rot[0][0], c.rot[0][1], c.rot[0][2]],
          [c.rot[1][0], c.rot[1][1], c.rot[1][2]],
          [c.rot[2][0], c.rot[2][1], c.rot[2][2]],
        ],
      })),
    );
  }

  apply(move: Move): this {
    const { face } = parseMove(move);
    const { axis, layer } = FACE_AXIS[face];
    const k = ((rhQuarters(move) % 4) + 4) % 4;
    if (k === 0) return this;
    const R = matFromRotRH(axis, k);
    for (const cubie of this.cubies) {
      if (cubie.pos[axis] !== layer) continue;
      cubie.pos = rotRH(cubie.pos, axis, k);
      cubie.pos = [
        Math.round(cubie.pos[0]),
        Math.round(cubie.pos[1]),
        Math.round(cubie.pos[2]),
      ];
      cubie.rot = matMul(R, cubie.rot);
    }
    return this;
  }

  applySequence(moves: Move[]): this {
    for (const m of moves) this.apply(m);
    return this;
  }

  key(): string {
    const sorted = this.cubies
      .slice()
      .sort((a, b) => homeIndex(a.home) - homeIndex(b.home));
    let s = "";
    for (const c of sorted) {
      s += `${c.pos[0] + 1}${c.pos[1] + 1}${c.pos[2] + 1}`;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) s += String(c.rot[i][j] + 1);
      }
    }
    return s;
  }

  isSolved(): boolean {
    return this.cubies.every(
      (c) =>
        c.pos[0] === c.home[0] &&
        c.pos[1] === c.home[1] &&
        c.pos[2] === c.home[2] &&
        c.rot[0][0] === 1 &&
        c.rot[1][1] === 1 &&
        c.rot[2][2] === 1,
    );
  }
}

export function homeStickerColor(home: Vec3, localDir: Vec3): number {
  if (localDir[0] === 1 && home[0] === 1) return COLOR.R;
  if (localDir[0] === -1 && home[0] === -1) return COLOR.L;
  if (localDir[1] === 1 && home[1] === 1) return COLOR.U;
  if (localDir[1] === -1 && home[1] === -1) return COLOR.D;
  if (localDir[2] === 1 && home[2] === 1) return COLOR.F;
  if (localDir[2] === -1 && home[2] === -1) return COLOR.B;
  return COLOR.PLASTIC;
}

const WORLD_FACES: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function cubieWorldColors(cubie: Cubie): number[] {
  const inv = transpose(cubie.rot);
  return WORLD_FACES.map((n) => {
    const local = applyMat(inv, n);
    const snapped: Vec3 = [
      Math.round(local[0]),
      Math.round(local[1]),
      Math.round(local[2]),
    ];
    return homeStickerColor(cubie.home, snapped);
  });
}

export function randomScramble(n: number, rng: () => number = Math.random): Move[] {
  const moves: Move[] = [];
  let lastFace: Face | null = null;
  let lastAxis: 0 | 1 | 2 | null = null;
  for (let i = 0; i < n; i++) {
    let move: Move;
    let face: Face;
    do {
      move = ALL_MOVES[Math.floor(rng() * ALL_MOVES.length)]!;
      face = moveFace(move);
    } while (face === lastFace || FACE_AXIS[face].axis === lastAxis && rng() < 0.45);
    moves.push(move);
    lastFace = face;
    lastAxis = FACE_AXIS[face].axis;
  }
  return moves;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
