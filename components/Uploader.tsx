"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useEditorStore, ALL_STYLE_KEYS, StyleKey } from "@/store/editorStore";
import { STYLE_CONFIGS } from "@/components/StyleGrid";

async function callRemoveBgSilent(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("model", "birefnet");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch("/api/remove-bg", { method: "POST", body: formData, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "网络错误";
    if (msg.toLowerCase().includes("abort")) throw new Error("抠图超时，请重试");
    throw new Error(`网络连接失败：${msg}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "抠图失败" }));
    throw new Error(err.error || "抠图失败");
  }
  return URL.createObjectURL(await res.blob());
}

interface UploaderProps {
  onUploaded: (file: File, previewUrl: string) => void;
  isGenerating?: boolean;
  /** 传 true 时隐藏 Uploader 内部的 Header 和标题（由外部接管） */
  hideHeader?: boolean;
}

interface UploaderCTAProps {
  onStartMagic: () => void;
  isGenerating?: boolean;
}

/** 吸底 CTA 栏 —— 必须在 animate-phase-in 等 transform 容器外渲染才能 fixed 到视口 */
export function UploaderCTA({ onStartMagic, isGenerating = false }: UploaderCTAProps) {
  const { originalUrl, selectedStyles } = useEditorStore();
  const canStart = !!originalUrl && selectedStyles.length > 0 && !isGenerating;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: "rgba(253,251,248,0.97)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", borderTop: "1px solid rgba(235,228,218,0.9)", boxShadow: "0 -4px 32px rgba(0,0,0,0.08), 0 -1px 0 rgba(255,255,255,0.6)", padding: "10px 0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      {/* 内容限宽 + 内边距，与主体对齐 */}
      <div className="cta-inner" style={{ width: "100%", maxWidth: 1440, margin: "0 auto", padding: "0 56px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <p className="cta-hint" style={{ margin: 0, fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <span style={{ opacity: 0.6 }}>🛡</span> 由 Gemini 驱动，照片加密保护仅用于本次生成。
      </p>
      <button
        onClick={canStart ? onStartMagic : undefined}
        disabled={!canStart}
        className="cta-btn"
        style={{ position: "relative", overflow: "hidden", background: isGenerating ? "#1A1818" : canStart ? "#1A1818" : "#C8BEB4", color: "#fff", padding: "13px 32px", borderRadius: 999, border: "none", fontSize: 15, fontWeight: 700, cursor: canStart ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 10, letterSpacing: "0.01em", boxShadow: (canStart || isGenerating) ? "0 8px 28px rgba(26,24,24,0.22)" : "none", transition: "all 0.2s", flexShrink: 0, opacity: isGenerating ? 0.9 : 1 }}
        onMouseEnter={e => { if (canStart) { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 32px rgba(26,24,24,0.3)"; } }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = (canStart || isGenerating) ? "0 8px 28px rgba(26,24,24,0.22)" : "none"; }}
      >
        {canStart && !isGenerating && (
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)", transform: "translateX(-150%)", animation: "shimmer 2.5s infinite" }} />
        )}
        <span style={{ position: "relative", zIndex: 1 }}>
          {isGenerating ? `AI 画师正在绘制 ${selectedStyles.length} 款手稿…` : !originalUrl ? "请先上传宝贝照片" : selectedStyles.length === 0 ? "请至少选择 1 种风格" : `开始施展魔法 ✨`}
        </span>
        <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
          {isGenerating
            ? <svg style={{ animation: "spin 1s linear infinite" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            : <span style={{ fontSize: 18 }}>🪄</span>
          }
        </span>
      </button>
      </div>
    </div>
  );
}

export default function Uploader({ onUploaded, isGenerating = false, hideHeader = false }: UploaderProps) {
  const [isDropzoneHovered, setIsDropzoneHovered] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { petName, setPetName, setOriginalFile, setRemovedBgUrl, setBgRemoveStatus, setBgRemoveError, originalUrl, selectedStyles, toggleStyle, reset, resetImageOnly } = useEditorStore();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const maxReached = selectedStyles.length >= 3;

  const showToast = useCallback(() => {
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500);
  }, []);

  const processFile = useCallback(async (file: File) => {
    resetImageOnly(); // 保留已选风格，仅重置图片状态
    const preview = URL.createObjectURL(file);
    setOriginalFile(file, preview);
    setBgRemoveStatus("pending");
    setBgRemoveError(null);
    onUploaded(file, preview);
    let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        setRemovedBgUrl(await callRemoveBgSilent(file));
        return;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : "抠图失败";
        if (attempt < 2) await new Promise(r => setTimeout(r, lastErr.includes("繁忙") ? 3000 : lastErr.includes("超时") ? 5000 : 2000));
      }
    }
    setBgRemoveStatus("error");
    setBgRemoveError(lastErr);
  }, [resetImageOnly, setOriginalFile, setRemovedBgUrl, setBgRemoveStatus, setBgRemoveError, onUploaded]);

  const onDrop = useCallback((files: File[]) => { if (files[0]) processFile(files[0]); }, [processFile]);
  const handleReplaceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) processFile(e.target.files[0]); e.target.value = ""; }, [processFile]);
  const handleClear = useCallback((e: React.MouseEvent) => { e.stopPropagation(); reset(); }, [reset]); // 清除按钟才全重置

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] },
    maxFiles: 1, maxSize: 10 * 1024 * 1024, noClick: !!originalUrl,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#FDFBF8", position: "relative" }}>

      {/* 页面内容，padding-bottom 留给固定底栏 */}
      <div style={{ position: "relative", zIndex: 1, paddingBottom: 88 }}>

        {/* ── 主标题（hideHeader 时不渲染） ── */}
        {!hideHeader && (
          <div style={{ textAlign: "center", padding: "28px 24px 36px", maxWidth: 1440, margin: "0 auto", boxSizing: "border-box" }}>
            <h1 className="font-serif-sc" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, color: "#1A1818", lineHeight: 1.2, marginBottom: 14, letterSpacing: "0.06em" }}>
              把对它的爱，化作身体的印记
            </h1>
            <p style={{ color: "#8A817C", fontSize: 15, margin: "0 auto", lineHeight: 1.75, maxWidth: 560 }}>
              上传一张清晰的照片，我们将结合 AI 魔法，为你生成独一无二的专属纹身手稿。
            </p>
          </div>
        )}

        {/* ── 主工作区：轻薄毛玻璃背板，收拢视线 ── */}
        <div className="uploader-wrap" style={{ maxWidth: 1440, margin: "0 auto", padding: "0 56px", boxSizing: "border-box" }}>
          {/* 背板 */}
          <div style={{ background: "rgba(255,255,255,0.40)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 28, border: "1px solid rgba(235,228,218,0.55)", boxShadow: "0 4px 40px rgba(0,0,0,0.04)", padding: "36px 40px 40px" }}>
          <div className="uploader-split" style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 48, alignItems: "start" }}>

            {/* ══ 左列 ══ */}
            <div className="uploader-left">

              {/* 名字输入 */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: "#1A1818", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  宝贝的名字是？
                  <span style={{ color: "#F29C6B" }}>♡</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text" value={petName}
                    onChange={e => setPetName(e.target.value.slice(0, 12))}
                    maxLength={12} placeholder="例如：小橘、旺财..."
                    style={{ width: "100%", background: "#fff", border: "1.5px solid #EBE4DA", borderRadius: 14, padding: "13px 42px 13px 16px", fontSize: 14, color: "#1A1818", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s", fontFamily: "inherit", boxSizing: "border-box", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#F29C6B"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(242,156,107,0.14), 0 0 20px rgba(242,156,107,0.18)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#EBE4DA"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
                  />
                  <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#C8BEB4", fontSize: 16 }}>✏</span>
                </div>
              </div>

              {/* 上传区 */}
              <input ref={replaceInputRef} type="file" accept="image/*,.heic" className="hidden" onChange={handleReplaceChange} />

              {originalUrl ? (
                <div className="group" style={{ borderRadius: 20, aspectRatio: "4/3", position: "relative", overflow: "hidden", cursor: "pointer", boxShadow: "0 4px 28px rgba(242,156,107,0.18)", border: "2px solid #F29C6B" }} onClick={() => replaceInputRef.current?.click()}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={originalUrl} alt="已上传的宠物照片" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s ease" }} className="group-hover:scale-[1.04]" />
                  <div className="group-hover:opacity-100" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.25s" }}>
                    <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      点击更换照片
                    </span>
                  </div>
                  <button onClick={handleClear} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, background: "rgba(0,0,0,0.5)", borderRadius: "50%", border: "none", cursor: "pointer", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(4px)" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.75)")} onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.5)")}>✕</button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  onMouseEnter={() => setIsDropzoneHovered(true)}
                  onMouseLeave={() => setIsDropzoneHovered(false)}
                  style={{ border: `2px dashed ${isDragActive ? "#F29C6B" : isDropzoneHovered ? "rgba(242,156,107,0.55)" : "#D6CEC4"}`, borderRadius: 20, aspectRatio: "4/3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isDragActive ? "rgba(242,156,107,0.04)" : isDropzoneHovered ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.60)", boxShadow: isDropzoneHovered ? "0 0 0 4px rgba(242,156,107,0.12), 0 8px 40px rgba(242,156,107,0.18)" : "0 2px 16px rgba(0,0,0,0.04)", transform: isDragActive || isDropzoneHovered ? "translateY(-2px)" : "none", transition: "all 0.25s", position: "relative", overflow: "hidden" }}
                >
                  <input {...getInputProps()} />
                  <div style={{ width: 56, height: 56, background: "#fff", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", border: "1px solid rgba(235,228,218,0.6)" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1A1818", textAlign: "center", marginBottom: 6 }}>{isDragActive ? "放开，让主子跑进来~" : "点击或拖拽上传照片"}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginBottom: 12 }}>支持 JPG, PNG / 最大 10MB</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B6560", background: "rgba(255,255,255,0.9)", padding: "5px 12px", borderRadius: 999, fontWeight: 500, border: "1px solid rgba(235,228,218,0.6)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <span style={{ color: "#F29C6B" }}>✦</span> 光线明亮、五官清晰的效果最佳
                  </div>
                </div>
              )}
            </div>

            {/* ══ 右列：风格选择 ══ */}
            <div className="uploader-right">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#1A1818", marginRight: 8 }}>选择艺术风格</span>
                  <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 400 }}>(可多选)</span>
                </div>
                <span style={{ fontSize: 13, color: maxReached ? "#D9480F" : "#6B6560", background: maxReached ? "rgba(255,100,30,0.07)" : "#fff", padding: "5px 14px", borderRadius: 10, border: `1px solid ${maxReached ? "rgba(217,72,15,0.35)" : "#EBE4DA"}`, fontWeight: 600, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "all 0.2s" }}>
                  已选 <span style={{ color: maxReached ? "#D9480F" : "#1A1818", fontWeight: 800 }}>{selectedStyles.length}</span>/3 种
                </span>
              </div>

              <div className="style-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {ALL_STYLE_KEYS.map((key: StyleKey) => {
                  const cfg = STYLE_CONFIGS[key];
                  if (!cfg) return null;
                  const isSelected = selectedStyles.includes(key);
                  const isDisabled = !isSelected && maxReached;
                  return (
                    <div
                      key={key}
                      onClick={() => { if (isDisabled) { showToast(); return; } toggleStyle(key); }}
                      style={{ borderRadius: 18, overflow: "hidden", cursor: isDisabled ? "not-allowed" : "pointer", opacity: isDisabled ? 0.38 : 1, background: "#fff", border: `2px solid ${isSelected ? "#F29C6B" : "transparent"}`, boxShadow: isSelected ? "0 0 0 3px rgba(242,156,107,0.18), 0 8px 28px rgba(0,0,0,0.09)" : "0 2px 12px rgba(0,0,0,0.07)", transform: isSelected ? "translateY(-3px)" : "none", transition: "all 0.22s ease" }}
                      onMouseEnter={e => {
                        if (!isDisabled && !isSelected) {
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.13)";
                          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                          const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                          if (img) img.style.transform = "scale(1.06)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
                          (e.currentTarget as HTMLDivElement).style.transform = "none";
                        }
                        const img = e.currentTarget.querySelector("img") as HTMLImageElement | null;
                        if (img) img.style.transform = "scale(1)";
                      }}
                    >
                      {/* 图片区 */}
                      <div style={{ aspectRatio: "4/3", overflow: "hidden", position: "relative" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cfg.previewImg} alt={cfg.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform 0.38s ease" }} loading="lazy" />
                        {/* 选中勾角标 */}
                        <div style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, background: "#F29C6B", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 8px rgba(242,156,107,0.45)", transition: "all 0.2s", opacity: isSelected ? 1 : 0, transform: isSelected ? "scale(1)" : "scale(0.4)" }}>✓</div>
                      </div>
                      {/* 文字区 */}
                      <div style={{ padding: "12px 14px 14px" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#1A1818", marginBottom: 3 }}>{cfg.label}</div>
                        <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cfg.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
          </div>{/* /背板 */}
        </div>
      </div>


      {/* Toast 提示 */}
      <div style={{
        position: "fixed", bottom: 88, left: "50%", transform: `translateX(-50%) translateY(${toastVisible ? 0 : 12}px)`,
        zIndex: 9000, pointerEvents: "none",
        background: "rgba(26,24,24,0.92)", color: "#fff",
        padding: "12px 22px", borderRadius: 999,
        fontSize: 14, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        opacity: toastVisible ? 1 : 0,
        transition: "opacity 0.25s ease, transform 0.25s ease",
        whiteSpace: "nowrap",
      }}>
        <span style={{ fontSize: 15, opacity: 0.8 }}>ⓘ</span>
        最多只能选择 3 种艺术风格哦
      </div>

      <style>{`
        @media (max-width: 1100px) { .style-grid-3col { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 880px) {
          .uploader-split { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 767px) {
          .uploader-wrap { padding: 0 12px !important; }
          .cta-inner { padding: 0 12px !important; gap: 10px !important; }
          .cta-hint { display: none !important; }
          .cta-btn { flex: 1 !important; justify-content: center !important; padding: 13px 16px !important; font-size: 14px !important; }
          .uploader-split { gap: 20px !important; }
          .style-grid-3col { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
        }
      `}</style>
    </div>
  );
}
