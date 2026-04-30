import { create } from "zustand";

// ─── 风格类型 ───────────────────────────────────────────────
/** V2.9：10 种风格 key */
export type StyleKey =
  | "watercolor"
  | "outline"
  | "cartoon"
  | "kawaii"
  | "lineart"
  | "realism"
  | "neotraditional"
  | "embroidery"
  | "geometric"
  | "dotwork";

export const ALL_STYLE_KEYS: StyleKey[] = [
  "watercolor",
  "outline",
  "cartoon",
  "kawaii",
  "lineart",
  "realism",
  "neotraditional",
  "embroidery",
  "geometric",
  "dotwork",
];

/** 向后兼容旧代码引用的 ArtStyle（与 StyleKey 等价） */
export type ArtStyle = StyleKey;

export type ColorMode = "color" | "bw";
export type SizeKey = "S" | "M" | "L";

/** 裁切区域，值为相对比例 0-1（相对于原图宽高） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SIZE_CONFIG: Record<SizeKey, { label: string; cm: number; px: number; desc: string }> = {
  S: { label: "S · 3cm", cm: 3, px: 354, desc: "手指、耳后" },
  M: { label: "M · 5cm", cm: 5, px: 591, desc: "手腕、脚踝" },
  L: { label: "L · 8cm", cm: 8, px: 945, desc: "锁骨、小臂" },
};

// ─── 部位 ─────────────────────────────────────────────────
export type BodyPart =
  | "finger"
  | "hand"
  | "wrist"
  | "ankle"
  | "collarbone"
  | "shoulder"
  | "forearm"
  | "upperarm";

export const BODY_PART_CONFIG: Record<
  BodyPart,
  { label: string; recommendedSize: SizeKey }
> = {
  finger:     { label: "手指",    recommendedSize: "S" },
  hand:       { label: "手背",    recommendedSize: "S" },
  wrist:      { label: "手腕",    recommendedSize: "M" },
  ankle:      { label: "脚踝",    recommendedSize: "M" },
  collarbone: { label: "锁骨",    recommendedSize: "M" },
  shoulder:   { label: "肩部",    recommendedSize: "L" },
  forearm:    { label: "前臂",    recommendedSize: "L" },
  upperarm:   { label: "上臂",    recommendedSize: "L" },
};

export const ALL_BODY_PARTS = Object.keys(BODY_PART_CONFIG) as BodyPart[];

// ─── 各风格生成结果 ───────────────────────────────────────
export type GenStatus = "idle" | "pending" | "done" | "error";

export interface GenResult {
  status: GenStatus;
  url?: string;   // data URL（成功时）
  error?: string; // 错误信息（失败时）
}

// ─── 页面 phase ────────────────────────────────────────────
export type AppPhase = "upload" | "style" | "waiting" | "done";

// ─── Store 接口 ───────────────────────────────────────────
interface EditorState {
  // ── phase 管理 ──
  phase: AppPhase;
  setPhase: (p: AppPhase) => void;

  // ── 宠物名字 ──
  petName: string;
  setPetName: (name: string) => void;

  // ── 原始上传图片 ──
  originalFile: File | null;
  originalUrl: string | null;
  setOriginalFile: (file: File, url: string) => void;

  // ── 后台静默抠图 ──
  /** 抠图状态 */
  bgRemoveStatus: "idle" | "pending" | "done" | "error";
  bgRemoveError: string | null;
  removedBgUrl: string | null;
  setBgRemoveStatus: (s: "idle" | "pending" | "done" | "error") => void;
  setBgRemoveError: (e: string | null) => void;
  setRemovedBgUrl: (url: string) => void;

  // ── 选中的风格（最多 3 种） ──
  selectedStyles: StyleKey[];
  setSelectedStyles: (styles: StyleKey[]) => void;
  toggleStyle: (key: StyleKey) => void;

  // ── 生成结果（按风格 key 索引） ──
  generationResults: Record<StyleKey, GenResult>;
  setGenResult: (key: StyleKey, result: GenResult) => void;
  retryGen: (key: StyleKey) => void; // 仅重置为 pending，触发重试由外部负责

  // ── 当前在结果页查看的风格 key ──
  currentStyleKey: StyleKey | null;
  setCurrentStyleKey: (key: StyleKey | null) => void;

  // ── 部位选择（等待页可选） ──
  selectedBodyParts: BodyPart[];
  toggleBodyPart: (part: BodyPart) => void;

  // ── 尺寸 ──
  selectedSize: SizeKey;
  setSelectedSize: (v: SizeKey) => void;

  // ── 旧版兼容字段（供 DownloadModal / canvas lib 用） ──
  colorMode: ColorMode;
  showWhiteBorder: boolean;
  squareCrop: boolean;
  cropRect: CropRect | null;
  selectedBase: "realistic" | "art";
  selectedArtStyle: ArtStyle;
  isRemoving: boolean; // alias for bgRemoveStatus==='pending'

  // ── reset ──
  reset: () => void;
}

const initialGenerationResults = Object.fromEntries(
  ALL_STYLE_KEYS.map((k) => [k, { status: "idle" as GenStatus }])
) as Record<StyleKey, GenResult>;

/** 过滤掉旧版本遗留的、当前不再支持的 StyleKey（防浏览器缓存崩溃） */
function filterValidStyles(styles: string[]): StyleKey[] {
  return styles.filter((k): k is StyleKey => ALL_STYLE_KEYS.includes(k as StyleKey));
}

const initialState = {
  phase: "upload" as AppPhase,
  petName: "",
  originalFile: null,
  originalUrl: null,
  bgRemoveStatus: "idle" as const,
  bgRemoveError: null,
  removedBgUrl: null,
  selectedStyles: [] as StyleKey[],
  generationResults: initialGenerationResults,
  currentStyleKey: null as StyleKey | null,
  selectedBodyParts: [] as BodyPart[],
  selectedSize: "M" as SizeKey,
  // 旧版兼容
  colorMode: "color" as ColorMode,
  showWhiteBorder: false,
  squareCrop: false,
  cropRect: null,
  selectedBase: "art" as "realistic" | "art",
  selectedArtStyle: "watercolor" as ArtStyle,
  isRemoving: false,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setPhase: (p) => set({ phase: p }),
  setPetName: (name) => set({ petName: name }),

  setOriginalFile: (file, url) => set({ originalFile: file, originalUrl: url }),

  setBgRemoveStatus: (s) => set({ bgRemoveStatus: s, isRemoving: s === "pending" }),
  setBgRemoveError: (e) => set({ bgRemoveError: e }),
  setRemovedBgUrl: (url) => set({ removedBgUrl: url, bgRemoveStatus: "done", isRemoving: false }),

  setSelectedStyles: (styles) =>
    set({ selectedStyles: filterValidStyles(styles).slice(0, 3) }),
  toggleStyle: (key) => {
    const { selectedStyles } = get();
    // 先过滤旧 key，再操作
    const valid = filterValidStyles(selectedStyles);
    if (valid.includes(key)) {
      set({ selectedStyles: valid.filter((k) => k !== key) });
    } else if (valid.length < 3) {
      set({ selectedStyles: [...valid, key] });
    }
    // 已选 3 种时忽略新增
  },

  setGenResult: (key, result) =>
    set((s) => ({
      generationResults: { ...s.generationResults, [key]: result },
    })),

  retryGen: (key) =>
    set((s) => ({
      generationResults: {
        ...s.generationResults,
        [key]: { status: "pending" },
      },
    })),

  setCurrentStyleKey: (key) => set({ currentStyleKey: key }),

  toggleBodyPart: (part) => {
    const { selectedBodyParts } = get();
    if (selectedBodyParts.includes(part)) {
      set({ selectedBodyParts: selectedBodyParts.filter((p) => p !== part) });
    } else {
      set({ selectedBodyParts: [...selectedBodyParts, part] });
    }
  },

  setSelectedSize: (v) => set({ selectedSize: v }),

  reset: () =>
    set({
      ...initialState,
      generationResults: Object.fromEntries(
        ALL_STYLE_KEYS.map((k) => [k, { status: "idle" as GenStatus }])
      ) as Record<StyleKey, GenResult>,
    }),
}));
