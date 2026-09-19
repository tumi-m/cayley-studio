import { Pause, Play, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/lib/studio-store";

export function Overlay() {
  const s = useStudio();
  const stage = s.stage;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[1.35rem] leading-none tracking-[-0.04em] text-fg sm:text-2xl">
            Cayley
          </p>
          <p className="mt-2 max-w-[18rem] text-xs leading-relaxed text-muted text-pretty sm:max-w-sm">
            The cube is a graph. Each node is a state. Each edge is a turn.
          </p>
        </div>
        <p className="font-mono text-[11px] tabular-nums text-dim sm:text-xs">
          {s.ready ? `${s.step}/${s.total} · ${s.nodes} nodes` : "building…"}
        </p>
      </header>

      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          variant="quiet"
          aria-label={s.playing ? "Pause" : "Play"}
          onClick={() => stage?.setPlaying(!s.playing)}
        >
          {s.playing ? <Pause /> : <Play />}
        </Button>
        <Button
          size="default"
          variant="outline"
          onClick={() => stage?.scrambleNow()}
        >
          <Shuffle />
          New path
        </Button>
        <p className="ml-1 text-xs text-dim">
          {s.phase}
          {s.moveLabel ? ` · ${s.moveLabel}` : ""}
        </p>
      </div>
    </div>
  );
}
