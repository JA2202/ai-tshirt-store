"use client";

import { create } from "zustand";

export type Side = "front" | "back";
export type Color = "white" | "black" | "navy";
export type Material = "standard" | "eco" | "premium";

type DesignStore = {
  // Stage 1
  prompt: string;
  images: string[];
  chosenImage: string | null;

  // Stage 2
  side: Side;
  color: Color;
  size: string;
  material: Material;

  setPrompt: (v: string) => void;
  setImages: (arr: string[]) => void;
  setChosenImage: (url: string | null) => void;

  setSide: (v: Side) => void;
  setColor: (v: Color) => void;
  setSize: (v: string) => void;
  setMaterial: (v: Material) => void;

  resetAll: () => void;
};

export const useDesignStore = create<DesignStore>((set) => ({
  prompt: "",
  images: [],
  chosenImage: null,

  side: "front",
  color: "white",
  size: "M",
  material: "standard",

  setPrompt: (prompt) => set({ prompt }),
  setImages: (images) => set({ images }),
  setChosenImage: (chosenImage) => set({ chosenImage }),

  setSide: (side) => set({ side }),
  setColor: (color) => set({ color }),
  setSize: (size) => set({ size }),
  setMaterial: (material) => set({ material }),

  resetAll: () =>
    set({
      prompt: "",
      images: [],
      chosenImage: null,
      side: "front",
      color: "white",
      size: "M",
      material: "standard",
    }),
}));
