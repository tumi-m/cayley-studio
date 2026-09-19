import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Timer,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  COLOR,
  Cube,
  FACE_AXIS,
  cubieWorldColors,
  identityMat,
  parseMove,
  rhQuarters,
  type Cubie,
  type Move,
} from "./model";
import { buildPathGraph, type CubeGraph, type GraphNode } from "./graph";
import { buildNodeGeometry } from "./mesh";

export interface StageSnapshot {
  playing: boolean;
  ready: boolean;
  phase: string;
  moveLabel: string;
  nodes: number;
  step: number;
  total: number;
}

const VOID = 0x050506;
const NODE_SCALE = 1.28;
const PATH_SCALE = 1.38;
const HERO_SCALE = 1.72;

const PLASTIC = new MeshPhysicalMaterial({
  color: COLOR.PLASTIC,
  roughness: 0.42,
  metalness: 0.08,
  clearcoat: 0.28,
  clearcoatRoughness: 0.45,
});

const stickerCache = new Map<number, MeshPhysicalMaterial>();
function stickerMat(hex: number): MeshPhysicalMaterial {
  let m = stickerCache.get(hex);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: hex,
      roughness: 0.28,
      metalness: 0.02,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
    });
    stickerCache.set(hex, m);
  }
  return m;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function rotMatrix(cubie: Cubie): Matrix4 {
  const r = cubie.rot;
  return new Matrix4().set(
    r[0][0],
    r[0][1],
    r[0][2],
    0,
    r[1][0],
    r[1][1],
    r[1][2],
    0,
    r[2][0],
    r[2][1],
    r[2][2],
    0,
    0,
    0,
    0,
    1,
  );
}

export class CayleyStage {
  readonly canvas: HTMLCanvasElement;
  onChange: ((snap: StageSnapshot) => void) | null = null;

  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private timer = new Timer();
  private raf = 0;
  private disposed = false;

  private graphRoot = new Group();
  private nodeMeshes: Mesh[] = [];
  private nodeMat: MeshLambertMaterial;
  private edgeLines: LineSegments | null = null;
  private pathMesh: Mesh | null = null;
  private pathGlow: Mesh | null = null;
  private pathMat: MeshBasicMaterial;
  private glowMat: MeshBasicMaterial;
  private cursorLight: PointLight;

  private heroRoot = new Group();
  private pivot = new Group();
  private cubieMeshes: { mesh: Group; cubie: Cubie }[] = [];
  private logical = Cube.solved(3);
  private heroTarget = new Vector3();
  private lookTarget = new Vector3();

  private graph: CubeGraph | null = null;
  private walkCursor = 0;
  private trail = 0;
  private phase: "scramble" | "solve" | "hold" = "hold";
  private holdLeft = 0;
  private queue: Move[] = [];
  private queueKind: "scramble" | "solve" = "scramble";

  private anim: {
    axis: "x" | "y" | "z";
    angle: number;
    t: number;
    duration: number;
    members: Group[];
    move: Move;
  } | null = null;

  private spherical = { theta: 0.62, phi: 1.08, radius: 12.4 };
  private dragging = false;
  private lastPtr = new Vector2();
  private reduceMotion = false;
  private ro: ResizeObserver | null = null;

  speed = 1;
  playing = true;
  ready = false;
  moveLabel = "";
  phaseLabel = "Loading";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(VOID, 1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene = new Scene();
    this.scene.background = new Color(VOID);
    this.scene.fog = new FogExp2(VOID, 0.016);
    this.camera = new PerspectiveCamera(38, 1, 0.1, 120);

    this.scene.add(new HemisphereLight(0xb8c4d8, 0x0a0a0c, 0.85));
    const key = new DirectionalLight(0xfff4e8, 1.55);
    key.position.set(8, 14, 6);
    this.scene.add(key);
    const fill = new DirectionalLight(0x6a7a99, 0.35);
    fill.position.set(-10, 4, -8);
    this.scene.add(fill);
    const rim = new DirectionalLight(0xffd9a0, 0.28);
    rim.position.set(0, -6, 10);
    this.scene.add(rim);

    this.nodeMat = new MeshLambertMaterial({ vertexColors: true });
    this.pathMat = new MeshBasicMaterial({
      color: 0xffc56a,
      transparent: true,
      opacity: 0.95,
    });
    this.glowMat = new MeshBasicMaterial({
      color: 0xff9a3a,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    this.cursorLight = new PointLight(0xffc56a, 2.4, 6.5, 1.6);
    this.scene.add(this.cursorLight);

    this.heroRoot.add(this.pivot);
    this.scene.add(this.graphRoot);
    this.scene.add(this.heroRoot);
    this.buildHero();
    this.resize();
    this.bind();
    this.timer.connect(document);
  }

  start(): void {
    this.rebuild(2026);
    this.ready = true;
    this.emit();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.clearGraphMeshes();
    this.renderer.dispose();
  }

  rebuild(seed?: number): void {
    this.anim = null;
    this.pivot.rotation.set(0, 0, 0);
    this.queue = [];
    const s = seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.graph = buildPathGraph(s, 12);
    this.rebuildGraphMeshes();
    this.resetLogical();
    this.walkCursor = 0;
    this.trail = 0;
    this.placeHero(true);
    this.syncNodeVisibility();
    this.rebuildPathTube();
    this.beginScramble();
    this.emit();
  }

  scrambleNow(): void {
    this.rebuild();
  }

  setPlaying(v: boolean): void {
    this.playing = v;
    this.emit();
  }

  snapshot(): StageSnapshot {
    return {
      playing: this.playing,
      ready: this.ready,
      phase: this.phaseLabel,
      moveLabel: this.moveLabel,
      nodes: this.graph?.nodes.length ?? 0,
      step: this.trail,
      total: Math.max((this.graph?.walk.length ?? 1) - 1, 0),
    };
  }

  private emit(): void {
    this.onChange?.(this.snapshot());
  }

  private beginScramble(): void {
    if (!this.graph) return;
    this.phase = "scramble";
    this.queueKind = "scramble";
    this.queue = this.graph.scramble.slice();
    this.phaseLabel = "Scramble";
    this.playing = true;
    this.emit();
  }

  private beginSolve(): void {
    if (!this.graph) return;
    this.phase = "solve";
    this.queueKind = "solve";
    this.queue = this.graph.solution.slice();
    this.phaseLabel = "Solve";
    this.emit();
  }

  private tick(dt: number): void {
    if (!this.dragging && !this.reduceMotion) {
      this.spherical.theta += dt * 0.12;
    }
    this.placeHero(false);
    this.placeCamera(dt);

    if (!this.playing) return;

    if (this.phase === "hold") {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) {
        if (this.walkCursor <= 0) this.beginScramble();
        else this.beginSolve();
      }
      return;
    }

    if (this.anim) {
      this.stepAnim(dt);
      return;
    }

    if (this.queue.length) {
      this.beginMove(this.queue.shift()!);
      return;
    }

    if (this.phase === "scramble") {
      this.phase = "hold";
      this.holdLeft = 0.9;
      this.phaseLabel = "Path";
      this.emit();
      return;
    }

    if (this.phase === "solve") {
      this.resetLogical();
      this.walkCursor = 0;
      this.trail = 0;
      this.syncNodeVisibility();
      this.rebuildPathTube();
      this.phase = "hold";
      this.holdLeft = 1.15;
      this.phaseLabel = "Solved";
      this.emit();
    }
  }

  private beginMove(move: Move): void {
    const { face, turns } = parseMove(move);
    const { axis, layer } = FACE_AXIS[face];
    const k = rhQuarters(move);
    const angle = (k * Math.PI) / 2;
    const ax = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    const members: Group[] = [];
    for (const { mesh, cubie } of this.cubieMeshes) {
      const live = this.liveCubie(cubie);
      if (!live || live.pos[axis] !== layer) continue;
      this.pivot.attach(mesh);
      members.push(mesh);
    }
    const duration = (turns === 2 ? 0.72 : 0.52) / this.speed;
    this.anim = { axis: ax, angle, t: 0, duration, members, move };
    this.moveLabel = move;
    this.emit();
  }

  private stepAnim(dt: number): void {
    if (!this.anim) return;
    this.anim.t += dt;
    const u = Math.min(1, this.anim.t / this.anim.duration);
    this.pivot.rotation[this.anim.axis] = this.anim.angle * easeInOut(u);
    if (u < 1) return;
    for (const mesh of this.anim.members) this.heroRoot.attach(mesh);
    this.pivot.rotation.set(0, 0, 0);
    this.logical.apply(this.anim.move);
    this.snapHero();
    if (this.queueKind === "scramble") {
      this.walkCursor = Math.min(
        this.walkCursor + 1,
        (this.graph?.walk.length ?? 1) - 1,
      );
      this.trail = this.walkCursor;
    } else {
      this.walkCursor = Math.max(this.walkCursor - 1, 0);
      this.trail = Math.max(this.trail, this.walkCursor);
    }
    this.anim = null;
    this.moveLabel = "";
    this.syncNodeVisibility();
    this.rebuildPathTube();
    this.emit();
  }

  private liveCubie(cubie: Cubie): Cubie | undefined {
    return this.logical.cubies.find(
      (c) =>
        c.home[0] === cubie.home[0] &&
        c.home[1] === cubie.home[1] &&
        c.home[2] === cubie.home[2],
    );
  }

  private resetLogical(): void {
    for (const cubie of this.logical.cubies) {
      cubie.pos = [cubie.home[0], cubie.home[1], cubie.home[2]];
      cubie.rot = identityMat();
    }
    this.snapHero();
  }

  private buildHero(): void {
    this.cubieMeshes = [];
    this.logical = Cube.solved(3);
    const bodyGeo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 2, 0.07);
    const stickerGeo = new BoxGeometry(0.8, 0.8, 0.034);
    const normals: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const cubie of this.logical.cubies) {
      const g = new Group();
      g.add(new Mesh(bodyGeo, PLASTIC));
      const colors = cubieWorldColors(cubie);
      normals.forEach((n, i) => {
        const col = colors[i]!;
        if (col === COLOR.PLASTIC) return;
        const s = new Mesh(stickerGeo, stickerMat(col));
        s.position.set(n[0] * 0.462, n[1] * 0.462, n[2] * 0.462);
        s.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
        g.add(s);
      });
      g.position.set(cubie.pos[0], cubie.pos[1], cubie.pos[2]);
      this.heroRoot.add(g);
      this.cubieMeshes.push({ mesh: g, cubie });
    }
    this.heroRoot.scale.setScalar(HERO_SCALE / 3);
  }

  private snapHero(): void {
    const q = new Quaternion();
    for (const { mesh, cubie } of this.cubieMeshes) {
      const live = this.liveCubie(cubie);
      if (!live) continue;
      cubie.pos = live.pos;
      cubie.rot = live.rot;
      mesh.position.set(live.pos[0], live.pos[1], live.pos[2]);
      q.setFromRotationMatrix(rotMatrix(live));
      mesh.quaternion.copy(q);
    }
  }

  private currentNode(): GraphNode | null {
    if (!this.graph) return null;
    const id = this.graph.walk[this.walkCursor];
    if (!id) return this.graph.nodes[0] ?? null;
    const idx = this.graph.idToIndex.get(id);
    return idx === undefined ? null : this.graph.nodes[idx]!;
  }

  private placeHero(snap: boolean): void {
    const node = this.currentNode();
    if (!node) return;
    this.heroTarget.set(node.x, node.y, node.z);
    if (snap) this.heroRoot.position.copy(this.heroTarget);
    else this.heroRoot.position.lerp(this.heroTarget, 0.14);
    this.cursorLight.position.copy(this.heroRoot.position);
  }

  private placeCamera(dt: number): void {
    const { theta, phi, radius } = this.spherical;
    const p = Math.min(Math.max(phi, 0.45), 1.35);
    this.spherical.phi = p;
    this.camera.position.set(
      radius * Math.sin(p) * Math.cos(theta),
      radius * Math.cos(p) * 0.85,
      radius * Math.sin(p) * Math.sin(theta),
    );
    const node = this.currentNode();
    const want = node
      ? new Vector3(node.x * 0.18, node.y * 0.18, node.z * 0.18)
      : new Vector3();
    this.lookTarget.lerp(want, 1 - Math.exp(-2.2 * dt));
    this.camera.lookAt(this.lookTarget);
  }

  private clearGraphMeshes(): void {
    for (const m of this.nodeMeshes) {
      this.graphRoot.remove(m);
      m.geometry.dispose();
    }
    this.nodeMeshes = [];
    if (this.edgeLines) {
      this.graphRoot.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
      (this.edgeLines.material as LineBasicMaterial).dispose();
      this.edgeLines = null;
    }
    if (this.pathMesh) {
      this.graphRoot.remove(this.pathMesh);
      this.pathMesh.geometry.dispose();
      this.pathMesh = null;
    }
    if (this.pathGlow) {
      this.graphRoot.remove(this.pathGlow);
      this.pathGlow.geometry.dispose();
      this.pathGlow = null;
    }
  }

  private rebuildGraphMeshes(): void {
    this.clearGraphMeshes();
    const graph = this.graph;
    if (!graph) return;

    for (const node of graph.nodes) {
      const geo = buildNodeGeometry(
        node.cube,
        node.onPath ? PATH_SCALE : NODE_SCALE,
      );
      const mesh = new Mesh(geo, this.nodeMat);
      mesh.position.set(node.x, node.y, node.z);
      const h = Math.abs(node.x * 13 + node.y * 31 + node.z * 17);
      mesh.rotation.set(
        (h % 7) * 0.17,
        (h % 11) * 0.21,
        (h % 5) * 0.13,
      );
      mesh.userData.id = node.id;
      this.graphRoot.add(mesh);
      this.nodeMeshes.push(mesh);
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const gray = new Color(0x5c616c);
    const idTo = graph.idToIndex;
    for (const e of graph.edges) {
      if (e.onPath) continue;
      const a = graph.nodes[idTo.get(e.from)!]!;
      const b = graph.nodes[idTo.get(e.to)!]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      if (dist > 3.4) continue;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      colors.push(gray.r, gray.g, gray.b, gray.r, gray.g, gray.b);
    }
    const edgeGeo = new BufferGeometry();
    edgeGeo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    edgeGeo.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(colors), 3),
    );
    this.edgeLines = new LineSegments(
      edgeGeo,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
      }),
    );
    this.graphRoot.add(this.edgeLines);
  }

  private syncNodeVisibility(): void {
    if (!this.graph) return;
    const currentId = this.graph.walk[this.walkCursor];
    for (const mesh of this.nodeMeshes) {
      mesh.visible = mesh.userData.id !== currentId;
    }
  }

  private rebuildPathTube(): void {
    if (this.pathMesh) {
      this.graphRoot.remove(this.pathMesh);
      this.pathMesh.geometry.dispose();
      this.pathMesh = null;
    }
    if (this.pathGlow) {
      this.graphRoot.remove(this.pathGlow);
      this.pathGlow.geometry.dispose();
      this.pathGlow = null;
    }
    const graph = this.graph;
    if (!graph) return;
    const pts: Vector3[] = [];
    const last = Math.max(this.trail, 0);
    for (let i = 0; i <= last; i++) {
      const id = graph.walk[i];
      if (!id) continue;
      const node = graph.nodes[graph.idToIndex.get(id)!];
      if (!node) continue;
      pts.push(new Vector3(node.x, node.y, node.z));
    }
    if (pts.length < 2) return;
    const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.15);
    const segs = Math.max(16, pts.length * 10);
    this.pathMesh = new Mesh(
      new TubeGeometry(curve, segs, 0.07, 10, false),
      this.pathMat,
    );
    this.pathGlow = new Mesh(
      new TubeGeometry(curve, segs, 0.2, 10, false),
      this.glowMat,
    );
    this.graphRoot.add(this.pathMesh);
    this.graphRoot.add(this.pathGlow);
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPtr.set(e.clientX, e.clientY);
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPtr.x;
    const dy = e.clientY - this.lastPtr.y;
    this.lastPtr.set(e.clientX, e.clientY);
    this.spherical.theta -= dx * 0.0055;
    this.spherical.phi -= dy * 0.0055;
  };
  private onUp = (): void => {
    this.dragging = false;
  };
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.spherical.radius = Math.min(
      26,
      Math.max(9.2, this.spherical.radius + e.deltaY * 0.012),
    );
  };

  private bind(): void {
    window.addEventListener("resize", this.resize);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas.parentElement ?? this.canvas);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  private unbind(): void {
    window.removeEventListener("resize", this.resize);
    this.ro?.disconnect();
    this.ro = null;
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
