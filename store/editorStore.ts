import { create } from "zustand";
import type { TattooScheme } from "@/app/api/analyze-crop/route";

export type ArtStyle = "lineart" | "watercolor" | "cartoon";
export type ColorMode = "color" | "bw";
export type SizeKey = "S" | "M" | "L";

export const SIZE_CONFIG: Record<SizeKey, { label: string; cm: number; px: number; desc: string }> = {
  S: { label: "S · 3cm", cm: 3, px: 354, desc: "手指、耳后" },
  M: { label: "M · 5cm", cm: 5, px: 591, desc: "手腕、脚踝" },
  L: { label: "L · 8cm", cm: 8, px: 945, desc: "锁骨、小臂" },
};

/** 每个方案的纹身生成状态 */
export type SchemeGenState = "idle" | "generating" | "done" | "error";

export interface SchemeResult {
  state: SchemeGenState;
  url?: string;    // 生成成功后的 data URL
  error?: string;
}

interface EditorState {
  // 原始上传图片
  originalFile: File | null;
  originalUrl: string | null;

  // BiRefNet 抠图结果
  removedBgUrl: string | null;
  isRemoving: boolean;
  removeError: string | null;

  // doubao 分析出的 6 种方案
  tattooSchemes: TattooScheme[];
  isAnalyzing: boolean;
  analyzeError: string | null;

  // 每个方案的纹身生成结果（key = scheme.id）
  schemeResults: Record<string, SchemeResult>;

  // 当前进入编辑器的方案
  selectedSchemeId: string | null;

  // 编辑器内精调选项
  colorMode: ColorMode;
  showWhiteBorder: boolean;
  selectedSize: SizeKey;

  // Actions
  setOriginalFile: (file: File, url: string) => void;
  setRemovedBgUrl: (url: string) => void;
  setIsRemoving: (v: boolean) => void;
  setRemoveError: (e: string | null) => void;
  setTattooSchemes: (schemes: TattooScheme[]) => void;
  setIsAnalyzing: (v: boolean) => void;
  setAnalyzeError: (e: string | null) => void;
  setSchemeResult: (id: string, result: SchemeResult) => void;
  setSelectedSchemeId: (id: string | null) => void;
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
  tattooSchemes: [],
  isAnalyzing: false,
  analyzeError: null,
  schemeResults: {},
  selectedSchemeId: null,
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
  setTattooSchemes: (schemes) => set({ tattooSchemes: schemes }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalyzeError: (e) => set({ analyzeError: e }),
  setSchemeResult: (id, result) =>
    set((s) => ({ schemeResults: { ...s.schemeResults, [id]: result } })),
  setSelectedSchemeId: (id) => set({ selectedSchemeId: id }),
  setColorMode: (v) => set({ colorMode: v }),
  setShowWhiteBorder: (v) => set({ showWhiteBorder: v }),
  setSelectedSize: (v) => set({ selectedSize: v }),
  reset: () => set(initialState),
}));
