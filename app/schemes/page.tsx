"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/store/editorStore";
import type { TattooScheme } from "@/app/api/analyze-crop/route";

// ─── 把 blob URL 的抠图转成灰底 data URL，传给 Seedream ────────────────────
function toGrayBgDataUrl(blobUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
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
    img.src = blobUrl;
  });
}

// ─── 单个方案卡片 ─────────────────────────────────────────────────────────
function SchemeCard({
  scheme,
  removedBgUrl,
  onGenerated,
  onSelect,
  autoTrigger,
}: {
  scheme: TattooScheme;
  removedBgUrl: string | null;
  onGenerated: (id: string, url: string) => void;
  onSelect: (scheme: TattooScheme) => void;
  autoTrigger: boolean; // 前 3 个自动触发，后 3 个点击才触发
}) {
  const { schemeResults, setSchemeResult } = useEditorStore();
  const result = schemeResults[scheme.id];
  const triggerRef = useRef(false);

  // 触发生成
  const generate = useCallback(async () => {
    if (triggerRef.current) return;
    if (!removedBgUrl) return;
    triggerRef.current = true;
    setSchemeResult(scheme.id, { state: "generating" });
    try {
      const imageUrl = await toGrayBgDataUrl(removedBgUrl);
      const res = await fetch("/api/generate-tattoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, tattooPrompt: scheme.tattooPrompt, schemeId: scheme.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSchemeResult(scheme.id, { state: "done", url: json.url });
      onGenerated(scheme.id, json.url);
    } catch (e) {
      triggerRef.current = false; // 允许重试
      setSchemeResult(scheme.id, {
        state: "error",
        error: e instanceof Error ? e.message : "生成失败",
      });
    }
  }, [removedBgUrl, scheme, setSchemeResult, onGenerated]);

  // 自动触发（前 3 个）
  useEffect(() => {
    if (autoTrigger && removedBgUrl && !result) {
      generate();
    }
  }, [autoTrigger, removedBgUrl, result, generate]);

  const state = result?.state ?? "idle";
  const url = result?.url;
  const error = result?.error;

  return (
    <div
      className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden flex flex-col cursor-pointer hover:border-amber-300 hover:shadow-md transition-all duration-200 group"
      onClick={() => {
        if (state === "idle" || state === "error") {
          generate();
        } else if (state === "done" && url) {
          onSelect(scheme);
        }
      }}
    >
      {/* 图片区 */}
      <div
        className="aspect-square relative flex items-center justify-center overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
          backgroundColor: "#f5f5f5",
        }}
      >
        {state === "done" && url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={scheme.title} className="w-full h-full object-contain" />
            {/* hover 遮罩 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                选这个 →
              </span>
            </div>
          </>
        ) : state === "generating" ? (
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl animate-spin">✨</span>
            <span className="text-xs text-amber-500 font-medium">AI 生成中…</span>
          </div>
        ) : state === "error" ? (
          <div className="flex flex-col items-center gap-2 px-3">
            <span className="text-2xl">😿</span>
            <span className="text-xs text-red-400 text-center leading-tight">{error?.slice(0, 40)}</span>
            <span className="text-[10px] text-red-400 underline">点击重试</span>
          </div>
        ) : (
          /* idle：未生成，显示方案信息 + 点击提示 */
          <div className="flex flex-col items-center gap-2 px-3">
            <span className="text-3xl">{scheme.styleEmoji}</span>
            <span className="text-xs text-gray-500 text-center leading-tight">{scheme.poseDesc}</span>
            <span className="text-[10px] text-amber-500 font-medium">点击生成</span>
          </div>
        )}
      </div>

      {/* 信息区 */}
      <div className="p-3 flex flex-col gap-0.5 border-t border-gray-50">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{scheme.styleEmoji}</span>
          <span className="text-xs font-bold text-gray-800">{scheme.title}</span>
          <span className="ml-auto text-[10px] font-semibold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">
            {scheme.size}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 leading-tight">{scheme.poseDesc}</p>
        <p className="text-[10px] text-gray-400">{scheme.bodyPart}</p>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────
export default function SchemesPage() {
  const router = useRouter();
  const {
    originalUrl,
    removedBgUrl,
    isRemoving,
    tattooSchemes,
    setSelectedSchemeId,
    setSchemeResult,
  } = useEditorStore();

  // 没有图片数据时跳回首页
  useEffect(() => {
    if (!originalUrl && !isRemoving) {
      router.replace("/");
    }
  }, [originalUrl, isRemoving, router]);

  const handleGenerated = useCallback(
    (id: string, url: string) => {
      setSchemeResult(id, { state: "done", url });
    },
    [setSchemeResult]
  );

  const handleSelectScheme = useCallback(
    (scheme: TattooScheme) => {
      setSelectedSchemeId(scheme.id);
      router.push("/editor");
    },
    [setSelectedSchemeId, router]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => router.push("/")}
          className="text-gray-500 hover:text-gray-800 text-sm flex items-center gap-1"
        >
          ← 重新上传
        </button>
        <span className="text-sm font-semibold text-gray-700">🐾 选择你的纹身方案</span>
        <div className="w-16" /> {/* 占位 */}
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-6">

        {/* ── 原图 & 抠图对比 ── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            📸 原图 & 抠图对比
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {/* 原图 */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-gray-500 font-medium text-center">原图</p>
              <div className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square flex items-center justify-center">
                {originalUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={originalUrl} alt="原图" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-300 text-sm">加载中…</span>
                )}
              </div>
            </div>

            {/* 抠图 */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-gray-500 font-medium text-center">抠图结果</p>
              <div
                className="rounded-2xl overflow-hidden border border-gray-100 aspect-square flex items-center justify-center"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
                  backgroundColor: "#f5f5f5",
                }}
              >
                {isRemoving ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xl animate-bounce">⏳</span>
                    <span className="text-xs text-amber-500">抠图中…</span>
                  </div>
                ) : removedBgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={removedBgUrl} alt="抠图" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-gray-300 text-xs">等待中</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── 6 种方案卡片 ── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            🎨 6 种纹身方案
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            前 3 种自动生成 · 后 3 种点击生成 · 点击结果选择
          </p>

          {tattooSchemes.length === 0 ? (
            /* 方案还在分析中 */
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 animate-pulse overflow-hidden">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="h-3 bg-gray-200 rounded w-14" />
                    <div className="h-2.5 bg-gray-200 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {tattooSchemes.map((scheme, idx) => (
                <SchemeCard
                  key={scheme.id}
                  scheme={scheme}
                  removedBgUrl={removedBgUrl}
                  onGenerated={handleGenerated}
                  onSelect={handleSelectScheme}
                  autoTrigger={idx < 3} // 前 3 个抠图完成后自动生成
                />
              ))}
            </div>
          )}
        </section>

        {/* 提示 */}
        <p className="text-xs text-gray-400 text-center pb-4">
          选中方案后可进入编辑器调整白边、黑白、尺寸并下载 🎉
        </p>
      </div>
    </div>
  );
}
