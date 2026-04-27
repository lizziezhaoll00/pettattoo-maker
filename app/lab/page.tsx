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
type ArtStyle = "lineart" | "watercolor" | "cartoon";

type StepState = "idle" | "loading" | "done" | "error";

interface ColumnResult {
  removeBg: { state: StepState; url?: string; ms?: number; error?: string };
  stylize: { state: StepState; url?: string; ms?: number; error?: string };
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MODELS: { key: RembgModel; label: string; desc: string }[] = [
  { key: "birefnet",     label: "BiRefNet",      desc: "A100 · ~12s · $0.002" },
  { key: "rembg",        label: "rembg",         desc: "T4   · ~1s  · $0.00045" },
  { key: "removebg",    label: "remove.bg",     desc: "商业 · ~2s  · 50次/月免费" },
  { key: "langsam",     label: "LangSAM",       desc: "文本引导 · ~5-15s · $0.002" },
];

const STYLES: { key: ArtStyle; emoji: string; label: string }[] = [
  { key: "lineart",   emoji: "✏️", label: "线稿" },
  { key: "watercolor",emoji: "🎨", label: "水彩" },
  { key: "cartoon",   emoji: "🐾", label: "卡通" },
];

const EMPTY_RESULT = (): ColumnResult => ({
  removeBg: { state: "idle" },
  stylize:  { state: "idle" },
});

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtMs(ms?: number) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function StatusBadge({ state }: { state: StepState }) {
  const map: Record<StepState, { text: string; cls: string }> = {
    idle:    { text: "等待",   cls: "bg-gray-100 text-gray-500" },
    loading: { text: "处理中…", cls: "bg-yellow-100 text-yellow-700 animate-pulse" },
    done:    { text: "完成",   cls: "bg-green-100 text-green-700" },
    error:   { text: "失败",   cls: "bg-red-100 text-red-600" },
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
  const [selectedStyle, setSelectedStyle] = useState<ArtStyle>("lineart");

  // LangSAM 方案状态
  const [cropSuggestions, setCropSuggestions] = useState<CropSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [cropHintForLab, setCropHintForLab] = useState<string>("the pet and its accessories on a cozy indoor background");
  const [cropHintAnalyzing, setCropHintAnalyzing] = useState(false);
  const [results, setResults] = useState<Record<RembgModel, ColumnResult>>({
    birefnet:    EMPTY_RESULT(),
    rembg:       EMPTY_RESULT(),
    removebg:    EMPTY_RESULT(),
    langsam:     EMPTY_RESULT(),
  });
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
    setSelectedSuggestionId(null);
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
        setSelectedSuggestionId(suggestions[0].id);
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
    setResults({ birefnet: EMPTY_RESULT(), rembg: EMPTY_RESULT(), removebg: EMPTY_RESULT(), langsam: EMPTY_RESULT() });
    // 切换图片时清空旧的方案
    setCropSuggestions([]);
    setSelectedSuggestionId(null);
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
        // 刚勾选 LangSAM 且已有图片：自动劆析填充 prompt
        analyzeForLangSAM(imageFile);
      }
      return next;
    });
  };

  // ── 单列处理逻辑 ──
  const runColumn = useCallback(
    async (model: RembgModel, file: File, doStylize: boolean, style: ArtStyle, _hint?: string) => {
      // 1. 抠图
      setResults((prev) => ({
        ...prev,
        [model]: { removeBg: { state: "loading" }, stylize: { state: "idle" } },
      }));

      let removeBgUrl: string | undefined;
      const t0 = Date.now();
      try {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("model", model);
        // LangSAM 需要传 cropHint 作为分割提示词
        if (model === "langsam") fd.append("cropHint", cropHintForLab);
        console.log(`[Lab] 🚀 model=${model} | cropHint=${model === "langsam" ? cropHintForLab : "(不适用)"}`);
        const res = await fetch("/api/remove-bg", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          let msg = text;
          try { msg = JSON.parse(text)?.error ?? text; } catch { /* ignore */ }
          throw new Error(msg);
        }
        const blob = await res.blob();
        removeBgUrl = URL.createObjectURL(blob);
        const ms = Date.now() - t0;
        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            removeBg: { state: "done", url: removeBgUrl, ms },
          },
        }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            removeBg: { state: "error", error: (err as Error).message, ms: Date.now() - t0 },
          },
        }));
        return; // 抠图失败就不继续风格化
      }

      if (!doStylize || !removeBgUrl) return;

      // 2. 风格化
      setResults((prev) => ({
        ...prev,
        [model]: { ...prev[model], stylize: { state: "loading" } },
      }));

      const t1 = Date.now();
      try {
        // 把 blob URL 转成带灰底的 base64 data URL 传给后端
        // ⚠️ 不能直接编码透明 PNG：Seedream 图生图对大面积透明图片会报 400
        // 必须先在 Canvas 铺 #e8e8e8 灰底再合并抠图，与 lib/stylize.ts toDataUrl() 保持一致
        const dataUrl = await new Promise<string>((resolve, reject) => {
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
          img.src = removeBgUrl;
        });

        const res = await fetch("/api/seedream-stylize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: dataUrl, style }),
        });
        if (!res.ok) throw new Error(await res.text());
        const { url, error } = await res.json();
        if (error) throw new Error(error);
        const ms = Date.now() - t1;
        setResults((prev) => ({
          ...prev,
          [model]: { ...prev[model], stylize: { state: "done", url, ms } },
        }));
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [model]: {
            ...prev[model],
            stylize: { state: "error", error: (err as Error).message, ms: Date.now() - t1 },
          },
        }));
      }
    },
    [cropHintForLab]
  );

  // ── 开始测试 ──
  const handleRun = async () => {
    if (!imageFile || running) return;
    setRunning(true);
    // 重置结果
    setResults({ birefnet: EMPTY_RESULT(), rembg: EMPTY_RESULT(), removebg: EMPTY_RESULT(), langsam: EMPTY_RESULT() });

    // 串行跑，避免同一账号并发触发 Replicate 429 限流
    const targets = Array.from(selectedModels);
    for (const m of targets) {
      await runColumn(m, imageFile, withStylize, selectedStyle);
    }
    setRunning(false);
  };

  // ── 渲染单列结果 ──
  const renderColumn = (model: RembgModel) => {
    const cfg = MODELS.find((m) => m.key === model)!;
    const col = results[model];
    const active = selectedModels.has(model);
    if (!active) return null;

    return (
      <div key={model} className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* 列头 */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <span className="font-semibold text-gray-800">{cfg.label}</span>
            <span className="ml-2 text-xs text-gray-400">{cfg.desc}</span>
          </div>
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
        </div>

        {/* 风格化结果（仅勾选时展示） */}
        {withStylize && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-600">
                风格化 · {STYLES.find((s) => s.key === selectedStyle)?.label}
              </span>
              <StatusBadge state={col.stylize.state} />
              {col.stylize.ms != null && (
                <span className="text-xs text-gray-400">{fmtMs(col.stylize.ms)}</span>
              )}
            </div>
            <div className="rounded-lg overflow-hidden bg-white border border-gray-100">
              {col.stylize.url ? (
                <img src={col.stylize.url} alt="风格化结果" className="w-full object-contain max-h-72" />
              ) : col.stylize.state === "error" ? (
                <div className="flex items-center justify-center h-32 text-xs text-red-500 px-3 text-center bg-red-50">
                  {col.stylize.error || "未知错误"}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-300 text-sm bg-gray-50">
                  {col.stylize.state === "loading" ? "🎨 生成中…" : "等待运行"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">🧪</span>
        <h1 className="text-lg font-bold text-gray-800">Lab — 效果测试工具</h1>
        <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">内部专用 · 不对外开放</span>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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

          {/* 文本引导抠图方案（选中 LangSAM 或 Grounded SAM 时显示）*/}
          {(selectedModels.has("langsam")) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  文本引导抠图方案（LangSAM）
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

              {/* 方案卡片列表 */}
              {cropHintAnalyzing ? (
                <div className="flex gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex-1 h-20 rounded-xl border-2 border-gray-100 bg-gray-50 animate-pulse" />
                  ))}
                </div>
              ) : cropSuggestions.length > 0 ? (
                <div className="flex gap-3 flex-wrap">
                  {cropSuggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSuggestionId(s.id);
                        setCropHintForLab(s.cropHint);
                      }}
                      className={`flex-1 min-w-40 text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                        selectedSuggestionId === s.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-base">{s.emoji}</span>
                        <span className="font-semibold text-sm text-gray-800">{s.title}</span>
                        {selectedSuggestionId === s.id && (
                          <span className="ml-auto text-blue-500 text-xs">✓ 已选</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  {imageFile ? "分析失败，使用默认 prompt" : "上传图片后自动分析"}
                </div>
              )}

              {/* 当前 cropHint 预览（可微调）*/}
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
            </div>
          )}

          {/* 风格化选项 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">3. 风格化（可选）</label>
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
                <div className="flex gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSelectedStyle(s.key)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                        selectedStyle === s.key
                          ? "border-purple-500 bg-purple-50 text-purple-700 font-medium"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  ))}
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
            {running ? "⏳ 运行中…" : `🚀 开始测试 (${selectedModels.size} 个模型${withStylize ? " + 风格化" : ""})`}
          </button>
        </div>

        {/* ── 结果对比区 ── */}
        <div className="flex gap-4 items-start">
          {MODELS.map((m) => renderColumn(m.key))}
        </div>

        {/* 说明 */}
        <div className="text-xs text-gray-400 bg-white rounded-xl border border-gray-100 px-4 py-3 space-y-1">
          <p>💡 <strong>BiRefNet</strong>：论文级高精度抠图，适合毛发细节丰富的宠物图，但较慢且费用稍高</p>
          <p>⚠️ <strong>rembg</strong>：轻量快速，但本轮测试主体缺失严重（猫身体大面积丢失），不推荐线上使用</p>
          <p>💡 <strong>LangSAM</strong>：text_prompt 整段描述引导，单主体效果好，多主体局部场景不稳定（mask 全黑），自动降级到 BiRefNet</p>
          <p>💡 风格化使用 Seedream 5.0（Volcano Ark），耗时约 20-40s，会消耗 ARK_API_KEY 额度</p>
          <p>⚠️ 此页面仅供内部测试，请勿分享地址</p>
        </div>
      </div>
    </div>
  );
}
