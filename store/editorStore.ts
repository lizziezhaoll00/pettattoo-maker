import { create } from "zustand";
import type { CropSuggestion } from "@/app/api/analyze-crop/route";

/** TattooScheme 扩展 CropSuggestion，附加 schemes 页旧版字段（可选，保持向后兼容） */
export type TattooScheme = CropSuggestion & {
  tattooPrompt?: string;
  styleEmoji?: string;
  poseDesc?: string;
  bodyPart?: string;
  size?: string;
};

/** schemes 页旧版方案生成状态 */
export type SchemeGenState = "idle" | "generating" | "done" | "error";
export interface SchemeResult {
  state: SchemeGenState;
  url?: string;
  error?: string;
}

export type ArtStyle = "lineart" | "watercolor" | "cartoon";
export type ColorMode = "color" | "bw";
export type SizeKey = "S" | "M" | "L";

/** 裁切区域，值为相对比例 0-1（相对于原图宽高） */
export interface CropRect {
  x: number; // 左边距比例
  y: number; // 上边距比例
  w: number; // 宽度比例
  h: number; // 高度比例
}

export const SIZE_CONFIG: Record<SizeKey, { label: string; cm: number; px: number; desc: string }> = {
  S: { label: "S · 3cm", cm: 3, px: 354, desc: "手指、耳后" },
  M: { label: "M · 5cm", cm: 5, px: 591, desc: "手腕、脚踝" },
  L: { label: "L · 8cm", cm: 8, px: 945, desc: "锁骨、小臂" },
};

interface EditorState {
  // 原始上传图片
  originalFile: File | null;
  originalUrl: string | null;

  // BiRefNet 抠图结果
  removedBgUrl: string | null;
  isRemoving: boolean;
  removeError: string | null;

  // AI 分析阶段（上传后方案选择）
  tattooSchemes: TattooScheme[];
  isAnalyzing: boolean;
  analyzeError: string | null;
  selectedSchemeId: string | null;
  /** 选中方案的风格化提示（品种、构图约束），拼接到 seedream prompt 防止裁剪 */
  selectedStylizeHint: string;

  // schemes 页兼容字段（旧流程，保留防止编译报错）
  schemeResults: Record<string, SchemeResult>;

  // 编辑器内风格选择
  /** "realistic" = 直接用抠图原图；"art" = 用 stylizedUrls[selectedArtStyle] */
  selectedBase: "realistic" | "art";
  selectedArtStyle: ArtStyle;

  /** 各艺术风格的生成结果 URL（key = ArtStyle） */
  stylizedUrls: Record<ArtStyle, string | null>;
  /** 各风格是否正在生成 */
  isStylizing: Record<ArtStyle, boolean>;
  /** 各风格的报错信息 */
  stylizeErrors: Record<ArtStyle, string | null>;

  // 编辑器内精调选项
  colorMode: ColorMode;
  showWhiteBorder: boolean;
  squareCrop: boolean;
  cropRect: CropRect | null;
  selectedSize: SizeKey;

  // Actions
  setOriginalFile: (file: File, url: string) => void;
  setRemovedBgUrl: (url: string) => void;
  setIsRemoving: (v: boolean) => void;
  setRemoveError: (e: string | null) => void;
  setTattooSchemes: (schemes: TattooScheme[]) => void;
  setIsAnalyzing: (v: boolean) => void;
  setAnalyzeError: (e: string | null) => void;
  setSelectedSchemeId: (id: string | null) => void;
  setSelectedStylizeHint: (hint: string) => void;
  setSchemeResult: (id: string, result: SchemeResult) => void;
  setSelectedBase: (v: "realistic" | "art") => void;
  setSelectedArtStyle: (v: ArtStyle) => void;
  setStylizedUrl: (style: ArtStyle, url: string) => void;
  setIsStylizing: (style: ArtStyle, v: boolean) => void;
  setStylizeError: (style: ArtStyle, e: string | null) => void;
  setColorMode: (v: ColorMode) => void;
  setShowWhiteBorder: (v: boolean) => void;
  setSquareCrop: (v: boolean) => void;
  setCropRect: (rect: CropRect | null) => void;
  setSelectedSize: (v: SizeKey) => void;
  reset: () => void;
}

const ART_STYLES: ArtStyle[] = ["lineart", "watercolor", "cartoon"];

const initialState = {
  originalFile: null,
  originalUrl: null,
  removedBgUrl: null,
  isRemoving: false,
  removeError: null,
  tattooSchemes: [],
  isAnalyzing: false,
  analyzeError: null,
  selectedSchemeId: null,
  selectedStylizeHint: "",
  schemeResults: {},
  selectedBase: "realistic" as const,
  selectedArtStyle: "lineart" as ArtStyle,
  stylizedUrls: Object.fromEntries(ART_STYLES.map((s) => [s, null])) as Record<ArtStyle, string | null>,
  isStylizing: Object.fromEntries(ART_STYLES.map((s) => [s, false])) as Record<ArtStyle, boolean>,
  stylizeErrors: Object.fromEntries(ART_STYLES.map((s) => [s, null])) as Record<ArtStyle, string | null>,
  colorMode: "color" as const,
  showWhiteBorder: false,
  squareCrop: false,
  cropRect: null,
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
  setSelectedSchemeId: (id) => set({ selectedSchemeId: id }),
  setSelectedStylizeHint: (hint) => set({ selectedStylizeHint: hint }),
  setSchemeResult: (id, result) =>
    set((s) => ({ schemeResults: { ...s.schemeResults, [id]: result } })),
  setSelectedBase: (v) => set({ selectedBase: v }),
  setSelectedArtStyle: (v) => set({ selectedArtStyle: v }),
  setStylizedUrl: (style, url) =>
    set((s) => ({ stylizedUrls: { ...s.stylizedUrls, [style]: url } })),
  setIsStylizing: (style, v) =>
    set((s) => ({ isStylizing: { ...s.isStylizing, [style]: v } })),
  setStylizeError: (style, e) =>
    set((s) => ({ stylizeErrors: { ...s.stylizeErrors, [style]: e } })),
  setColorMode: (v) => set({ colorMode: v }),
  setShowWhiteBorder: (v) => set({ showWhiteBorder: v }),
  setSquareCrop: (v) => set({ squareCrop: v }),
  setCropRect: (rect) => set({ cropRect: rect }),
  setSelectedSize: (v) => set({ selectedSize: v }),
  reset: () => set(initialState),
}));
