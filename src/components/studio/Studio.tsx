import { useEffect, useRef } from "react";
import { Overlay } from "./Overlay";
import { useStudio } from "@/lib/studio-store";

export function Studio() {
  const cubeRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const bind = useStudio((s) => s.bind);
  const patch = useStudio((s) => s.patch);

  useEffect(() => {
    const cube = cubeRef.current;
    const graph = graphRef.current;
    if (!cube || !graph) return;
    let disposed = false;
    let stage: import("@/lib/cube/stage").CayleyStage | null = null;

    void import("@/lib/cube/stage").then(({ CayleyStage }) => {
      if (disposed || !cubeRef.current || !graphRef.current) return;
      stage = new CayleyStage(cubeRef.current, graphRef.current);
      stage.onChange = (snap) => patch(snap);
      bind(stage);
      stage.start();
    });

    return () => {
      disposed = true;
      stage?.dispose();
      bind(null);
    };
  }, [bind, patch]);

  return (
    <main className="relative h-dvh min-h-[100dvh] overflow-hidden bg-bg text-fg">
      <h1 className="sr-only">
        Cayley — a Rubik’s cube and its three-ring Cayley graph
      </h1>
      <div className="stage-grid">
        <canvas
          ref={cubeRef}
          className="size-full touch-none"
          aria-label="3D Rubik’s cube. Drag to orbit. Click a sticker to turn that face."
        />
        <canvas
          ref={graphRef}
          className="size-full touch-none"
          aria-label="Cayley graph on three concentric rings. Click a node to walk there."
        />
      </div>
      <Overlay />
    </main>
  );
}
