import { create } from "zustand";
import type { CayleyStage, StageSnapshot } from "./cube/stage";
import { FILM_SCRIPTS, type FilmId } from "./cube/graph";

const empty: StageSnapshot = {
  caption: FILM_SCRIPTS.shortest.caption,
  filmId: "shortest",
  playing: true,
  recording: false,
  ready: false,
  phase: "Loading",
  moveLabel: "",
  speed: 1,
  nodes: 0,
  depth: 0,
  path: 0,
  explored: 0,
  shortest: false,
  currentPath: 0,
};

interface StudioStore extends StageSnapshot {
  stage: CayleyStage | null;
  filmsOpen: boolean;
  bind: (stage: CayleyStage | null) => void;
  patch: (snap: StageSnapshot) => void;
  setFilmsOpen: (v: boolean) => void;
}

export const useStudio = create<StudioStore>((set) => ({
  ...empty,
  stage: null,
  filmsOpen: false,
  bind: (stage) => set({ stage }),
  patch: (snap) => set(snap),
  setFilmsOpen: (filmsOpen) => set({ filmsOpen }),
}));

export { FILM_SCRIPTS };
export type { FilmId };
