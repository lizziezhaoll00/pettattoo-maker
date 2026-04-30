"use client";

import { useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useEditorStore } from "@/store/editorStore";

// 宠物拼贴示意图（桌面端展示，原型同款）
const COLLAGE_IMGS = [
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=160&h=160&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=180&h=180&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=150&h=150&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=164&h=164&fit=crop&auto=format",
];

const COLLAGE_STYLES = [
  { width: 80,  height: 80,  transform: "rotate(-5deg) translateY(6px)" },
  { width: 90,  height: 90,  transform: "rotate(2deg)" },
  { width: 75,  height: 75,  transform: "rotate(-3deg) translateY(4px)" },
  { width: 82,  height: 82,  transform: "rotate(4deg) translateY(2px)" },
];

/** 后台静默调用抠图接口（BiRefNet），不阻塞前端流程 */
async function callRemoveBgSilent(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("model", "birefnet");

  // 120s 超时（BiRefNet cold start 约 60-90s）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch("/api/remove-bg", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "网络错误";
    if (msg.toLowerCase().includes("abort")) {
      throw new Error("抠图超时，请重试");
    }
    throw new Error(`网络连接失败：${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "抠图失败" }));
    throw new Error(err.error || "抠图失败");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

interface UploaderProps {
  onUploaded: (file: File, previewUrl: string) => void;
}

export default function Uploader({ onUploaded }: UploaderProps) {
  const {
    petName, setPetName,
    setOriginalFile, setRemovedBgUrl, setBgRemoveStatus, setBgRemoveError,
    originalUrl,
    reset,
  } = useEditorStore();

  const replaceInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      reset();
      const preview = URL.createObjectURL(file);
      setOriginalFile(file, preview);
      setBgRemoveStatus("pending");
      setBgRemoveError(null);
      onUploaded(file, preview);

      let lastErr = "";
      // 最多重试 2 次：服务端已对 OOM 自动降级，网络抖动才需要重试
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const bgRemovedUrl = await callRemoveBgSilent(file);
          setRemovedBgUrl(bgRemovedUrl);
          return;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "抠图失败";
          console.warn(`[remove-bg] 第 ${attempt} 次失败：`, lastErr);
          if (attempt < 2) {
            // 繁忙/OOM 类错误：稍等 3s 再试（服务端会自动 fallback 到轻量模型）
            // 超时类：等 5s
            // 网络错误：等 2s
            const waitMs = lastErr.includes("繁忙") ? 3000
              : lastErr.includes("超时") ? 5000
              : 2000;
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          break;
        }
      }
      setBgRemoveStatus("error");
      setBgRemoveError(lastErr);
    },
    [reset, setOriginalFile, setRemovedBgUrl, setBgRemoveStatus, setBgRemoveError, onUploaded]
  );

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) processFile(acceptedFiles[0]);
  }, [processFile]);

  const handleReplaceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    reset();
  }, [reset]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    noClick: !!originalUrl,
  });

  return (
    /* ── 整体 Hero 容器：垂直居中，占满主内容区 ── */
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "calc(100vh - 60px)", padding: "0 0 20px",
      position: "relative", overflow: "hidden",
    }}>
      {/* 大背景爪印 */}
      <span style={{
        position: "absolute", bottom: -20, left: -30,
        fontSize: 240, opacity: 0.05, pointerEvents: "none",
        userSelect: "none", lineHeight: 1, zIndex: 0,
        transform: "rotate(-10deg)",
      }}>🐾</span>
      {/* 右上角散落小爪印 */}
      <span style={{ position: "absolute", top: 28, right: 28, fontSize: 28, opacity: 0.15, transform: "rotate(15deg)", pointerEvents: "none", filter: "sepia(1) brightness(0.5)" }}>🐾</span>
      <span style={{ position: "absolute", top: 72, right: 72, fontSize: 18, opacity: 0.15, transform: "rotate(-8deg)", pointerEvents: "none", filter: "sepia(1) brightness(0.5)" }}>🐾</span>
      <span style={{ position: "absolute", bottom: 60, right: 20, fontSize: 22, opacity: 0.15, transform: "rotate(20deg)", pointerEvents: "none", filter: "sepia(1) brightness(0.5)" }}>🐾</span>

      {/* ── 双栏 Hero ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 52,
        maxWidth: 860, width: "100%", padding: "0 24px",
        position: "relative", zIndex: 1,
        // 手机端改为纵向
        flexDirection: "row",
      }}>
        {/* ── 左列：拼贴图 + 大标题 + 名字输入 ── */}
        <div style={{ flex: "0 0 360px", position: "relative" }}
          className="upload-hero-left"
        >
          {/* 宠物照片拼贴（桌面端，手机隐藏） */}
          <div className="hidden md:flex" style={{ gap: 10, marginBottom: 28, alignItems: "flex-end" }}>
            {COLLAGE_IMGS.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                style={{
                  borderRadius: 14, objectFit: "cover", display: "block",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.13)",
                  background: "#e8e0d8",
                  width: COLLAGE_STYLES[i].width,
                  height: COLLAGE_STYLES[i].height,
                  transform: COLLAGE_STYLES[i].transform,
                }}
              />
            ))}
          </div>

          {/* 大标题 */}
          <h1 style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 900, color: "#1a1a1a",
            lineHeight: 1.2, marginBottom: 28,
            letterSpacing: -1,
          }}>
            把对它的爱，<br />变成永恒的专属印记
          </h1>

          {/* 名字输入 */}
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
              🐾 宝贝叫什么名字？
            </div>
            <input
              type="text"
              value={petName}
              onChange={(e) => setPetName(e.target.value.slice(0, 12))}
              maxLength={12}
              placeholder="我想为我的 [在此输入名字]"
              style={{
                width: "100%",
                border: "1.5px solid #d6cfc6",
                borderRadius: 10, padding: "11px 14px",
                fontSize: 14, fontFamily: "inherit",
                color: "#1a1a1a",
                background: "rgba(255,255,255,0.7)",
                outline: "none", transition: "border-color 0.2s, box-shadow 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "#c4a96a";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(196,169,106,0.15)";
                e.currentTarget.style.background = "#fff";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "#d6cfc6";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.background = "rgba(255,255,255,0.7)";
              }}
            />
            <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 10 }}>
              定制一份永久符号
            </div>
          </div>
        </div>

        {/* ── 右列：上传区 ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {originalUrl ? (
            /* 已上传：填满预览 */
            <div
              style={{
                border: "2px solid #f59e0b",
                borderRadius: 24, aspectRatio: "4/3",
                position: "relative", overflow: "hidden", cursor: "pointer",
                boxShadow: "0 4px 28px rgba(245,158,11,0.18)",
                background: "#fff",
              }}
              onClick={() => replaceInputRef.current?.click()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl} alt="已上传的宠物照片"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
              {/* 底部渐变提示 */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.5), transparent)",
                color: "#fff", fontSize: 12, padding: "24px 12px 12px", textAlign: "center",
              }}>
                点击可重新上传
              </div>
              {/* ✕ 删除按钮 */}
              <button
                onClick={handleClear}
                style={{
                  position: "absolute", top: 10, right: 10,
                  width: 30, height: 30, background: "rgba(0,0,0,0.5)",
                  borderRadius: "50%", border: "none", cursor: "pointer",
                  color: "#fff", fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  zIndex: 10, backdropFilter: "blur(4px)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.75)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}
              >
                ✕
              </button>
              <input
                ref={replaceInputRef} type="file"
                accept="image/*,.heic" className="hidden"
                onChange={handleReplaceChange}
              />
            </div>
          ) : (
            /* 未上传：虚线上传框 */
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? "#f59e0b" : "#d8cfc4"}`,
                borderRadius: 24, aspectRatio: "4/3",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                background: isDragActive ? "#fffbf4" : "rgba(255,255,255,0.85)",
                boxShadow: isDragActive ? "0 4px 28px rgba(245,158,11,0.15)" : "0 2px 20px rgba(0,0,0,0.06)",
                transform: isDragActive ? "translateY(-2px)" : "none",
                transition: "all 0.25s",
                position: "relative", overflow: "hidden",
              }}
            >
              <input {...getInputProps()} />
              <div style={{ fontSize: 40, marginBottom: 14, lineHeight: 1, opacity: 0.7 }}>🐾</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", textAlign: "center", lineHeight: 1.45, marginBottom: 8, letterSpacing: -0.2 }}>
                {isDragActive ? "放开，让主子跑进来~" : "「点击或拖拽」\n上传它的清晰照片"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
                支持 JPG / PNG / HEIC，最大 10MB
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 响应式：手机端变纵向 ── */}
      <style>{`
        @media (max-width: 767px) {
          .upload-hero-left { flex: none !important; width: 100% !important; }
          .upload-hero-left + div { width: 100% !important; flex: none !important; }
        }
      `}</style>
    </div>
  );
}
