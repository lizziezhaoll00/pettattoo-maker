"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore, SIZE_CONFIG, SizeKey } from "@/store/editorStore";
import { renderFinalCanvas } from "@/lib/canvas";
import DownloadModal from "@/components/DownloadModal";

export default function EditorPage() {
  const router = useRouter();
  const {
    originalUrl,
    removedBgUrl,
    tattooSchemes,
    selectedSchemeId,
    schemeResults,
    colorMode,
    showWhiteBorder,
    selectedSize,
    setColorMode,
    setShowWhiteBorder,
    setSelectedSize,
  } = useEditorStore();

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 找到当前选中方案
  const selectedScheme = tattooSchemes.find((s) => s.id === selectedSchemeId) ?? null;
  const schemeResult = selectedSchemeId ? schemeResults[selectedSchemeId] : null;

  // 优先用方案生成图，否则用写实抠图
  const activeImageUrl =
    schemeResult?.state === "done" && schemeResult.url
      ? schemeResult.url
      : removedBgUrl;

  // 没有图片时跳回首页
  useEffect(() => {
    if (!originalUrl) router.replace("/");
  }, [originalUrl, router]);

  // 更新预览（白边/黑白走 Canvas，否则直接用图）
  useEffect(() => {
    if (!activeImageUrl) { setPreviewUrl(null); return; }
    const needsCanvas = showWhiteBorder || colorMode === "bw";
    if (!needsCanvas) { setPreviewUrl(activeImageUrl); return; }
    let cancelled = false;
    renderFinalCanvas({
      imageUrl: activeImageUrl,
      size: selectedSize,
      colorMode,
      showWhiteBorder,
      mirror: false,
      isRealistic: !selectedScheme,
    })
      .then((canvas) => { if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png")); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [activeImageUrl, selectedSize, colorMode, showWhiteBorder, selectedScheme]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => setShowResetConfirm(true)}
          className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1"
        >
          ← 返回方案
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {selectedScheme
            ? `${selectedScheme.styleEmoji} ${selectedScheme.title}`
            : "🐾 纹身贴编辑器"}
        </span>
        <button
          onClick={() => setShowDownloadModal(true)}
          disabled={!activeImageUrl}
          className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold rounded-full disabled:opacity-40 transition-colors"
        >
          下载
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">

        {/* 方案信息提示 */}
        {selectedScheme && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">{selectedScheme.styleEmoji}</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">{selectedScheme.title}</p>
              <p className="text-xs text-amber-600">{selectedScheme.poseDesc} · 推荐贴于 {selectedScheme.bodyPart}</p>
            </div>
            <button
              onClick={() => router.push("/schemes")}
              className="ml-auto text-xs text-amber-600 hover:text-amber-800 underline flex-shrink-0"
            >
              换方案
            </button>
          </div>
        )}

        {/* 精细调节 */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            精细调节
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {/* 白边描边 */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">白边描边</p>
                <p className="text-xs text-gray-400">外廓白边，方便裁剪 · 深色背景更明显</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWhiteBorder(!showWhiteBorder)}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${
                  showWhiteBorder ? "bg-amber-400" : "bg-gray-300"
                }`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                  showWhiteBorder ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* 黑白模式 */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">黑白模式</p>
                <p className="text-xs text-gray-400">高对比度黑白，适合单色纹身贴</p>
              </div>
              <button
                type="button"
                onClick={() => setColorMode(colorMode === "bw" ? "color" : "bw")}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none ${
                  colorMode === "bw" ? "bg-gray-600" : "bg-gray-300"
                }`}
              >
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                  colorMode === "bw" ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* 打印尺寸 */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                打印尺寸
                {selectedScheme && (
                  <span className="ml-2 text-xs text-amber-500 font-normal">
                    推荐 {selectedScheme.size}（{selectedScheme.bodyPart}）
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                {(Object.keys(SIZE_CONFIG) as SizeKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedSize(key)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                      selectedSize === key
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-gray-200 text-gray-600 hover:border-amber-300"
                    } ${selectedScheme?.size === key ? "ring-1 ring-amber-300" : ""}`}
                  >
                    <div className="font-bold">{key}</div>
                    <div>{SIZE_CONFIG[key].cm}cm</div>
                    <div className="text-gray-400 text-[10px]">{SIZE_CONFIG[key].desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 预览 */}
        {previewUrl && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              预览效果
            </h2>
            <div
              className="rounded-2xl border border-gray-100 p-4 flex items-center justify-center min-h-48"
              style={{
                backgroundImage:
                  "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                backgroundColor: "#f5f5f5",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="预览"
                className="max-h-96 max-w-full object-contain"
                style={{ imageRendering: "auto" }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              预览为正常方向，导出时自动镜像翻转 🔄
            </p>
          </section>
        )}

        {/* 下载按钮 */}
        <button
          onClick={() => setShowDownloadModal(true)}
          disabled={!activeImageUrl}
          className="w-full py-4 bg-amber-400 hover:bg-amber-500 text-white font-bold rounded-2xl text-base disabled:opacity-40 transition-colors shadow-md"
        >
          🐾 下载纹身贴素材
        </button>
      </div>

      {showDownloadModal && activeImageUrl && (
        <DownloadModal imageUrl={activeImageUrl} onClose={() => setShowDownloadModal(false)} />
      )}

      {/* 返回方案确认弹窗 */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowResetConfirm(false)}
        >
          <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔄</div>
              <h3 className="text-base font-bold text-gray-800">返回方案选择？</h3>
              <p className="text-xs text-gray-500 mt-1.5">当前调整不会丢失，随时可以再来</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                继续编辑
              </button>
              <button
                onClick={() => { setShowResetConfirm(false); router.push("/schemes"); }}
                className="flex-1 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold transition-colors"
              >
                返回方案
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
