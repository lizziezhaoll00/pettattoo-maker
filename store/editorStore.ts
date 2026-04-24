import { create } from "zustand";

export type ArtStyle = "lineart" | "watercolor" | "cartoon";
export type ColorMode = "color" | "bw";
export type SizeKey = "S" | "M" | "L";

export const SIZE_CONFIG: Record<SizeKey, { label: string; cm: number; px: number; desc: string }> = {
  S: { label: "S · 3cm", cm: 3, px: 354, desc: "手指、耳后" },
  M: { label: "M · 5cm", cm: 5, px: 591, desc: "手腕、脚踝" },
  L: { label: "L · 8cm", cm: 8, px: 945, desc: "锁骨、小臂" },
};

interface EditorState {
  // 原始上传图片
  originalFile: File | null;
  originalUrl: string | null;

  // 抠图结果
  removedBgUrl: string | null;
  isRemoving: boolean;
  removeError: string | null;

  // 风格化结果（每个风格单独缓存）
  stylizedUrls: Partial<Record<ArtStyle, string>>;
  isStylizing: Partial<Record<ArtStyle, boolean>>;
  stylizeErrors: Partial<Record<ArtStyle, string>>;

  // 用户选择
  selectedBase: "realistic" | "art"; // 写实 or 艺术
  selectedArtStyle: ArtStyle;
  colorMode: ColorMode;
  showWhiteBorder: boolean;
  selectedSize: SizeKey;

  // Actions
  setOriginalFile: (file: File, url: string) => void;
  setRemovedBgUrl: (url: string) => void;
  setIsRemoving: (v: boolean) => void;
  setRemoveError: (e: string | null) => void;
  setStylizedUrl: (style: ArtStyle, url: string) => void;
  setIsStylizing: (style: ArtStyle, v: boolean) => void;
  setStylizeError: (style: ArtStyle, e: string | null) => void;
  setSelectedBase: (v: "realistic" | "art") => void;
  setSelectedArtStyle: (v: ArtStyle) => void;
  setColorMode: (v: ColorMode) => void;
  setShowWhiteBorder: (v: boolean) => void;
  setSelectedSize: (v: SizeKey) => void;
  reset: () => void;
}

const initialState = {
  originalFile: null,
  originalUrl: null,
  removedBgUrl: null,
  isRemoving: false,
  removeError: null,
  stylizedUrls: {},
  isStylizing: {},
  stylizeErrors: {},
  selectedBase: "realistic" as const,
  selectedArtStyle: "lineart" as const,
  colorMode: "color" as const,
  showWhiteBorder: false,
  selectedSize: "M" as const,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  setOriginalFile: (file, url) => set({ originalFile: file, originalUrl: url }),
  setRemovedBgUrl: (url) => set({ removedBgUrl: url }),
  setIsRemoving: (v) => set({ isRemoving: v }),
  setRemoveError: (e) => set({ removeError: e }),

  setStylizedUrl: (style, url) =>
    set((s) => ({ stylizedUrls: { ...s.stylizedUrls, [style]: url } })),
  setIsStylizing: (style, v) =>
    set((s) => ({ isStylizing: { ...s.isStylizing, [style]: v } })),
  setStylizeError: (style, e) =>
    set((s) => ({ stylizeErrors: { ...s.stylizeErrors, [style]: e } })),

  setSelectedBase: (v) => set({ selectedBase: v }),
  setSelectedArtStyle: (v) => set({ selectedArtStyle: v }),
  setColorMode: (v) => set({ colorMode: v }),
  setShowWhiteBorder: (v) => set({ showWhiteBorder: v }),
  setSelectedSize: (v) => set({ selectedSize: v }),

  reset: () => set(initialState),
}));
