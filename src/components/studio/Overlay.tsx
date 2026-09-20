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
    <footer className="dock pointer-events-auto shrink-0 border-t border-border bg-elevated px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                aria-label={
                  prime ? `${face} counterclockwise` : `${face} clockwise`
                }
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
          <p className="hidden text-xs text-dim sm:block">
            {s.phase}
            {s.moveLabel ? ` · ${s.moveLabel}` : ""}
          </p>
        </div>
      </div>
    </footer>
  );
}
