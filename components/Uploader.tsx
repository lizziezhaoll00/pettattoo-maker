"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/store/editorStore";
import type { TattooScheme } from "@/app/api/analyze-crop/route";
import { getDefaultSchemes } from "@/app/api/analyze-crop/route";

const TIPS = [
  { icon: "☀️", text: "光线充足，避免强背光" },
  { icon: "🎨", text: "背景简单纯色最佳" },
  { icon: "📸", text: "宠物正脸或侧脸，避免遮挡" },
  { icon: "🔍", text: "图片清晰，不要模糊" },
];

/** 压缩图片到 1024px 用于 AI 分析（省 token，不影响分析质量） */
function compressForAnalysis(file: File, maxSize = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("压缩失败"));
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Uploader() {
  const router = useRouter();
  const {
    setOriginalFile,
    setRemovedBgUrl,
    setIsRemoving,
    setRemoveError,
    setTattooSchemes,
    setIsAnalyzing,
    setAnalyzeError,
    reset,
  } = useEditorStore();

  const [phase, setPhase] = useState<"idle" | "processing">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // 两路任务独立状态
  const [bgState, setBgState] = useState<"running" | "done" | "error">("running");
  const [bgError, setBgError] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<"running" | "done">("running");
  const [schemes, setSchemes] = useState<TattooScheme[]>([]);

  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      reset();
      setError(null);
      setBgState("running");
      setBgError(null);
      setAnalysisState("running");
      setSchemes([]);
      setUploadedFile(file);

      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);
      setOriginalFile(file, preview);
      setPhase("processing");
      setIsRemoving(true);
      setIsAnalyzing(true);

      // ── 任务 A：BiRefNet 全身抠图 ──────────────────────────────────────────
      const taskRemoveBg = async () => {
        let lastError = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const fd = new FormData();
            fd.append("image", file);
            // 不传 cropHint，BiRefNet 默认全身抠图
            const res = await fetch("/api/remove-bg", { method: "POST", body: fd });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "抠图失败" }));
              throw new Error(err.error || "抠图失败");
            }
            const blob = await res.blob();
            setRemovedBgUrl(URL.createObjectURL(blob));
            setIsRemoving(false);
            setBgState("done");
            return;
          } catch (e) {
            lastError = e instanceof Error ? e.message : "处理失败";
            if (lastError.includes("启动中") && attempt < 3) {
              await new Promise((r) => setTimeout(r, 20000));
              continue;
            }
            break;
          }
        }
        setRemoveError(lastError);
        setIsRemoving(false);
        setBgState("error");
        setBgError(lastError);
      };

      // ── 任务 B：doubao 分析 6 种方案 ──────────────────────────────────────
      const taskAnalysis = async () => {
        try {
          const dataUrl = await compressForAnalysis(file, 1024);
          const res = await fetch("/api/analyze-crop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl: dataUrl }),
          });
          const json = await res.json();
          const fetched: TattooScheme[] = json.schemes ?? [];
          const final = fetched.length >= 3 ? fetched : getDefaultSchemes();
          setSchemes(final);
          setTattooSchemes(final);
          setIsAnalyzing(false);
          setAnalysisState("done");
        } catch (e) {
          console.error("[analyze]", e);
          const fallback = getDefaultSchemes();
          setSchemes(fallback);
          setTattooSchemes(fallback);
          setAnalyzeError("分析遇到问题，已使用通用方案");
          setIsAnalyzing(false);
          setAnalysisState("done");
        }
      };

      // 并行启动，两路都完成后跳转
      Promise.all([taskRemoveBg(), taskAnalysis()]).then(() => {
        router.push("/schemes");
      });
    },
    [reset, setOriginalFile, setIsRemoving, setRemoveError, setRemovedBgUrl,
     setTattooSchemes, setIsAnalyzing, setAnalyzeError, router]
  );

  const handleReset = useCallback(() => {
    setPhase("idle");
    setPreviewUrl(null);
    setUploadedFile(null);
    setBgState("running");
    setBgError(null);
    setAnalysisState("running");
    setSchemes([]);
    setError(null);
    reset();
  }, [reset]);

  const onDrop = useCallback(
    (files: File[]) => { if (files.length > 0) processFile(files[0]); },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: phase !== "idle",
  });

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-6">

      {/* ── idle：上传区 ── */}
      {phase === "idle" && (
        <>
          <div
            {...getRootProps()}
            className={`
              relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer
              transition-all duration-200 select-none
              ${isDragActive
                ? "border-amber-400 bg-amber-50 scale-[1.02]"
                : "border-gray-300 bg-gray-50 hover:border-amber-400 hover:bg-amber-50"}
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              <div className="text-6xl">🐾</div>
              <div>
                <p className="text-lg font-semibold text-gray-700">
                  {isDragActive ? "放开，让主子跑进来~" : "点击或拖拽上传主子照片"}
                </p>
                <p className="text-sm text-gray-400 mt-1">支持 JPG、PNG、HEIC，最大 10MB</p>
              </div>
              <button type="button" className="mt-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-medium rounded-full transition-colors">
                选择照片
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📷 拍摄小贴士，效果更好</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPS.map((tip) => (
                <div key={tip.text} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-base">{tip.icon}</span>
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── processing：并行进度 ── */}
      {phase === "processing" && (
        <div className="flex flex-col gap-5">

          {/* 原图预览 */}
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square max-h-56 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="uploaded" className="max-w-full max-h-full object-contain" />
              <button
                type="button"
                onClick={handleReset}
                className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm transition-colors"
              >
                重新上传
              </button>
            </div>
          )}

          {/* 双任务进度卡 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🚀 双线并行处理中</p>

            {/* 抠图进度 */}
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                bgState === "done" ? "bg-green-100" : bgState === "error" ? "bg-red-100" : "bg-amber-50"
              }`}>
                {bgState === "done" ? "✅" : bgState === "error" ? "❌" : (
                  <span className="animate-spin inline-block text-base">⏳</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">AI 抠图</p>
                <p className="text-xs text-gray-400 truncate">
                  {bgState === "done" ? "抠图完成！" : bgState === "error"
                    ? (bgError?.slice(0, 40) ?? "抠图失败")
                    : "BiRefNet 精准识别宠物轮廓…"}
                </p>
              </div>
            </div>

            {/* 分析进度 */}
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                analysisState === "done" ? "bg-green-100" : "bg-amber-50"
              }`}>
                {analysisState === "done" ? "✅" : (
                  <span className="animate-spin inline-block text-base">🤖</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">AI 方案分析</p>
                <p className="text-xs text-gray-400">
                  {analysisState === "done"
                    ? `已生成 ${schemes.length} 种纹身方案`
                    : "正在为主子量身定制 6 种方案…"}
                </p>
              </div>
            </div>
          </div>

          {/* 方案骨架 / 方案预览 */}
          {analysisState !== "done" ? (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-2">方案预览（生成中…）</p>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 animate-pulse overflow-hidden">
                    <div className="aspect-square bg-gray-200" />
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <div className="h-3 bg-gray-200 rounded w-14" />
                      <div className="h-2.5 bg-gray-200 rounded w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-2">已生成 {schemes.length} 种方案，抠图完成后自动进入…</p>
              <div className="grid grid-cols-3 gap-3">
                {schemes.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{s.styleEmoji}</span>
                      <span className="text-xs font-semibold text-gray-700 truncate">{s.title}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">{s.poseDesc}</p>
                    <p className="text-[10px] text-amber-600 font-medium">{s.size} · {s.bodyPart}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 抠图失败时显示重试 */}
          {bgState === "error" && bgError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center">
              抠图失败：{bgError}
              <button
                type="button"
                onClick={() => uploadedFile && processFile(uploadedFile)}
                className="ml-2 underline font-medium"
              >
                重试
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
