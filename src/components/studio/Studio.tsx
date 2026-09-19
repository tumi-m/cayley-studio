import { useEffect, useRef } from "react";
import { Overlay } from "./Overlay";
import { useStudio } from "@/lib/studio-store";

export function Studio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bind = useStudio((s) => s.bind);
  const patch = useStudio((s) => s.patch);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let stage: import("@/lib/cube/stage").CayleyStage | null = null;

    void import("@/lib/cube/stage").then(({ CayleyStage }) => {
      if (disposed || !canvasRef.current) return;
      stage = new CayleyStage(canvasRef.current);
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
        Cayley — solving a Rubik’s cube with graph theory
      </h1>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none"
        aria-label="3D Cayley graph of Rubik’s cube states"
      />
      <div className="stage-vignette" aria-hidden="true" />
      <Overlay />
    </main>
  );
}
