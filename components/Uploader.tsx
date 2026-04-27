"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/store/editorStore";
import type { CropSuggestion } from "@/app/api/analyze-crop/route";
import LoadingCat from "./LoadingCat";

const TIPS = [
  { icon: "☀️", text: "光线充足，避免强背光" },
  { icon: "🎨", text: "背景简单纯色最佳" },
  { icon: "📸", text: "宠物正脸或侧脸，避免遮挡" },
  { icon: "🔍", text: "图片清晰，不要模糊" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressForAnalysis(file: File, maxSize = 1024): Promise<Blob> {
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
        (blob) => (blob ? resolve(blob) : reject(new Error("压缩失败"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function callRemoveBg(file: File, cropHint: string): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  if (cropHint) {
    formData.append("cropHint", cropHint);
    formData.append("model", "langsam");
  }
  const res = await fetch("/api/remove-bg", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "抠图失败" }));
    throw new Error(err.error || "抠图失败");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-200 rounded w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CropCard({
  suggestion,
  selected,
  onClick,
}: {
  suggestion: CropSuggestion;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left
        transition-all duration-150 cursor-pointer
        ${selected
          ? "border-amber-400 bg-amber-50 shadow-sm"
          : "border-gray-100 bg-white hover:border-amber-300 hover:bg-amber-50/50"
        }
      `}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${selected ? "bg-amber-100" : "bg-gray-100"}`}>
        🐾
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${selected ? "text-amber-700" : "text-gray-700"}`}>{suggestion.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{suggestion.desc}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150 ${selected ? "border-amber-400 bg-amber-400" : "border-gray-300"}`}>
        {selected && (
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function Uploader() {
  const router = useRouter();
  const {
    setOriginalFile, setRemovedBgUrl, setIsRemoving, setRemoveError,
    setCropSuggestions, setIsAnalyzing, setAnalyzeError, setSelectedCropId, reset,
  } = useEditorStore();

  const [phase, setPhase] = useState<"idle" | "analyzing" | "selecting" | "removing">("idle");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CropSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    reset();
    setError(null);
    setUploadedFile(file);
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setOriginalFile(file, preview);
    setPhase("analyzing");
    setIsAnalyzing(true);

    try {
      const smallBlob = await compressForAnalysis(file, 1024);
      const smallFile = new File([smallBlob], "preview.jpg", { type: "image/jpeg" });
      const dataUrl = await fileToDataUrl(smallFile);
      const res = await fetch("/api/analyze-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const json = await res.json();
      const fetchedSuggestions: CropSuggestion[] = json.suggestions ?? [];
      setSuggestions(fetchedSuggestions);
      setCropSuggestions(fetchedSuggestions);
      if (fetchedSuggestions.length > 0) {
        setSelectedId(fetchedSuggestions[0].id);
        setSelectedCropId(fetchedSuggestions[0].id);
      }
      setIsAnalyzing(false);
      setPhase("selecting");
    } catch (e) {
      console.error("[analyze-crop]", e);
      const fallback: CropSuggestion[] = [
        { id: "full_body", title: "完整全身", desc: "保留四肢尾巴，构图完整自然", cropHint: "Precise silhouette of the entire pet body including all four legs and tail, clean fur edges, transparent background" },
        { id: "face_close", title: "大脸特写", desc: "只保留头部，表情丰富更萌", cropHint: "Precise silhouette of the pet's face and head, detailed ear and whisker edges, portrait crop, transparent background" },
        { id: "half_body", title: "半身坐姿", desc: "上半身+前爪，简洁可爱", cropHint: "Precise silhouette of the pet's upper body and front paws, clean fur texture edges, sitting pose, transparent background" },
      ];
      setSuggestions(fallback);
      setCropSuggestions(fallback);
      setSelectedId("full_body");
      setSelectedCropId("full_body");
      setAnalyzeError("照片分析遇到问题，已给出通用方案供选择");
      setIsAnalyzing(false);
      setPhase("selecting");
    }
  }, [reset, setOriginalFile, setIsAnalyzing, setAnalyzeError, setCropSuggestions, setSelectedCropId]);

  const handleConfirm = useCallback(async () => {
    if (!uploadedFile || !selectedId) return;
    const chosen = suggestions.find((s) => s.id === selectedId);
    const cropHint = chosen?.cropHint ?? "";
    setPhase("removing");
    setIsRemoving(true);
    setError(null);
    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const bgRemovedUrl = await callRemoveBg(uploadedFile, cropHint);
        setRemovedBgUrl(bgRemovedUrl);
        setSelectedCropId(selectedId);
        setIsRemoving(false);
        router.push("/editor");
        return;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "处理失败，请重试";
        if (lastError.includes("启动中") && attempt < 3) {
          setError(`AI 模型启动中，${attempt}/3 次重试，请稍候...`);
          await new Promise((r) => setTimeout(r, 20000));
          continue;
        }
        break;
      }
    }
    setError(lastError);
    setRemoveError(lastError);
    setIsRemoving(false);
    setPhase("selecting");
  }, [uploadedFile, selectedId, suggestions, setIsRemoving, setRemovedBgUrl, setRemoveError, setSelectedCropId, router]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setUploadedFile(null);
    setPreviewUrl(null);
    setSuggestions([]);
    setSelectedId(null);
    setError(null);
    reset();
  }, [reset]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) processFile(acceptedFiles[0]);
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: phase !== "idle",
  });

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-6">

      {phase === "idle" && (
        <>
          <div
            {...getRootProps()}
            className={`relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-200 select-none ${isDragActive ? "border-amber-400 bg-amber-50 scale-[1.02]" : "border-gray-300 bg-gray-50 hover:border-amber-400 hover:bg-amber-50"}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              <div className="text-6xl">🐾</div>
              <div>
                <p className="text-lg font-semibold text-gray-700">{isDragActive ? "放开，让主子跑进来~" : "点击或拖拽上传主子照片"}</p>
                <p className="text-sm text-gray-400 mt-1">支持 JPG、PNG、HEIC，最大 10MB</p>
              </div>
              <button type="button" className="mt-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-medium rounded-full transition-colors">选择照片</button>
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

      {phase === "analyzing" && (
        <div className="flex flex-col gap-4">
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square max-h-52 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="uploaded" className="max-w-full max-h-full object-contain" />
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 mb-3">🐾 正在帮主子挑选最佳出道造型...</p>
            <SkeletonCards />
          </div>
        </div>
      )}

      {phase === "selecting" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {previewUrl && (
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-700">{uploadedFile?.name?.slice(0, 30) ?? "照片"}</p>
              <button type="button" onClick={handleReset} className="text-xs text-amber-500 hover:text-amber-600 mt-0.5 underline">重新上传</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🎯 推荐以下抠图方案，选一个吧</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <CropCard
                  key={s.id}
                  suggestion={s}
                  selected={selectedId === s.id}
                  onClick={() => { setSelectedId(s.id); setSelectedCropId(s.id); }}
                />
              ))}
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center">{error}</div>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId}
            className="w-full py-3 bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-2xl transition-colors text-base"
          >
            就这个，开始制作 →
          </button>
        </div>
      )}

      {phase === "removing" && (
        <div className="flex flex-col gap-4">
          {previewUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square max-h-52 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="uploaded" className="max-w-full max-h-full object-contain" />
            </div>
          )}
          {selectedId && suggestions.length > 0 && (() => {
            const chosen = suggestions.find((s) => s.id === selectedId);
            return chosen ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2 text-sm text-amber-700">
                <span>正在按「{chosen.title}」方案勾勒毛孩子的灵魂轮廓…</span>
              </div>
            ) : null;
          })()}
          {error && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-700 text-center leading-relaxed">⏳ {error}</div>
          )}
          <LoadingCat text="🐾 正在勾勒毛孩子的灵魂轮廓，稍等一下下" />
        </div>
      )}
    </div>
  );
}
