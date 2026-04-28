"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore, SIZE_CONFIG, SizeKey, ArtStyle, CropRect } from "@/store/editorStore";
import { renderFinalCanvas } from "@/lib/canvas";
import DownloadModal from "@/components/DownloadModal";
import CropEditor from "@/components/CropEditor";
import LoadingCat from "@/components/LoadingCat";
import { stylize } from "@/lib/stylize";

type StyleKey = "realistic" | ArtStyle;

const STYLE_CONFIGS: {
  key: StyleKey;
  label: string;
  emoji: string;
  desc: string;
  previewImg?: string;
}[] = [
  { key: "realistic",  label: "写实风", emoji: "📸", desc: "忠实还原主子颜值" },
  { key: "lineart",    label: "线稿风", emoji: "✏️", desc: "排线细节，复古蚀刻感",
    previewImg: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&q=80&sat=-100&con=50" },
  { key: "watercolor", label: "水彩风", emoji: "🎨", desc: "通透柔和，小红书款",
    previewImg: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=300&q=80" },
  { key: "cartoon",    label: "漫画风", emoji: "🐱", desc: "萌感十足，卡通主子",
    previewImg: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=300&q=80" },
];

export default function EditorPage() {
  const router = useRouter();
  const {
    originalUrl, removedBgUrl, isRemoving,
    selectedBase, selectedArtStyle, stylizedUrls, isStylizing, stylizeErrors,
    colorMode, showWhiteBorder, squareCrop, cropRect, selectedSize, selectedStylizeHint,
    setSelectedBase, setSelectedArtStyle, setColorMode, setShowWhiteBorder, setCropRect, setSelectedSize,
    setStylizedUrl, setIsStylizing, setStylizeError,
  } = useEditorStore();

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  /** canvas 渲染结果（仅当 needsCanvas=true 时有值） */
  const [canvasPreviewUrl, setCanvasPreviewUrl] = useState<string | null>(null);
  const [hoveredStyle, setHoveredStyle] = useState<StyleKey | null>(null);
  const [stylizeToast, setStylizeToast] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCropEditor, setShowCropEditor] = useState(false);

  useEffect(() => {
    if (!originalUrl && !isRemoving) router.replace("/");
  }, [originalUrl, isRemoving, router]);

  const activeImageUrl =
    selectedBase === "realistic"
      ? removedBgUrl
      : stylizedUrls[selectedArtStyle] || null;

  // 用于裁切编辑器预览的源图（不含白边/滤镜）
  const cropSourceUrl = activeImageUrl;

  // needsCanvas 为 false 时直接用源 URL，否则通过 effect 异步渲染
  const needsCanvas = useMemo(
    () => !!(activeImageUrl && (showWhiteBorder || squareCrop || cropRect !== null || colorMode === "bw")),
    [activeImageUrl, showWhiteBorder, squareCrop, cropRect, colorMode]
  );

  // needsCanvas=true 时异步渲染 canvas
  useEffect(() => {
    if (!activeImageUrl || !needsCanvas) return;
    let cancelled = false;
    renderFinalCanvas({ imageUrl: activeImageUrl, size: selectedSize, colorMode, showWhiteBorder, squareCrop, cropRect: cropRect ?? null, mirror: false, isRealistic: selectedBase === "realistic" })
      .then((canvas) => { if (!cancelled) setCanvasPreviewUrl(canvas.toDataURL("image/png")); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [activeImageUrl, needsCanvas, selectedSize, colorMode, showWhiteBorder, squareCrop, cropRect, selectedBase]);

  // needsCanvas=false 时清空 canvas 缓存（独立 effect 避免同步 setState in effect 的 lint 错误）
  useEffect(() => {
    if (!needsCanvas) setCanvasPreviewUrl(null);
  }, [needsCanvas]);

  // 最终预览 URL：needsCanvas=true 用 canvas 结果，否则直接用源 URL
  const previewUrl = needsCanvas ? canvasPreviewUrl : activeImageUrl;

  const handleSelectStyle = async (key: StyleKey) => {
    if (key === "realistic") { setSelectedBase("realistic"); return; }
    setSelectedBase("art");
    setSelectedArtStyle(key as ArtStyle);
    if (stylizedUrls[key as ArtStyle] || isStylizing[key as ArtStyle] || !removedBgUrl) return;
    setIsStylizing(key as ArtStyle, true);
    setStylizeError(key as ArtStyle, null);
    setStylizeToast("✨ AI 正在为你家主子生成专属风格，约需 15-30 秒…");
    try {
      const url = await stylize(removedBgUrl, key as ArtStyle, selectedStylizeHint, originalUrl ?? undefined);
      setStylizedUrl(key as ArtStyle, url);
      setStylizeToast(null);
    } catch (e) {
      setStylizeError(key as ArtStyle, e instanceof Error ? e.message : "风格化失败");
      setStylizeToast(null);
    } finally {
      setIsStylizing(key as ArtStyle, false);
    }
  };

  const activeKey: StyleKey = selectedBase === "realistic" ? "realistic" : selectedArtStyle;

  const getCardUrl = (key: StyleKey): string | null => {
    if (key === "realistic") return removedBgUrl;
    return stylizedUrls[key as ArtStyle] || null;
  };

  if (!originalUrl && isRemoving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <LoadingCat text="🐾 正在勾勒毛孩子的灵魂轮廓，稍等一下下" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => setShowResetConfirm(true)} className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1">
          ← 重新上传
        </button>
        <span className="text-sm font-semibold text-gray-700">🐾 纹身贴编辑器</span>
        <button
          onClick={() => setShowDownloadModal(true)}
          disabled={!activeImageUrl}
          className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold rounded-full disabled:opacity-40 transition-colors"
        >
          下载
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Step 1: 选择风格 */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Step 1 · 选择风格</h2>
          <div className="grid grid-cols-4 gap-2">
            {STYLE_CONFIGS.map((s) => {
              const isActive = activeKey === s.key;
              const cardUrl = getCardUrl(s.key);
              const loading = s.key !== "realistic" && isStylizing[s.key as ArtStyle];
              const error = s.key !== "realistic" && stylizeErrors[s.key as ArtStyle];
              const isHovered = hoveredStyle === s.key;
              const showSampleOverlay = isHovered && !!s.previewImg && !cardUrl && !loading;

              return (
                <button
                  key={s.key}
                  onClick={() => handleSelectStyle(s.key)}
                  onMouseEnter={() => setHoveredStyle(s.key)}
                  onMouseLeave={() => setHoveredStyle(null)}
                  onTouchStart={() => setHoveredStyle(s.key)}
                  onTouchEnd={() => setHoveredStyle(null)}
                  className={`relative rounded-2xl border-2 overflow-hidden aspect-square transition-all ${isActive ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200 hover:border-amber-300"}`}
                >
                  {cardUrl ? (
                    <img src={cardUrl} alt={s.label} className="w-full h-full object-cover bg-white" style={s.key === "realistic" ? { filter: "brightness(1.1) saturate(1.15)" } : undefined} />
                  ) : loading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 gap-1 px-1">
                      <span className="text-base animate-spin">✨</span>
                      <span className="text-[9px] text-amber-500 font-medium text-center leading-tight">AI 生成中</span>
                    </div>
                  ) : error ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 gap-1 px-1">
                      <span className="text-[9px] text-red-400 text-center leading-tight">失败</span>
                      <span className="text-[8px] text-red-300 underline">点击重试</span>
                    </div>
                  ) : s.key === "realistic" && isRemoving ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <span className="text-lg animate-bounce">⏳</span>
                    </div>
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-1 px-1.5 ${isActive ? "bg-amber-50" : "bg-white"}`}>
                      <span className="text-2xl">{s.emoji}</span>
                      <span className={`text-[11px] font-semibold leading-tight text-center ${isActive ? "text-amber-700" : "text-gray-700"}`}>{s.label}</span>
                      <span className="text-[9px] text-gray-400 leading-tight text-center">{s.desc}</span>
                    </div>
                  )}

                  {s.previewImg && (
                    <div className={`absolute inset-0 transition-opacity duration-200 ${showSampleOverlay ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                      <img src={s.previewImg} alt={`${s.label}示例`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent py-1.5 px-1">
                        <span className="text-white text-[9px] font-semibold">效果示例</span>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-white/85 backdrop-blur-sm py-1 text-center">
                    <span className={`text-[10px] font-semibold ${isActive ? "text-amber-600" : "text-gray-600"}`}>{s.label}</span>
                  </div>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-white text-[10px] shadow z-10">✓</div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2: 精细调节 */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Step 2 · 精细调节</h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">白边描边</p>
                <p className="text-xs text-gray-400">外廓白边，方便裁剪 · 深色背景更明显</p>
              </div>
              <button type="button" onClick={() => setShowWhiteBorder(!showWhiteBorder)}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${showWhiteBorder ? "bg-amber-400" : "bg-gray-300"}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${showWhiteBorder ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">裁切范围</p>
                <p className="text-xs text-gray-400">
                  {cropRect ? `已设置（自定义范围）` : "自由拖拽调整构图"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cropRect && (
                  <button
                    type="button"
                    onClick={() => setCropRect(null)}
                    className="text-xs text-gray-400 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-50"
                  >
                    清除
                  </button>
                )}
                <button
                  type="button"
                  disabled={!activeImageUrl}
                  onClick={() => setShowCropEditor(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                    cropRect
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:border-amber-300 disabled:opacity-40"
                  }`}
                >
                  ✂️ {cropRect ? "重新裁切" : "设置裁切"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">黑白模式</p>
                <p className="text-xs text-gray-400">高对比度黑白，适合单色纹身贴</p>
              </div>
              <button type="button" onClick={() => setColorMode(colorMode === "bw" ? "color" : "bw")}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${colorMode === "bw" ? "bg-gray-600" : "bg-gray-300"}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${colorMode === "bw" ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-700 mb-2">打印尺寸</p>
              <div className="flex gap-2">
                {(Object.keys(SIZE_CONFIG) as SizeKey[]).map((key) => (
                  <button key={key} onClick={() => setSelectedSize(key)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${selectedSize === key ? "border-amber-400 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600 hover:border-amber-300"}`}>
                    <div className="font-bold">{key}</div>
                    <div>{SIZE_CONFIG[key].cm}cm</div>
                    <div className="text-gray-400 text-[10px]">{SIZE_CONFIG[key].desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {previewUrl != null && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">预览效果</h2>
            <div className="rounded-2xl border border-gray-100 p-4 flex items-center justify-center min-h-48"
              style={{ backgroundImage: "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0", backgroundColor: "#f5f5f5" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="预览" className="max-h-96 max-w-full object-contain"
                style={{ imageRendering: "auto", filter: (selectedBase === "realistic" && colorMode !== "bw") ? "brightness(1.1) saturate(1.15)" : undefined }} />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">预览为正常方向，导出时自动镜像翻转 🔄</p>
          </section>
        )}

        <button onClick={() => setShowDownloadModal(true)} disabled={!activeImageUrl}
          className="w-full py-4 bg-amber-400 hover:bg-amber-500 text-white font-bold rounded-2xl text-base disabled:opacity-40 transition-colors shadow-md">
          🐾 下载纹身贴素材
        </button>
      </div>

      {showDownloadModal && activeImageUrl && (
        <DownloadModal
          imageUrl={activeImageUrl}
          originalUrl={removedBgUrl ?? undefined}
          onClose={() => setShowDownloadModal(false)}
        />
      )}

      {showCropEditor && cropSourceUrl && (
        <CropEditor
          imageUrl={cropSourceUrl}
          initialRect={cropRect ?? undefined}
          onConfirm={(rect: CropRect) => {
            setCropRect(rect);
            setShowCropEditor(false);
          }}
          onCancel={() => setShowCropEditor(false)}
        />
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowResetConfirm(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔄</div>
              <h3 className="text-base font-bold text-gray-800">重新上传？</h3>
              <p className="text-xs text-gray-500 mt-1.5">当前所有生成结果将会清除，确定要重新开始吗？</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">再想想</button>
              <button onClick={() => { setShowResetConfirm(false); router.push("/"); }} className="flex-1 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold transition-colors">确认重新上传</button>
            </div>
          </div>
        </div>
      )}

      {stylizeToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-gray-800/90 backdrop-blur-sm text-white text-xs rounded-full shadow-lg whitespace-nowrap animate-pulse">
          {stylizeToast}
        </div>
      )}
    </div>
  );
}
