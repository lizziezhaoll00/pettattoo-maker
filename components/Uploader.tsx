"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/store/editorStore";
import { removeBg } from "@/lib/removeBg";
import LoadingCat from "./LoadingCat";

const TIPS = [
  { icon: "☀️", text: "光线充足，避免强背光" },
  { icon: "🎨", text: "背景简单纯色最佳" },
  { icon: "📸", text: "宠物正脸或侧脸，避免遮挡" },
  { icon: "🔍", text: "图片清晰，不要模糊" },
];

export default function Uploader() {
  const router = useRouter();
  const { setOriginalFile, setRemovedBgUrl, setIsRemoving, setRemoveError, reset } =
    useEditorStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      reset();
      setLoading(true);
      setError(null);
      setIsRemoving(true);

      const originalUrl = URL.createObjectURL(file);
      setOriginalFile(file, originalUrl);

      // 最多重试 3 次（应对模型冷启动 503）
      let lastError = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const bgRemovedUrl = await removeBg(file);
          setRemovedBgUrl(bgRemovedUrl);
          setIsRemoving(false);
          setLoading(false);
          router.push("/editor");
          return;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "处理失败，请重试";
          // 503 冷启动，等 20 秒后重试
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
      setLoading(false);
    },
    [reset, setOriginalFile, setRemovedBgUrl, setIsRemoving, setRemoveError, router]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0]);
      }
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: loading,
  });

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-6">
      {/* 上传区域 */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer
          transition-all duration-200 select-none
          ${isDragActive
            ? "border-amber-400 bg-amber-50 scale-[1.02]"
            : "border-gray-300 bg-gray-50 hover:border-amber-400 hover:bg-amber-50"
          }
          ${loading ? "opacity-60 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />

        {loading ? (
          <LoadingCat text="🐾 正在提取毛孩子的灵魂轮廓，稍等一下下" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl">🐾</div>
            <div>
              <p className="text-lg font-semibold text-gray-700">
                {isDragActive ? "放开，让主子跑进来~" : "点击或拖拽上传主子照片"}
              </p>
              <p className="text-sm text-gray-400 mt-1">支持 JPG、PNG、HEIC，最大 10MB</p>
            </div>
            <button
              type="button"
              className="mt-2 px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-white font-medium rounded-full transition-colors"
            >
              选择照片
            </button>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 text-center">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            关闭
          </button>
        </div>
      )}

      {/* 拍摄 Tips */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          📷 拍摄小贴士，效果更好
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TIPS.map((tip) => (
            <div key={tip.text} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-base">{tip.icon}</span>
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
