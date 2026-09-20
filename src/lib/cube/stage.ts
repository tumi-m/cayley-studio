import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  COLOR,
  Cube,
  FACE_AXIS,
  FACES,
  cssHex,
  cubieWorldColors,
  identityMat,
  invertMove,
  parseMove,
  rhQuarters,
  type Cubie,
  type Face,
  type Move,
} from "./model";
import { bfsMoves, buildPathGraph, type CubeGraph } from "./graph";

export interface StageSnapshot {
  playing: boolean;
  ready: boolean;
  phase: string;
  moveLabel: string;
  nodes: number;
  step: number;
  total: number;
  canUndo: boolean;
  hint: string;
}

const BG = 0xf7f4ec;

const PLASTIC = new MeshPhysicalMaterial({
  color: COLOR.PLASTIC,
  roughness: 0.55,
  metalness: 0.02,
  clearcoat: 0.18,
  clearcoatRoughness: 0.55,
});

const stickerCache = new Map<number, MeshPhysicalMaterial>();
function stickerMat(hex: number): MeshPhysicalMaterial {
  let m = stickerCache.get(hex);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: hex,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.4,
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

function worldFaceFromNormal(n: Vector3): Face {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return n.x >= 0 ? "R" : "L";
  if (ay >= ax && ay >= az) return n.y >= 0 ? "U" : "D";
  return n.z >= 0 ? "F" : "B";
}

export class CayleyStage {
  readonly cubeCanvas: HTMLCanvasElement;
  readonly graphCanvas: HTMLCanvasElement;
  onChange: ((snap: StageSnapshot) => void) | null = null;

  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private graphCtx: CanvasRenderingContext2D | null;
  private timer = new Timer();
  private raf = 0;
  private disposed = false;
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private hitN = new Vector3();

  private heroRoot = new Group();
  private pivot = new Group();
  private cubieMeshes: { mesh: Group; cubie: Cubie }[] = [];
  private stickerMeshes: Mesh[] = [];
  private logical = Cube.solved(3);

  private graph: CubeGraph | null = null;
  private walkCursor = 0;
  private trail = 0;
  private phase: "scramble" | "solve" | "hold" | "user" = "hold";
  private holdLeft = 0;
  private queue: Move[] = [];
  private queueKind: "scramble" | "solve" | "user" = "scramble";
  private history: Move[] = [];
  private hoverId: string | null = null;

  private anim: {
    axis: "x" | "y" | "z";
    angle: number;
    t: number;
    duration: number;
    members: Group[];
    move: Move;
  } | null = null;

  private spherical = { theta: 0.72, phi: 0.98, radius: 6.35 };
  private dragging = false;
  private dragMoved = false;
  private lastPtr = new Vector2();
  private graphPan = { x: 0, y: 0, scale: 1 };
  private graphDrag: {
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null = null;
  private ro: ResizeObserver | null = null;

  speed = 1;
  playing = true;
  ready = false;
  moveLabel = "";
  phaseLabel = "Loading";

  constructor(cubeCanvas: HTMLCanvasElement, graphCanvas: HTMLCanvasElement) {
    this.cubeCanvas = cubeCanvas;
    this.graphCanvas = graphCanvas;
    this.graphCtx = graphCanvas.getContext("2d");

    this.renderer = new WebGLRenderer({
      canvas: cubeCanvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BG, 1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene = new Scene();
    this.scene.background = new Color(BG);
    this.camera = new PerspectiveCamera(32, 1, 0.1, 80);

    this.scene.add(new HemisphereLight(0xfffbf3, 0xd9d2c4, 1.15));
    const key = new DirectionalLight(0xfffaf2, 1.15);
    key.position.set(4.5, 8, 5.5);
    this.scene.add(key);
    const fill = new DirectionalLight(0xe8eef8, 0.45);
    fill.position.set(-6, 2, -3);
    this.scene.add(fill);

    this.heroRoot.add(this.pivot);
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
      this.drawGraph();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.renderer.dispose();
  }

  rebuild(seed?: number): void {
    this.anim = null;
    this.pivot.rotation.set(0, 0, 0);
    this.queue = [];
    this.history = [];
    const s = seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.graph = buildPathGraph(s, 10);
    this.resetLogical();
    this.walkCursor = 0;
    this.trail = 0;
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

  applyMove(move: Move): void {
    this.playing = false;
    this.phase = "user";
    this.phaseLabel = "Turn";
    this.queueKind = "user";
    if (this.anim) this.queue.push(move);
    else this.beginMove(move);
    this.emit();
  }

  undo(): void {
    if (this.anim || !this.history.length) return;
    this.playing = false;
    this.phase = "user";
    this.queueKind = "user";
    const last = this.history.pop()!;
    this.beginMove(invertMove(last), true);
    this.emit();
  }

  resetSolved(): void {
    this.anim = null;
    this.pivot.rotation.set(0, 0, 0);
    this.queue = [];
    this.history = [];
    this.playing = false;
    this.resetLogical();
    this.walkCursor = 0;
    this.trail = 0;
    this.phase = "hold";
    this.phaseLabel = "Solved";
    this.moveLabel = "";
    this.emit();
  }

  goToNode(id: string): void {
    if (!this.graph) return;
    const from = this.logical.key();
    const start = this.graph.idToIndex.has(from) ? from : this.graph.walk[0]!;
    if (start !== from) {
      this.resetLogical();
      this.history = [];
    }
    const moves = bfsMoves(this.graph, start, id);
    if (!moves || !moves.length) {
      if (start === id) this.emit();
      return;
    }
    this.playing = true;
    this.phase = "user";
    this.queueKind = "user";
    this.queue = moves.slice();
    this.phaseLabel = "Walk";
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
      canUndo: this.history.length > 0 && !this.anim,
      hint: this.hoverId ? "Walk to this state" : "Click a sticker or a node",
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
    this.placeCamera();
    if (this.anim) {
      if (this.playing || this.queueKind === "user") this.stepAnim(dt);
      return;
    }
    if (!this.playing && !(this.queueKind === "user" && this.queue.length)) return;

    if (this.phase === "hold") {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0 && this.playing) {
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
      this.holdLeft = 0.7;
      this.phaseLabel = "Path";
      this.emit();
      return;
    }

    if (this.phase === "solve") {
      this.resetLogical();
      this.walkCursor = 0;
      this.trail = 0;
      this.history = [];
      this.phase = "hold";
      this.holdLeft = 1;
      this.phaseLabel = "Solved";
      this.emit();
      return;
    }

    if (this.phase === "user") {
      this.phaseLabel = "Ready";
      this.playing = false;
      this.emit();
    }
  }

  private beginMove(move: Move, undoing = false): void {
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
    const duration = (turns === 2 ? 0.55 : 0.38) / this.speed;
    this.anim = { axis: ax, angle, t: 0, duration, members, move };
    this.moveLabel = move;
    if (!undoing && this.queueKind === "user") this.history.push(move);
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
    const key = this.logical.key();
    if (this.graph) {
      const w = this.graph.walk.indexOf(key);
      if (w >= 0) {
        this.walkCursor = w;
        this.trail = Math.max(this.trail, w);
      }
    }
    this.anim = null;
    this.moveLabel = "";
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
    this.stickerMeshes = [];
    this.logical = Cube.solved(3);
    const bodyGeo = new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.1);
    const stickerGeo = new RoundedBoxGeometry(0.74, 0.74, 0.05, 2, 0.13);
    const normals: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const faces: Face[] = ["R", "L", "U", "D", "F", "B"];
    for (const cubie of this.logical.cubies) {
      const g = new Group();
      g.add(new Mesh(bodyGeo, PLASTIC));
      const colors = cubieWorldColors(cubie);
      normals.forEach((n, i) => {
        const col = colors[i]!;
        if (col === COLOR.PLASTIC) return;
        const s = new Mesh(stickerGeo, stickerMat(col));
        s.position.set(n[0] * 0.47, n[1] * 0.47, n[2] * 0.47);
        s.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
        s.userData.face = faces[i];
        g.add(s);
        this.stickerMeshes.push(s);
      });
      g.position.set(cubie.pos[0], cubie.pos[1], cubie.pos[2]);
      this.heroRoot.add(g);
      this.cubieMeshes.push({ mesh: g, cubie });
    }
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

  private placeCamera(): void {
    const { theta, phi, radius } = this.spherical;
    const p = Math.min(Math.max(phi, 0.4), 1.28);
    this.spherical.phi = p;
    this.camera.position.set(
      radius * Math.sin(p) * Math.cos(theta),
      radius * Math.cos(p),
      radius * Math.sin(p) * Math.sin(theta),
    );
    this.camera.lookAt(0, -0.08, 0);
  }

  private currentId(): string | null {
    return this.logical.key();
  }

  private drawGraph(): void {
    const ctx = this.graphCtx;
    const canvas = this.graphCanvas;
    const graph = this.graph;
    if (!ctx || !graph) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f7f4ec";
    ctx.fillRect(0, 0, w, h);

    const fit = Math.min(w, h) * 0.5 * this.graphPan.scale;
    ctx.save();
    ctx.translate(w / 2 + this.graphPan.x, h / 2 + this.graphPan.y);
    ctx.scale(fit, fit);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const rings = [0.3, 0.56, 0.82];
    ctx.strokeStyle = "rgba(70, 66, 60, 0.22)";
    ctx.lineWidth = 0.012;
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const current = this.currentId();
    const hover = this.hoverId;

    if (hover) {
      ctx.strokeStyle = "rgba(70, 66, 60, 0.28)";
      ctx.lineWidth = 0.01;
      ctx.beginPath();
      for (const nb of graph.adj.get(hover) ?? []) {
        const a = graph.nodes[graph.idToIndex.get(hover)!];
        const b = graph.nodes[graph.idToIndex.get(nb.id)!];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "#2a2926";
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    const last = Math.max(this.trail, 0);
    for (let i = 0; i < last; i++) {
      const a = graph.nodes[graph.idToIndex.get(graph.walk[i]!)!];
      const b = graph.nodes[graph.idToIndex.get(graph.walk[i + 1]!)!];
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    const rNode = 0.064;
    for (const node of graph.nodes) {
      const isCurrent = node.id === current;
      const isHover = node.id === hover;
      const rad = isCurrent ? rNode * 1.55 : isHover ? rNode * 1.28 : rNode;
      ctx.beginPath();
      ctx.arc(node.x, node.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = cssHex(node.color);
      ctx.fill();
      ctx.lineWidth = isCurrent ? 0.014 : 0.007;
      ctx.strokeStyle = isCurrent ? "#1c1b18" : "rgba(28, 27, 24, 0.35)";
      ctx.stroke();
    }

    ctx.restore();
  }

  private graphHit(e: PointerEvent): string | null {
    const graph = this.graph;
    const canvas = this.graphCanvas;
    if (!graph) return null;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const fit = Math.min(w, h) * 0.5 * this.graphPan.scale;
    const x = (e.clientX - rect.left - w / 2 - this.graphPan.x) / fit;
    const y = (e.clientY - rect.top - h / 2 - this.graphPan.y) / fit;
    let best: string | null = null;
    let bestD = 0.09;
    for (const node of graph.nodes) {
      const d = Math.hypot(node.x - x, node.y - y);
      if (d < bestD) {
        bestD = d;
        best = node.id;
      }
    }
    return best;
  }

  private resize = (): void => {
    const cubeParent = this.cubeCanvas.parentElement;
    const graphParent = this.graphCanvas.parentElement;
    const cw = cubeParent?.clientWidth || window.innerWidth / 2;
    const ch = cubeParent?.clientHeight || window.innerHeight;
    this.camera.aspect = cw / Math.max(ch, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(cw, ch, false);

    const gw = graphParent?.clientWidth || window.innerWidth / 2;
    const gh = graphParent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.graphCanvas.width = Math.max(1, Math.floor(gw * dpr));
    this.graphCanvas.height = Math.max(1, Math.floor(gh * dpr));
    this.graphCanvas.style.width = `${gw}px`;
    this.graphCanvas.style.height = `${gh}px`;
  };

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.dragMoved = false;
    this.lastPtr.set(e.clientX, e.clientY);
    this.cubeCanvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPtr.x;
    const dy = e.clientY - this.lastPtr.y;
    if (Math.hypot(dx, dy) > 3) this.dragMoved = true;
    this.lastPtr.set(e.clientX, e.clientY);
    this.spherical.theta -= dx * 0.007;
    this.spherical.phi -= dy * 0.007;
  };
  private onUp = (e: PointerEvent): void => {
    if (!this.dragMoved) this.clickCube(e);
    this.dragging = false;
    this.dragMoved = false;
  };
  private clickCube(e: PointerEvent): void {
    const rect = this.cubeCanvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.stickerMeshes, false);
    const hit = hits[0];
    if (!hit?.face) return;
    this.hitN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    const face = worldFaceFromNormal(this.hitN);
    const move: Move = e.shiftKey ? (`${face}'` as Move) : face;
    this.applyMove(move);
  }
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.spherical.radius = Math.min(
      11,
      Math.max(4.6, this.spherical.radius + e.deltaY * 0.01),
    );
  };

  private onGraphDown = (e: PointerEvent): void => {
    this.graphDrag = {
      x: e.clientX,
      y: e.clientY,
      panX: this.graphPan.x,
      panY: this.graphPan.y,
    };
    this.graphCanvas.setPointerCapture(e.pointerId);
  };
  private onGraphMove = (e: PointerEvent): void => {
    const id = this.graphHit(e);
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.graphCanvas.style.cursor = id ? "pointer" : "grab";
      this.emit();
    }
    if (!this.graphDrag) return;
    const dx = e.clientX - this.graphDrag.x;
    const dy = e.clientY - this.graphDrag.y;
    this.graphPan.x = this.graphDrag.panX + dx;
    this.graphPan.y = this.graphDrag.panY + dy;
  };
  private onGraphUp = (e: PointerEvent): void => {
    const dragged =
      this.graphDrag &&
      Math.hypot(e.clientX - this.graphDrag.x, e.clientY - this.graphDrag.y) > 6;
    this.graphDrag = null;
    if (dragged) return;
    const id = this.graphHit(e);
    if (id) this.goToNode(id);
  };
  private onGraphLeave = (): void => {
    if (this.hoverId) {
      this.hoverId = null;
      this.emit();
    }
  };
  private onGraphWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.graphPan.scale = Math.min(
      2.2,
      Math.max(0.6, this.graphPan.scale * (e.deltaY > 0 ? 0.92 : 1.08)),
    );
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.setPlaying(!this.playing);
      return;
    }
    if (e.code === "KeyZ" && e.shiftKey === false) {
      e.preventDefault();
      this.undo();
      return;
    }
    const letter = e.key.toUpperCase();
    if (!(FACES as string[]).includes(letter)) return;
    e.preventDefault();
    const face = letter as Face;
    const move: Move = e.shiftKey ? (`${face}'` as Move) : face;
    this.applyMove(move);
  };

  private bind(): void {
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.cubeCanvas.parentElement ?? this.cubeCanvas);
    this.ro.observe(this.graphCanvas.parentElement ?? this.graphCanvas);
    this.cubeCanvas.addEventListener("pointerdown", this.onDown);
    this.cubeCanvas.addEventListener("pointermove", this.onMove);
    this.cubeCanvas.addEventListener("pointerup", this.onUp);
    this.cubeCanvas.addEventListener("pointercancel", this.onUp);
    this.cubeCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.graphCanvas.addEventListener("pointerdown", this.onGraphDown);
    this.graphCanvas.addEventListener("pointermove", this.onGraphMove);
    this.graphCanvas.addEventListener("pointerup", this.onGraphUp);
    this.graphCanvas.addEventListener("pointercancel", this.onGraphUp);
    this.graphCanvas.addEventListener("pointerleave", this.onGraphLeave);
    this.graphCanvas.addEventListener("wheel", this.onGraphWheel, {
      passive: false,
    });
  }
  private unbind(): void {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    this.ro?.disconnect();
    this.ro = null;
    this.cubeCanvas.removeEventListener("pointerdown", this.onDown);
    this.cubeCanvas.removeEventListener("pointermove", this.onMove);
    this.cubeCanvas.removeEventListener("pointerup", this.onUp);
    this.cubeCanvas.removeEventListener("pointercancel", this.onUp);
    this.cubeCanvas.removeEventListener("wheel", this.onWheel);
    this.graphCanvas.removeEventListener("pointerdown", this.onGraphDown);
    this.graphCanvas.removeEventListener("pointermove", this.onGraphMove);
    this.graphCanvas.removeEventListener("pointerup", this.onGraphUp);
    this.graphCanvas.removeEventListener("pointercancel", this.onGraphUp);
    this.graphCanvas.removeEventListener("pointerleave", this.onGraphLeave);
    this.graphCanvas.removeEventListener("wheel", this.onGraphWheel);
  }
}
