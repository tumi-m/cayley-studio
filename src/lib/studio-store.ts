import { create } from "zustand";
import type { CayleyStage, StageSnapshot } from "./cube/stage";

const empty: StageSnapshot = {
  playing: true,
  ready: false,
  phase: "Loading",
  moveLabel: "",
  nodes: 0,
  step: 0,
  total: 0,
  canUndo: false,
  hint: "Click a sticker or a node",
};

interface StudioStore extends StageSnapshot {
  stage: CayleyStage | null;
  bind: (stage: CayleyStage | null) => void;
  patch: (snap: StageSnapshot) => void;
}

export const useStudio = create<StudioStore>((set) => ({
  ...empty,
  stage: null,
  bind: (stage) => set({ stage }),
  patch: (snap) => set(snap),
}));
