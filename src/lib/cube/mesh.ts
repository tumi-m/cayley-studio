import { BufferAttribute, BufferGeometry, Color } from "three";
import { COLOR, Cube, cubieWorldColors, type Cubie } from "./model";

const PLASTIC = new Color(COLOR.PLASTIC);
const TMP = new Color();

const FACE_CORNERS: [number, number, number, [number, number, number][]][] = [
  [1, 0, 0, [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]],
  [-1, 0, 0, [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]],
  [0, 1, 0, [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
  [0, -1, 0, [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
  [0, 0, 1, [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]]],
  [0, 0, -1, [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]]],
];

function addBox(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  px: number,
  py: number,
  pz: number,
  hx: number,
  hy: number,
  hz: number,
  color: Color,
): void {
  for (const [nx, ny, nz, corners] of FACE_CORNERS) {
    const base = positions.length / 3;
    for (const [sx, sy, sz] of corners) {
      positions.push(px + sx * hx, py + sy * hy, pz + sz * hz);
      normals.push(nx, ny, nz);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function addCubie(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  cubie: Cubie,
  step: number,
  body: number,
  stick: number,
  stickT: number,
): void {
  addBox(
    positions,
    normals,
    colors,
    indices,
    cubie.pos[0] * step,
    cubie.pos[1] * step,
    cubie.pos[2] * step,
    body,
    body,
    body,
    PLASTIC,
  );
  const cols = cubieWorldColors(cubie);
  const normals6: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const d = step * 0.5 - stickT * 0.15;
  normals6.forEach((n, i) => {
    const hex = cols[i]!;
    if (hex === COLOR.PLASTIC) return;
    TMP.setHex(hex);
    addBox(
      positions,
      normals,
      colors,
      indices,
      cubie.pos[0] * step + n[0] * d,
      cubie.pos[1] * step + n[1] * d,
      cubie.pos[2] * step + n[2] * d,
      n[0] !== 0 ? stickT : stick,
      n[1] !== 0 ? stickT : stick,
      n[2] !== 0 ? stickT : stick,
      TMP,
    );
  });
}

/** One mesh-worth of a 3×3 cube: black plastic cubies + coloured stickers. */
export function buildNodeGeometry(cube: Cube, scale: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const step = scale / 3;
  const body = step * 0.46;
  const stick = step * 0.4;
  const stickT = scale * 0.028;
  for (const cubie of cube.cubies) {
    addCubie(positions, normals, colors, indices, cubie, step, body, stick, stickT);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
