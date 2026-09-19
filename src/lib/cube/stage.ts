import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Timer,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
import {
  buildCayleyCloud,
  buildShortestPathGraph,
  FILM_SCRIPTS,
  type CubeGraph,
  type FilmId,
} from "./graph";

export interface StageSnapshot {
  caption: string;
  filmId: FilmId;
  playing: boolean;
  recording: boolean;
  ready: boolean;
  phase: string;
  moveLabel: string;
  speed: number;
  nodes: number;
  depth: number;
  path: number;
  explored: number;
  shortest: boolean;
  currentPath: number;
}

type Job =
  | { kind: "caption"; text: string }
  | { kind: "wait"; seconds: number }
  | { kind: "moves"; moves: Move[]; label: string }
  | { kind: "reveal" }
  | { kind: "hero"; cube: Cube };

const PLASTIC = new MeshPhysicalMaterial({
  color: COLOR.PLASTIC,
  roughness: 0.48,
  metalness: 0.12,
  clearcoat: 0.15,
});

const stickerCache = new Map<number, MeshPhysicalMaterial>();
function stickerMat(hex: number): MeshPhysicalMaterial {
  let m = stickerCache.get(hex);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: hex,
      roughness: 0.32,
      metalness: 0.04,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
    });
    stickerCache.set(hex, m);
  }
  return m;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function paintBox(geo: BufferGeometry, colors: number[]): void {
  const pos = geo.getAttribute("position");
  const arr = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let f = 0; f < 6; f++) {
    c.setHex(colors[f] ?? COLOR.PLASTIC);
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("color", new BufferAttribute(arr, 3));
}

function miniGeometry(cube: Cube, scale: number): BufferGeometry {
  const geos: BufferGeometry[] = [];
  for (const cubie of cube.cubies) {
    const box = new BoxGeometry(0.86 * scale, 0.86 * scale, 0.86 * scale);
    paintBox(box, cubieWorldColors(cubie));
    box.translate(
      cubie.pos[0] * scale,
      cubie.pos[1] * scale,
      cubie.pos[2] * scale,
    );
    geos.push(box);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return new BoxGeometry(scale, scale, scale);
  merged.computeVertexNormals();
  return merged;
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

  private heroRoot = new Group();
  private pivot = new Group();
  private cubieMeshes: { mesh: Group; cubie: Cubie }[] = [];
  private logical = Cube.solved(3);

  private graphRoot = new Group();
  private graph: CubeGraph | null = null;
  private nodeMeshes: Mesh[] = [];
  private nodeMat: MeshStandardMaterial | null = null;
  private pathGlow: Mesh | null = null;
  private reveal = 1;

  private jobs: Job[] = [];
  private waitLeft = 0;
  private anim: {
    axis: "x" | "y" | "z";
    angle: number;
    t: number;
    duration: number;
    members: Group[];
    move: Move;
  } | null = null;
  private moveQueue: Move[] = [];

  private spherical = { theta: 0.72, phi: 0.42, radius: 15.5 };
  private dragging = false;
  private lastPtr = new Vector2();
  private autoOrbit = true;
  private pointerLeft = false;

  speed = 1;
  playing = true;
  recording = false;
  ready = false;
  filmId: FilmId = "shortest";
  caption: string = FILM_SCRIPTS.shortest.caption;
  phase: string = "boot";
  moveLabel = "";
  currentPath = 0;

  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x08080a, 1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene = new Scene();
    this.scene.fog = new Fog(0x08080a, 18, 44);
    this.camera = new PerspectiveCamera(42, 1, 0.1, 120);

    this.scene.add(new HemisphereLight(0xc9cdd4, 0x0a0a0c, 0.72));
    const key = new DirectionalLight(0xfff6ea, 1.45);
    key.position.set(7, 11, 8);
    this.scene.add(key);
    const fill = new DirectionalLight(0xb7c4d8, 0.38);
    fill.position.set(-9, 3, -5);
    this.scene.add(fill);
    const rim = new DirectionalLight(0xd4b86a, 0.22);
    rim.position.set(2, -6, 9);
    this.scene.add(rim);

    this.heroRoot.add(this.pivot);
    this.scene.add(this.heroRoot);
    this.scene.add(this.graphRoot);
    this.buildHero();
    this.resize();
    this.bind();
    this.timer.connect(document);
  }

  start(): void {
    this.ready = true;
    this.emit();
    this.playFilm("shortest");
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
    this.clearGraph();
    this.renderer.dispose();
  }

  playFilm(id: FilmId): void {
    this.filmId = id;
    this.jobs = [];
    this.moveQueue = [];
    this.playing = true;
    if (this.anim) {
      for (const mesh of this.anim.members) this.heroRoot.attach(mesh);
      this.pivot.rotation.set(0, 0, 0);
      this.anim = null;
    }
    const script = FILM_SCRIPTS[id];
    this.caption = script.caption;
    this.phase = script.title;
    const seed = (Date.now() ^ (id.length * 997)) >>> 0;
    const graph =
      id === "cloud"
        ? buildCayleyCloud(8, seed)
        : buildShortestPathGraph(id === "search" ? 4 : 4, seed);
    this.setGraph(graph);
    this.resetLogical();
    this.reveal = 0;
    this.currentPath = 0;
    this.jobs.push({ kind: "caption", text: script.caption });
    this.jobs.push({ kind: "wait", seconds: 0.4 });
    this.jobs.push({ kind: "moves", moves: graph.scramble, label: "Scramble" });
    this.jobs.push({ kind: "reveal" });
    this.jobs.push({
      kind: "caption",
      text: graph.shortest
        ? `Shortest path · ${graph.solution.length} moves · ${graph.explored.toLocaleString()} states visited`
        : `A walk on the Cayley graph · ${graph.solution.length} moves home`,
    });
    this.jobs.push({ kind: "wait", seconds: 0.6 });
    this.jobs.push({ kind: "moves", moves: graph.solution, label: "Solve" });
    this.jobs.push({
      kind: "caption",
      text: "Solved. The cube is a vertex. A turn is an edge.",
    });
    this.emit();
  }

  scrambleNow(): void {
    this.playFilm(this.filmId);
  }

  solveNow(): void {
    if (!this.graph) return;
    this.jobs = [];
    this.moveQueue = [];
    this.jobs.push({ kind: "moves", moves: this.graph.solution, label: "Solve" });
    this.playing = true;
    this.emit();
  }

  enqueueMove(move: Move): void {
    this.moveQueue.push(move);
    this.playing = true;
    this.emit();
  }

  resetSolved(): void {
    this.jobs = [];
    this.moveQueue = [];
    this.anim = null;
    this.resetLogical();
    this.currentPath = 0;
    this.phase = "idle";
    this.moveLabel = "";
    this.emit();
  }

  setPlaying(v: boolean): void {
    this.playing = v;
    this.emit();
  }

  setSpeed(v: number): void {
    this.speed = v;
    this.emit();
  }

  toggleOrbit(): void {
    this.autoOrbit = !this.autoOrbit;
  }

  async toggleRecord(): Promise<void> {
    if (this.recording) {
      this.recorder?.stop();
      return;
    }
    const stream = this.canvas.captureStream(30);
    const rec = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });
    this.recChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) this.recChunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(this.recChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cayley-${this.filmId}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      this.recording = false;
      this.recorder = null;
      this.emit();
    };
    this.recorder = rec;
    rec.start();
    this.recording = true;
    this.emit();
  }

  snapshot(): StageSnapshot {
    const g = this.graph;
    return {
      caption: this.caption,
      filmId: this.filmId,
      playing: this.playing,
      recording: this.recording,
      ready: this.ready,
      phase: this.phase,
      moveLabel: this.moveLabel,
      speed: this.speed,
      nodes: g?.nodes.length ?? 0,
      depth: g ? Math.max(0, ...g.nodes.map((n) => n.depth)) : 0,
      path: g?.solution.length ?? 0,
      explored: g?.explored ?? 0,
      shortest: g?.shortest ?? false,
      currentPath: this.currentPath,
    };
  }

  private emit(): void {
    this.onChange?.(this.snapshot());
  }

  private tick(dt: number): void {
    if (this.autoOrbit && !this.dragging) {
      this.spherical.theta += dt * 0.14;
    }
    this.placeCamera();

    if (this.pathGlow) {
      const pulse = 0.55 + Math.sin(this.timer.getElapsed() * 2.2) * 0.2;
      const mat = this.pathGlow.material as MeshStandardMaterial;
      mat.opacity = pulse;
    }

    for (let i = 0; i < this.nodeMeshes.length; i++) {
      const mesh = this.nodeMeshes[i]!;
      const node = this.graph?.nodes[i];
      if (!node) continue;
      const isCurrent =
        this.graph && this.graph.path[this.currentPath] === node.id;
      const target = this.reveal * (node.onPath ? 1 : 0.92) * (isCurrent ? 1.28 : 1);
      mesh.scale.setScalar(mesh.scale.x + (target - mesh.scale.x) * Math.min(1, dt * 6));
    }

    if (!this.playing) return;

    if (this.anim) {
      this.stepAnim(dt);
      return;
    }

    if (this.moveQueue.length) {
      this.beginMove(this.moveQueue.shift()!);
      return;
    }

    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      return;
    }

    const job = this.jobs.shift();
    if (!job) return;
    if (job.kind === "caption") {
      this.caption = job.text;
      this.emit();
    } else if (job.kind === "wait") {
      this.waitLeft = job.seconds;
    } else if (job.kind === "moves") {
      this.phase = job.label;
      this.moveQueue.push(...job.moves);
      this.emit();
    } else if (job.kind === "reveal") {
      this.reveal = 1;
      this.phase = "Graph";
      this.emit();
    } else if (job.kind === "hero") {
      this.resetLogical();
      this.logical.applySequence(
        // hero job unused in current films; keep for completeness
        [],
      );
      void job.cube;
      this.snapHero();
    }
  }

  private beginMove(move: Move): void {
    const { face } = parseMove(move);
    const { axis, layer } = FACE_AXIS[face];
    const k = ((rhQuarters(move) % 4) + 4) % 4;
    const angle = (k * Math.PI) / 2;
    const axisName: "x" | "y" | "z" = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    this.pivot.rotation.set(0, 0, 0);
    const members: Group[] = [];
    for (const { mesh, cubie } of this.cubieMeshes) {
      if (cubie.pos[axis] !== layer) continue;
      this.pivot.attach(mesh);
      members.push(mesh);
    }
    this.anim = {
      axis: axisName,
      angle,
      t: 0,
      duration: (0.28 + (k === 2 ? 0.12 : 0)) / this.speed,
      members,
      move,
    };
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
    if (this.graph) {
      const k = this.logical.key();
      const idx = this.graph.path.indexOf(k);
      if (idx >= 0) this.currentPath = idx;
    }
    this.anim = null;
    this.moveLabel = "";
    this.emit();
  }

  private resetLogical(): void {
    for (const cubie of this.logical.cubies) {
      cubie.pos = [cubie.home[0], cubie.home[1], cubie.home[2]];
      cubie.rot = identityMat();
    }
    this.snapHero();
  }

  private setGraph(graph: CubeGraph): void {
    this.clearGraph();
    this.graph = graph;
    this.nodeMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.08,
    });
    for (const node of graph.nodes) {
      const scale = node.onPath ? 0.34 : 0.26;
      const geo = miniGeometry(node.cube, scale);
      const mesh = new Mesh(geo, this.nodeMat);
      mesh.position.set(...node.position);
      mesh.scale.setScalar(0);
      this.graphRoot.add(mesh);
      this.nodeMeshes.push(mesh);
    }
    const edgePos: number[] = [];
    const idTo = new Map(graph.nodes.map((n) => [n.id, n] as const));
    for (const e of graph.edges) {
      const a = idTo.get(e.from);
      const b = idTo.get(e.to);
      if (!a || !b) continue;
      if (e.onPath) continue;
      edgePos.push(...a.position, ...b.position);
    }
    if (edgePos.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(edgePos), 3));
      const lines = new LineSegments(
        g,
        new LineBasicMaterial({
          color: 0x3a3c44,
          transparent: true,
          opacity: 0.55,
        }),
      );
      lines.name = "edges";
      this.graphRoot.add(lines);
    }

    const pathPts = graph.path
      .map((id) => idTo.get(id))
      .filter(Boolean)
      .map((n) => new Vector3(...n!.position));
    if (pathPts.length >= 2) {
      const curve = new CatmullRomCurve3(pathPts, false, "catmullrom", 0.15);
      const tube = new TubeGeometry(curve, Math.max(32, pathPts.length * 8), 0.045, 7, false);
      const glow = new Mesh(
        tube,
        new MeshStandardMaterial({
          color: 0xd4b86a,
          emissive: 0xd4b86a,
          emissiveIntensity: 0.9,
          roughness: 0.4,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      glow.material.blending = AdditiveBlending;
      this.pathGlow = glow;
      this.graphRoot.add(glow);
      const haloGeo = new TubeGeometry(curve, Math.max(24, pathPts.length * 6), 0.11, 6, false);
      const halo = new Mesh(
        haloGeo,
        new MeshStandardMaterial({
          color: 0xd4b86a,
          emissive: 0xd4b86a,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      halo.material.blending = AdditiveBlending;
      this.graphRoot.add(halo);
    }
    this.emit();
  }

  private clearGraph(): void {
    for (const mesh of this.nodeMeshes) {
      mesh.geometry.dispose();
      this.graphRoot.remove(mesh);
    }
    this.nodeMeshes = [];
    const leftover = [...this.graphRoot.children];
    for (const ch of leftover) {
      this.graphRoot.remove(ch);
      const mesh = ch as Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    }
    this.nodeMat?.dispose();
    this.nodeMat = null;
    this.pathGlow = null;
    this.graph = null;
  }

  private buildHero(): void {
    while (this.heroRoot.children.length) {
      const ch = this.heroRoot.children[0]!;
      if (ch !== this.pivot) this.heroRoot.remove(ch);
      else break;
    }
    this.cubieMeshes = [];
    this.logical = Cube.solved(3);
    const bodyGeo = new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.08);
    const stickerGeo = new BoxGeometry(0.78, 0.78, 0.035);
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
      const body = new Mesh(bodyGeo, PLASTIC);
      g.add(body);
      const colors = cubieWorldColors(cubie);
      normals.forEach((n, i) => {
        const col = colors[i]!;
        if (col === COLOR.PLASTIC) return;
        const s = new Mesh(stickerGeo, stickerMat(col));
        s.position.set(n[0] * 0.455, n[1] * 0.455, n[2] * 0.455);
        s.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
        g.add(s);
      });
      g.position.set(cubie.pos[0], cubie.pos[1], cubie.pos[2]);
      this.heroRoot.add(g);
      this.cubieMeshes.push({ mesh: g, cubie });
    }
    this.heroRoot.scale.setScalar(0.95);
  }

  private snapHero(): void {
    const q = new Quaternion();
    const m = new Matrix4();
    for (const { mesh, cubie } of this.cubieMeshes) {
      const live = this.logical.cubies.find(
        (c) =>
          c.home[0] === cubie.home[0] &&
          c.home[1] === cubie.home[1] &&
          c.home[2] === cubie.home[2],
      );
      if (!live) continue;
      cubie.pos = live.pos;
      cubie.rot = live.rot;
      mesh.position.set(live.pos[0], live.pos[1], live.pos[2]);
      q.setFromRotationMatrix(rotMatrix(live));
      mesh.quaternion.copy(q);
      m.identity();
    }
  }

  private placeCamera(): void {
    const { theta, phi, radius } = this.spherical;
    const p = Math.min(Math.max(phi, 0.18), 1.35);
    this.spherical.phi = p;
    this.camera.position.set(
      radius * Math.sin(p) * Math.cos(theta),
      radius * Math.cos(p),
      radius * Math.sin(p) * Math.sin(theta),
    );
    this.camera.lookAt(0, 0, 0);
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
    this.pointerLeft = false;
    this.lastPtr.set(e.clientX, e.clientY);
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPtr.x;
    const dy = e.clientY - this.lastPtr.y;
    this.lastPtr.set(e.clientX, e.clientY);
    this.spherical.theta -= dx * 0.005;
    this.spherical.phi -= dy * 0.005;
    this.autoOrbit = false;
  };
  private onUp = (): void => {
    this.dragging = false;
  };
  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.spherical.radius = Math.min(28, Math.max(7, this.spherical.radius + e.deltaY * 0.012));
  };

  private bind(): void {
    window.addEventListener("resize", this.resize);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }
  private unbind(): void {
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
