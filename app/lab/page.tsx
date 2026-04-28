"use client";

/**
 * 🧪 内部效果测试工具 — Lab
 *
 * 用途：对比不同抠图模型（BiRefNet vs rembg）和风格化效果，
 *       测出最优组合后决定上线方案，不对外开放。
 *
 * 入口：/lab（Next.js App Router，本地开发时访问即可）
 */

import { useRef, useState, useCallback } from "react";

// ─── LangSAM 方案建议类型（与 /api/analyze-crop 保持一致）─────────────────────
interface CropSuggestion {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  cropHint: string;
}

// ─── 类型 ────────────────────────────────────────────────────────────────────

type RembgModel = "birefnet" | "rembg" | "removebg" | "langsam";
type ArtStyle = "lineart" | "watercolor" | "cartoon" | "kawaii" | "outline";
type StepState = "idle" | "loading" | "done" | "error";

interface StyleResult {
  state: StepState;
  url?: string;
  ms?: number;
  error?: string;
  prompt?: string;
}

interface ColumnResult {
  /** 列的显示标题（如模型名或方案名） */
  label: string;
  /** 列的副标题（费用说明等） */
  sublabel: string;
  /** 抠图结果 */
  removeBg: { state: StepState; url?: string; ms?: number; error?: string; prompt?: string };
  /** 每个风格的结果 */
  stylize: Partial<Record<ArtStyle, StyleResult>>;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MODELS: { key: RembgModel; label: string; desc: string }[] = [
  { key: "birefnet",  label: "BiRefNet",   desc: "A100 · ~12s · $0.002" },
  { key: "rembg",    label: "rembg",      desc: "T4   · ~1s  · $0.00045" },
  { key: "removebg", label: "remove.bg",  desc: "商业 · ~2s  · 50次/月免费" },
  { key: "langsam",  label: "LangSAM",    desc: "文本引导 · ~5-15s · $0.002" },
];

const STYLES: { key: ArtStyle; emoji: string; label: string }[] = [
  { key: "lineart",   emoji: "✏️", label: "线稿" },
  { key: "watercolor",emoji: "🎨", label: "水彩" },
  { key: "cartoon",   emoji: "🐾", label: "卡通" },
  { key: "outline",   emoji: "🖋️", label: "极简线条" },
  { key: "kawaii",    emoji: "🌸", label: "萌系贴纸" },
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtMs(ms?: number) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function StatusBadge({ state }: { state: StepState }) {
  const map: Record<StepState, { text: string; cls: string }> = {
    idle:    { text: "等待",    cls: "bg-gray-100 text-gray-500" },
    loading: { text: "处理中…", cls: "bg-yellow-100 text-yellow-700 animate-pulse" },
    done:    { text: "完成",    cls: "bg-green-100 text-green-700" },
    error:   { text: "失败",    cls: "bg-red-100 text-red-600" },
  };
  const { text, cls } = map[state];
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{text}</span>;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function LabPage() {
  // 输入状态
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<RembgModel>>(new Set(["birefnet", "removebg"]));
  const [withStylize, setWithStylize] = useState(false);
  /** 多选风格 */
  const [selectedStyles, setSelectedStyles] = useState<Set<ArtStyle>>(new Set(["lineart"]));

  // LangSAM 方案状态
  const [cropSuggestions, setCropSuggestions] = useState<CropSuggestion[]>([]);
  /** 多选方案 */
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [cropHintForLab, setCropHintForLab] = useState<string>("the pet and its accessories on a cozy indoor background");
  const [cropHintAnalyzing, setCropHintAnalyzing] = useState(false);

  /**
   * 结果字典：key = columnKey
   * - 非 LangSAM 模型：key = model  ("birefnet" | "rembg" | "removebg")
   * - LangSAM 方案：  key = "langsam:{suggestionId}"（每个选中方案独占一列）
   */
  const [results, setResults] = useState<Record<string, ColumnResult>>({});
  const [running, setRunning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 图片压缩（用于分析，1024px JPEG）──
  const compressForAnalyze = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // ── 选中 LangSAM 时自动调用图像分析，展示方案卡片 ──
  const analyzeForLangSAM = useCallback(async (file: File) => {
    setCropHintAnalyzing(true);
    setCropSuggestions([]);
    setSelectedSuggestionIds(new Set());
    try {
      const imageDataUrl = await compressForAnalyze(file);
      const res = await fetch("/api/analyze-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      if (!res.ok) return;
      const { suggestions } = await res.json() as { suggestions: CropSuggestion[] };
      if (suggestions?.length) {
        setCropSuggestions(suggestions);
        // 默认选中第一条
        setSelectedSuggestionIds(new Set([suggestions[0].id]));
        setCropHintForLab(suggestions[0].cropHint);
      }
    } catch {
      // 分析失败不影响使用，保留默认值
    } finally {
      setCropHintAnalyzing(false);
    }
  }, [compressForAnalyze]);

  // ── 图片选择 ──
  const handleFile = useCallback((file: File) => {
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResults({});
    // 切换图片时清空旧的方案
    setCropSuggestions([]);
    setSelectedSuggestionIds(new Set());
    // 如果已选中 LangSAM，自动分析新图片
    if (selectedModels.has("langsam")) {
      analyzeForLangSAM(file);
    }
  }, [selectedModels, analyzeForLangSAM]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  };

  // ── 模型勾选 ──
  const toggleModel = (key: RembgModel) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size === 1) return prev; // 至少留一个
      next.has(key) ? next.delete(key) : next.add(key);
      if (!prev.has("langsam") && key === "langsam" && imageFile) {
        // 刚勾选 LangSAM 且已有图片：自动分析填充 prompt
        analyzeForLangSAM(imageFile);
      }
      return next;
    });
  };

  // ── LangSAM 方案多选 ──
  const toggleSuggestion = (s: CropSuggestion) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) {
        if (next.size === 1) return prev; // 至少留一个
        next.delete(s.id);
      } else {
        next.add(s.id);
      }
      // 若最终只剩一个选中，同步更新手动微调框
      if (next.size === 1) {
        const singleId = Array.from(next)[0];
        const single = cropSuggestions.find((x) => x.id === singleId);
        if (single) {
          setCropHintForLab(single.cropHint);
        }
      }
      return next;
    });
  };

  // ── 风格多选 ──
  const toggleStyle = (key: ArtStyle) => {
    setSelectedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size === 1) return prev; // 至少留一个
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── 生成列键 ──
  const buildColumnKeys = useCallback((): string[] => {
    const keys: string[] = [];
    for (const m of selectedModels) {
      if (m === "langsam") {
        // 每个选中方案独占一列
        for (const id of selectedSuggestionIds) {
          keys.push(`langsam:${id}`);
        }
        // 若没有选中方案（尚未分析），用默认一列
        if (selectedSuggestionIds.size === 0) {
          keys.push("langsam:default");
        }
      } else {
        keys.push(m);
      }
    }
    return keys;
  }, [selectedModels, selectedSuggestionIds]);

  // ── 单列处理逻辑 ──
  const runColumn = useCallback(
    async (
      columnKey: string,
      file: File,
      doStylize: boolean,
      styles: ArtStyle[],
      cropHint: string,
    ) => {
      const model = columnKey.startsWith("langsam") ? "langsam" : (columnKey as RembgModel);

      // 1. 抠图
      setResults((prev) => ({
        ...prev,
        [columnKey]: {
          ...prev[columnKey],
          removeBg: { state: "loading" },
          stylize: {},
        },
      }));

      let removeBgUrl: string | undefined;
      const t0 = Date.now();
      try {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("model", model);
        if (model === "langsam") fd.append("cropHint", cropHint);
        console.log(`[Lab] 🚀 col=${columnKey} | cropHint=${model === "langsam" ? cropHint : "(不适用)"}`);
        const res = await fetch("/api/remove-bg", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          let msg = text;
          try { msg = JSON.parse(text)?.error ?? text; } catch { /* ignore */ }
          throw new Error(msg);
        }
        const textPromptHeader = res.headers.get("x-text-prompt") ?? undefined;
        const blob = await res.blob();
        removeBgUrl = URL.createObjectURL(blob);
        const ms = Date.now() - t0;
        setResults((prev) => ({
          ...prev,
          [columnKey]: {
            ...prev[columnKey],
            removeBg: { state: "done", url: removeBgUrl, ms, prompt: textPromptHeader || undefined },
          },
        }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [columnKey]: {
            ...prev[columnKey],
            removeBg: { state: "error", error: (err as Error).message, ms: Date.now() - t0 },
          },
        }));
        return;
      }

      if (!doStylize || !removeBgUrl || styles.length === 0) return;

      // 2. 把 blob URL 转成带灰底的 base64 data URL（只做一次）
      let dataUrl: string;
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#e8e8e8";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = () => reject(new Error("图片加载失败"));
          img.src = removeBgUrl!;
        });
      } catch (err) {
        for (const style of styles) {
          setResults((prev) => ({
            ...prev,
            [columnKey]: {
              ...prev[columnKey],
              stylize: {
                ...prev[columnKey]?.stylize,
                [style]: { state: "error", error: (err as Error).message },
              },
            },
          }));
        }
        return;
      }

      // 3. 并发跑所有选中风格
      await Promise.all(
        styles.map(async (style) => {
          setResults((prev) => ({
            ...prev,
            [columnKey]: {
              ...prev[columnKey],
              stylize: { ...prev[columnKey]?.stylize, [style]: { state: "loading" } },
            },
          }));
          const t1 = Date.now();
          try {
            const res = await fetch("/api/seedream-stylize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: dataUrl, style, cropHint: cropHint || undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            const { url, error, promptUsed } = await res.json();
            if (error) throw new Error(error);
            const ms = Date.now() - t1;
            setResults((prev) => ({
              ...prev,
              [columnKey]: {
                ...prev[columnKey],
                stylize: {
                  ...prev[columnKey]?.stylize,
                  [style]: { state: "done", url, ms, prompt: promptUsed },
                },
              },
            }));
          } catch (err) {
            setResults((prev) => ({
              ...prev,
              [columnKey]: {
                ...prev[columnKey],
                stylize: {
                  ...prev[columnKey]?.stylize,
                  [style]: { state: "error", error: (err as Error).message, ms: Date.now() - t1 },
                },
              },
            }));
          }
        })
      );
    },
    [] // cropHint 通过参数传入，不作依赖
  );

  // ── 开始测试 ──
  const handleRun = async () => {
    if (!imageFile || running) return;
    setRunning(true);

    const columnKeys = buildColumnKeys();

    // 只跑「没有结果」的列，已有 done/error 结果的跳过
    const targets = columnKeys.filter((k) => {
      const col = results[k];
      return !col || col.removeBg.state === "idle" || col.removeBg.state === "error";
    });

    // 所有列都已有结果 → 全部重置后重跑
    const allDone = columnKeys.every((k) => results[k]?.removeBg.state === "done");
    const actualTargets = allDone ? columnKeys : targets;
    if (allDone) {
      setResults({});
    }

    // 预先设置列的 label（确保 allDone 重置后列仍然可见）
    const initResults: Record<string, ColumnResult> = {};
    for (const key of actualTargets) {
      const model = key.startsWith("langsam") ? "langsam" : key;
      const cfg = MODELS.find((m) => m.key === model)!;
      let label = cfg.label;
      let sublabel = cfg.desc;
      if (key.startsWith("langsam:") && key !== "langsam:default") {
        const id = key.slice("langsam:".length);
        const s = cropSuggestions.find((x) => x.id === id);
        if (s) { label = `${s.emoji} ${s.title}`; sublabel = s.desc; }
      }
      initResults[key] = { label, sublabel, removeBg: { state: "idle" }, stylize: {} };
    }
    setResults((prev) => {
      if (allDone) return initResults;
      return { ...prev, ...initResults };
    });

    const stylesToRun = withStylize ? Array.from(selectedStyles) : [];

    // 串行跑，避免同一账号并发触发 Replicate 429 限流
    for (const key of actualTargets) {
      // 确定本列的 cropHint
      let cropHint = cropHintForLab;
      if (key.startsWith("langsam:") && key !== "langsam:default") {
        const id = key.slice("langsam:".length);
        const s = cropSuggestions.find((x) => x.id === id);
        if (s) cropHint = s.cropHint;
      }
      await runColumn(key, imageFile, withStylize, stylesToRun, cropHint);
    }
    setRunning(false);
  };

  // ── 渲染单列结果 ──
  const renderColumn = (key: string) => {
    const col = results[key];
    if (!col) return null;
    const stylesToShow = withStylize ? Array.from(selectedStyles) : [];

    return (
      <div key={key} className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* 列头 */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <span className="font-semibold text-gray-800">{col.label}</span>
          <span className="ml-2 text-xs text-gray-400">{col.sublabel}</span>
        </div>

        {/* 抠图结果 */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-600">抠图</span>
            <StatusBadge state={col.removeBg.state} />
            {col.removeBg.ms != null && (
              <span className="text-xs text-gray-400">{fmtMs(col.removeBg.ms)}</span>
            )}
          </div>
          <div className="rounded-lg overflow-hidden" style={{ background: "repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 16px 16px" }}>
            {col.removeBg.url ? (
              <img src={col.removeBg.url} alt="抠图结果" className="w-full object-contain max-h-72" />
            ) : col.removeBg.state === "error" ? (
              <div className="flex items-center justify-center h-32 text-xs text-red-500 px-3 text-center bg-red-50">
                {col.removeBg.error || "未知错误"}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-300 text-sm bg-gray-50">
                {col.removeBg.state === "loading" ? "⏳ 处理中…" : "等待运行"}
              </div>
            )}
          </div>
          {col.removeBg.prompt && (
            <details className="mt-2 group">
              <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700 select-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                text_prompt
              </summary>
              <pre className="mt-1.5 p-2 bg-gray-900 text-green-400 text-[11px] leading-relaxed rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{col.removeBg.prompt}</pre>
            </details>
          )}
        </div>

        {/* 风格化结果（仅勾选且有结果时展示）*/}
        {withStylize && stylesToShow.map((style) => {
          const sr = col.stylize[style];
          const styleCfg = STYLES.find((s) => s.key === style)!;
          return (
            <div key={style} className="px-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-600">
                  {styleCfg.emoji} {styleCfg.label}
                </span>
                <StatusBadge state={sr?.state ?? "idle"} />
                {sr?.ms != null && (
                  <span className="text-xs text-gray-400">{fmtMs(sr.ms)}</span>
                )}
              </div>
              <div className="rounded-lg overflow-hidden bg-white border border-gray-100">
                {sr?.url ? (
                  <img src={sr.url} alt={`${styleCfg.label}结果`} className="w-full object-contain max-h-72" />
                ) : sr?.state === "error" ? (
                  <div className="flex items-center justify-center h-32 text-xs text-red-500 px-3 text-center bg-red-50">
                    {sr.error || "未知错误"}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-gray-300 text-sm bg-gray-50">
                    {sr?.state === "loading" ? "🎨 生成中…" : "等待运行"}
                  </div>
                )}
              </div>
              {sr?.prompt && (
                <details className="mt-2 group">
                  <summary className="text-xs text-purple-500 cursor-pointer hover:text-purple-700 select-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    Seedream prompt
                  </summary>
                  <pre className="mt-1.5 p-2 bg-gray-900 text-purple-300 text-[11px] leading-relaxed rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{sr.prompt}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── 构建当前要展示的列键列表 ──
  const displayKeys = buildColumnKeys().filter((k) => results[k]);

  // ── 运行按钮文案 ──
  const runBtnLabel = (() => {
    if (running) return "⏳ 运行中…";
    const allKeys = buildColumnKeys();
    const allDone = allKeys.length > 0 && allKeys.every((k) => results[k]?.removeBg.state === "done");
    const pending = allKeys.filter((k) => !results[k] || results[k].removeBg.state === "idle" || results[k].removeBg.state === "error");
    if (allDone) return `🔄 重新全部跑 (${allKeys.length} 列)`;
    const skip = allKeys.length - pending.length;
    const extra = withStylize ? ` + ${selectedStyles.size} 个风格` : "";
    return `🚀 开始测试 (${pending.length} 列${skip > 0 ? `，跳过 ${skip} 个已有结果` : ""}${extra})`;
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">🧪</span>
        <h1 className="text-lg font-bold text-gray-800">Lab — 效果测试工具</h1>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">内部专用 · 不对外开放</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── 控制面板 ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">

          {/* 上传区 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">1. 上传测试图片</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {previewUrl ? (
                <div className="flex items-center gap-4 justify-center">
                  <img src={previewUrl} alt="预览" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700">{imageFile?.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {imageFile ? `${(imageFile.size / 1024).toFixed(0)} KB` : ""}
                    </p>
                    <p className="text-xs text-blue-500 mt-1">点击更换</p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">
                  <div className="text-3xl mb-2">📷</div>
                  <p className="text-sm">点击或拖拽上传图片</p>
                  <p className="text-xs mt-1">JPG / PNG，最大 10MB</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onInputChange}
            />
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2. 选择抠图模型（可多选）</label>
            <div className="flex gap-3 flex-wrap">
              {MODELS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => toggleModel(m.key)}
                  className={`flex-1 min-w-36 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    selectedModels.has(m.key)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-sm text-gray-800">{m.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 文本引导抠图方案（选中 LangSAM 时显示）*/}
          {selectedModels.has("langsam") && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  文本引导抠图方案（LangSAM）
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">可多选，每个方案独占一列对比</span>
                  {cropHintAnalyzing && (
                    <span className="ml-2 text-xs text-blue-500 animate-pulse">🤖 AI 分析图片中…</span>
                  )}
                </label>
                {imageFile && !cropHintAnalyzing && (
                  <button
                    onClick={() => analyzeForLangSAM(imageFile)}
                    className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    🔄 重新分析
                  </button>
                )}
              </div>

              {/* 方案卡片列表（多选） */}
              {cropHintAnalyzing ? (
                <div className="flex gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 h-20 rounded-xl border-2 border-gray-100 bg-gray-50 animate-pulse" />
                  ))}
                </div>
              ) : cropSuggestions.length > 0 ? (
                <div className="flex gap-3 flex-wrap">
                  {cropSuggestions.map((s) => {
                    const isSelected = selectedSuggestionIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSuggestion(s)}
                        className={`flex-1 min-w-40 text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-base">{s.emoji}</span>
                          <span className="font-semibold text-sm text-gray-800">{s.title}</span>
                          {isSelected && (
                            <span className="ml-auto text-blue-500 text-xs">✓</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  {imageFile ? "分析失败，使用默认 prompt" : "上传图片后自动分析"}
                </div>
              )}

              {/* 仅选中单个方案时显示可微调框；多选时每列使用各自方案的 cropHint */}
              {selectedSuggestionIds.size <= 1 && (
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-500 font-medium">text_prompt</span>
                    <span className="text-xs text-gray-400">（可手动微调）</span>
                  </div>
                  <input
                    type="text"
                    value={cropHintForLab}
                    onChange={(e) => setCropHintForLab(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
                    placeholder="e.g. the golden retriever sitting by the window with warm sunlight"
                  />
                </div>
              )}
              {selectedSuggestionIds.size > 1 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-400 mb-1">
                    已选 {selectedSuggestionIds.size} 个方案，每个方案独占一列对比 ↓
                  </div>
                  {cropSuggestions
                    .filter((s) => selectedSuggestionIds.has(s.id))
                    .map((s) => (
                      <div key={s.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span>{s.emoji}</span>
                          <span className="text-xs font-semibold text-gray-700">{s.title}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-blue-500 font-medium mr-1.5">text_prompt</span>
                          <span className="text-[10px] text-gray-600 break-all">{s.cropHint}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

            </div>
          )}

          {/* 风格化选项（多选） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">3. 风格化（可选，可多选）</label>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setWithStylize((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                  withStylize
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                <span>{withStylize ? "✅" : "⬜"}</span>
                抠图完成后继续风格化
              </button>

              {withStylize && (
                <div className="flex gap-2 flex-wrap">
                  {STYLES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => toggleStyle(s.key)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                        selectedStyles.has(s.key)
                          ? "border-purple-500 bg-purple-50 text-purple-700 font-medium"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  ))}
                  {selectedStyles.size > 1 && (
                    <span className="self-center text-xs text-gray-400 ml-1">
                      已选 {selectedStyles.size} 个风格，每列并发生成
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 运行按钮 */}
          <button
            onClick={handleRun}
            disabled={!imageFile || running || selectedModels.size === 0}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: running ? "#94a3b8" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
          >
            {runBtnLabel}
          </button>
        </div>

        {/* ── 结果对比区 ── */}
        {displayKeys.length > 0 && (
          <div className="flex gap-4 items-start overflow-x-auto pb-2">
            {displayKeys.map((k) => renderColumn(k))}
          </div>
        )}

        {/* 说明 */}
        <div className="text-xs text-gray-400 bg-white rounded-xl border border-gray-100 px-4 py-3 space-y-1">
          <p>💡 <strong>BiRefNet</strong>：论文级高精度抠图，适合毛发细节丰富的宠物图，但较慢且费用稍高</p>
          <p>⚠️ <strong>rembg</strong>：轻量快速，但本轮测试主体缺失严重（猫身体大面积丢失），不推荐线上使用</p>
          <p>💡 <strong>LangSAM</strong>：支持多方案多选，每个方案独占一列并排对比。text_prompt 整段描述引导，自动降级到 BiRefNet</p>
          <p>💡 风格化使用 Seedream 5.0（Volcano Ark），多选风格时并发生成，耗时约 20-40s，会消耗 ARK_API_KEY 额度</p>
          <p>⚠️ 此页面仅供内部测试，请勿分享地址</p>
        </div>
      </div>
    </div>
  );
}
