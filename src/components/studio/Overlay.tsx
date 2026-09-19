import {
  Circle,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GENERATED_FILMS } from "@/lib/films";
import { FILM_SCRIPTS, useStudio, type FilmId } from "@/lib/studio-store";
import { ALL_MOVES, type Move } from "@/lib/cube/model";
import { cn } from "@/lib/utils";

const FILMS = Object.values(FILM_SCRIPTS);

export function Overlay() {
  const s = useStudio();
  const stage = s.stage;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-fg sm:p-6">
      <header className="pointer-events-none flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="wordmark">Cayley</p>
          <p className="mt-2 max-w-sm text-sm text-muted text-pretty">
            The cube is a graph. Turns are edges. Gold is a path home.
          </p>
        </div>
        <dl className="hidden tabular-nums sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-1 sm:text-right">
          <Stat label="Nodes" value={s.nodes} />
          <Stat label="Visited" value={s.explored} />
          <Stat label="Path" value={s.path} />
          <Stat label="Depth" value={s.depth} />
        </dl>
      </header>

      <div className="pointer-events-auto flex flex-col gap-3">
        <p className="max-w-xl text-sm text-muted text-pretty">{s.caption}</p>
        <div className="flex flex-wrap items-center gap-2">
          {FILMS.map((f) => (
            <Button
              key={f.id}
              size="chip"
              variant={s.filmId === f.id ? "default" : "outline"}
              onClick={() => stage?.playFilm(f.id as FilmId)}
            >
              {f.title}
            </Button>
          ))}
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
            size="sm"
            variant="outline"
            onClick={() => stage?.scrambleNow()}
          >
            <Shuffle />
            Scramble
          </Button>
          <Button size="sm" variant="outline" onClick={() => stage?.solveNow()}>
            Solve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stage?.resetSolved()}
          >
            <RotateCcw />
            Reset
          </Button>
          <Button
            size="sm"
            variant={s.recording ? "default" : "outline"}
            onClick={() => void stage?.toggleRecord()}
          >
            {s.recording ? <Square /> : <Circle />}
            {s.recording ? "Stop" : "Record"}
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Speed
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={s.speed}
              onChange={(e) => stage?.setSpeed(Number(e.target.value))}
              className="h-11 w-24 accent-fg"
              aria-label="Animation speed"
            />
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => s.setFilmsOpen(true)}
          >
            Films
          </Button>
        </div>
        <div className="hidden sm:block">
          <MovePad
            onMove={(m) => stage?.enqueueMove(m)}
            active={s.moveLabel}
          />
        </div>
        <p className="text-xs text-dim">
          {s.phase}
          {s.moveLabel ? ` · ${s.moveLabel}` : ""}
          {s.shortest ? " · optimal" : ""}
          {s.ready ? "" : " · staging"}
        </p>
      </div>

      {s.filmsOpen ? <FilmsDrawer onClose={() => s.setFilmsOpen(false)} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-dim">
        {label}
      </dt>
      <dd className="font-mono text-sm text-fg">{value.toLocaleString()}</dd>
    </div>
  );
}

function MovePad({
  onMove,
  active,
}: {
  onMove: (m: Move) => void;
  active: string;
}) {
  const faces = ["U", "R", "F", "D", "L", "B"] as const;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Face turns">
      {faces.map((f) => (
        <div key={f} className="flex gap-1">
          {ALL_MOVES.filter((m) => m.startsWith(f)).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMove(m)}
              className={cn(
                "h-11 min-w-11 rounded-[var(--radius-xs)] border border-border bg-elevated px-2 font-mono text-xs text-fg",
                active === m && "border-fg bg-fg text-bg",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function FilmsDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-end bg-bg/70 sm:items-center sm:justify-center sm:p-8">
      <div className="max-h-[86vh] w-full overflow-y-auto rounded-t-[var(--radius-xl)] bg-elevated p-5 sm:max-w-3xl sm:rounded-[var(--radius-xl)] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl tracking-[-0.03em]">Films</h2>
            <p className="mt-1 max-w-md text-sm text-muted text-pretty">
              Cinematic renders of the same idea — cube states as a graph, a
              gold geodesic home.
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close films" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {GENERATED_FILMS.map((film) => (
            <article key={film.id} className="overflow-hidden rounded-[var(--radius-md)] bg-bg">
              <video
                className="aspect-video w-full bg-bg object-cover"
                src={film.src}
                poster={film.poster}
                controls
                playsInline
                preload="metadata"
              />
              <div className="p-3">
                <p className="text-sm font-medium">
                  {film.title}
                  <span className="ml-2 font-mono text-xs text-dim">
                    {film.duration}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">{film.note}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
