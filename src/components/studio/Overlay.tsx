import { useState } from "react";
import { Pause, Play, RotateCcw, Shuffle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FACES, type Move } from "@/lib/cube/model";
import { useStudio } from "@/lib/studio-store";

export function Overlay() {
  const s = useStudio();
  const stage = s.stage;
  const [prime, setPrime] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[1.35rem] leading-none tracking-[-0.04em] text-fg sm:text-2xl">
            Cayley
          </p>
          <p className="mt-2 max-w-[22rem] text-xs leading-relaxed text-muted text-pretty">
            Click a sticker to turn. Click a node to walk the graph.
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-dim sm:text-xs">
          {s.ready ? `${s.step}/${s.total}` : "…"}
        </p>
      </header>

      <div className="pointer-events-auto flex max-w-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FACES.map((face) => {
            const move = (prime ? `${face}'` : face) as Move;
            return (
              <Button
                key={face}
                size="sm"
                variant="quiet"
                className="min-w-11 font-mono"
                onClick={() => stage?.applyMove(move)}
                aria-label={prime ? `${face} counterclockwise` : `${face} clockwise`}
              >
                {face}
                {prime ? "′" : ""}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant={prime ? "default" : "outline"}
            className="min-w-11 font-mono"
            aria-pressed={prime}
            aria-label="Toggle prime turns"
            onClick={() => setPrime((v) => !v)}
          >
            ′
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="quiet"
            aria-label={s.playing ? "Pause" : "Play"}
            onClick={() => stage?.setPlaying(!s.playing)}
          >
            {s.playing ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Undo"
            disabled={!s.canUndo}
            onClick={() => stage?.undo()}
          >
            <Undo2 />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Reset solved"
            onClick={() => stage?.resetSolved()}
          >
            <RotateCcw />
          </Button>
          <Button
            size="default"
            variant="outline"
            onClick={() => stage?.scrambleNow()}
          >
            <Shuffle />
            New path
          </Button>
          <p className="text-xs text-dim">
            {s.phase}
            {s.moveLabel ? ` · ${s.moveLabel}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
