import { useEffect, useRef } from "react";
import { Overlay } from "./Overlay";
import { useStudio } from "@/lib/studio-store";

export function Studio() {
  const cubeRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const bind = useStudio((s) => s.bind);
  const patch = useStudio((s) => s.patch);
  const ready = useStudio((s) => s.ready);
  const step = useStudio((s) => s.step);
  const total = useStudio((s) => s.total);

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
    <main className="flex h-dvh min-h-[100dvh] flex-col overflow-hidden bg-bg text-fg">
      <h1 className="sr-only">
        Cayley — a Rubik’s cube and its three-ring Cayley graph
      </h1>
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 pt-[max(0.85rem,env(safe-area-inset-top))] sm:px-8 sm:py-4">
        <div>
          <p className="font-display text-[1.25rem] leading-none tracking-[-0.04em] text-fg sm:text-[1.6rem]">
            Cayley
          </p>
          <p className="mt-1.5 hidden max-w-[24rem] text-xs leading-relaxed text-muted text-pretty sm:block">
            Click a sticker to turn. Click a node to walk the graph.
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-dim sm:text-xs">
          {ready ? `${step}/${total}` : "…"}
        </p>
      </header>
      <div className="stage-grid min-h-0 flex-1">
        <canvas
          ref={cubeRef}
          className="size-full touch-none"
          aria-label="3D Rubik’s cube. Drag to orbit. Click a sticker to turn that face."
          data-stage="v4"
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
