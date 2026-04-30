"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useEditorStore,
  SIZE_CONFIG,
  SizeKey,
  BODY_PART_CONFIG,
  StyleKey,
} from "@/store/editorStore";
import { STYLE_CONFIGS } from "@/components/StyleGrid";
import { stylize } from "@/lib/stylize";
import DownloadModal from "@/components/DownloadModal";

const ALL_SIZES: SizeKey[] = ["S", "M", "L"];

export default function ResultPage() {
  const router = useRouter();
  const {
    petName,
    originalUrl,
    removedBgUrl,
    selectedStyles,
    generationResults,
    currentStyleKey,
    setCurrentStyleKey,
    selectedBodyParts,
    selectedSize,
    setSelectedSize,
    setGenResult,
    generatedText,
    reset,
  } = useEditorStore();

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [retryingKey, setRetryingKey] = useState<StyleKey | null>(null);
  const [isMirror, setIsMirror] = useState(true);

  const activeKey = currentStyleKey ?? selectedStyles.find(k => generationResults[k].status === "done") ?? null;
  const activeResult = activeKey ? generationResults[activeKey] : null;
  const activeImageUrl = activeResult?.status === "done" ? activeResult.url : null;

  // 无数据时跳回首页
  useEffect(() => {
    if (selectedStyles.length === 0) router.replace("/");
  }, [selectedStyles, router]);

  // 预选推荐尺寸
  useEffect(() => {
    if (selectedBodyParts.length > 0) {
      setSelectedSize(BODY_PART_CONFIG[selectedBodyParts[0]].recommendedSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 重试
  const handleRetry = useCallback(async (key: StyleKey) => {
    if (!removedBgUrl) return;
    setRetryingKey(key);
    setGenResult(key, { status: "pending" });
    try {
      const url = await stylize(removedBgUrl, key, originalUrl ?? undefined, petName || undefined);
      setGenResult(key, { status: "done", url });
      setCurrentStyleKey(key);
    } catch (e) {
      setGenResult(key, { status: "error", error: e instanceof Error ? e.message : "生成失败" });
    } finally {
      setRetryingKey(null);
    }
  }, [removedBgUrl, originalUrl, petName, setGenResult, setCurrentStyleKey]);

  const handleReset = useCallback(() => {
    reset();
    router.push("/");
  }, [reset, router]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(253,251,248,0.97)",
      backdropFilter: "blur(8px)",
      overflowY: "auto",
      display: "flex", flexDirection: "column",
    }} className="no-scroll-modal">

      {/* ── 背景流动光晕（与上传页同款） ── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div className="animate-blob" style={{
          position: "absolute", top: "-10%", left: "-10%",
          width: "50vw", height: "50vw",
          background: "rgba(242,156,107,0.08)",
          borderRadius: "50%", filter: "blur(100px)",
        }} />
        <div className="animate-blob-delay-2" style={{
          position: "absolute", bottom: "-10%", right: "-5%",
          width: "40vw", height: "40vw",
          background: "rgba(232,195,150,0.12)",
          borderRadius: "50%", filter: "blur(100px)",
        }} />
        <div className="animate-blob-delay-4" style={{
          position: "absolute", top: "40%", left: "30%",
          width: "30vw", height: "30vw",
          background: "rgba(251,207,232,0.08)",
          borderRadius: "50%", filter: "blur(80px)",
        }} />
      </div>

      <style>{`
        .no-scroll-modal::-webkit-scrollbar { display: none; }
        .no-scroll-modal { -ms-overflow-style: none; scrollbar-width: none; }
        .result-image-grid-1 { max-width: 400px; margin: 0 auto; }
        .result-image-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 680px; margin: 0 auto; }
        .result-image-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        @media (max-width: 600px) {
          .result-image-grid-2 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .result-image-grid-3 { grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        }
        .size-radio:checked + .size-label { border-color: #F29C6B; background: rgba(242,156,107,0.06); color: #b45309; }
        .toggle-track { width: 44px; height: 24px; background: #d1d5db; border-radius: 999px; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
        .toggle-track.on { background: #68D391; }
        .toggle-thumb { width: 20px; height: 20px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        .toggle-track.on .toggle-thumb { transform: translateX(20px); }
      `}</style>

      {/* ── 关闭按钮 ── */}
      <button
        onClick={() => setShowResetConfirm(true)}
        style={{
          position: "fixed", top: 16, right: 16, zIndex: 100,
          width: 40, height: 40,
          background: "rgba(0,0,0,0.06)", backdropFilter: "blur(8px)",
          border: "none", borderRadius: "50%", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color: "#1A1818",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.12)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
      >
        ✕
      </button>

      {/* ── 主内容卡片 ── */}
      <div style={{
        width: "100%", maxWidth: 960,
        margin: "0 auto",
        background: "#fff",
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
      }}>

        {/* 图像展示区（浅灰底） */}
        <div style={{
          background: "#FAFAFA",
          padding: "56px 32px 32px",
          borderBottom: "1px solid rgba(235,228,218,0.5)",
          position: "relative",
        }}>
          {/* 微弱径向渐变光晕 */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at center, rgba(242,156,107,0.08) 0%, transparent 70%)",
          }} />

          <div className={
            selectedStyles.length === 1 ? "result-image-grid-1"
            : selectedStyles.length === 2 ? "result-image-grid-2"
            : "result-image-grid-3"
          } style={{ position: "relative", zIndex: 1 }}>
            {selectedStyles.map((key) => {
              const result = generationResults[key];
              const isActive = key === activeKey;
              const isRetrying = retryingKey === key;
              return (
                <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  {/* 图片卡片 */}
                  <div
                    onClick={() => {
                      if (result.status === "error" && !isRetrying) handleRetry(key);
                      else if (result.status === "done") setCurrentStyleKey(key);
                    }}
                    onMouseEnter={e => {
                      if (result.status === "done" && !isActive) {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.12)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
                      }
                    }}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      background: "#fff",
                      borderRadius: 18,
                      overflow: "hidden",
                      cursor: result.status === "done" || result.status === "error" ? "pointer" : "default",
                      border: `2px solid ${isActive ? "#F29C6B" : "transparent"}`,
                      boxShadow: isActive
                        ? "0 0 0 4px rgba(242,156,107,0.15), 0 4px 20px rgba(0,0,0,0.08)"
                        : "0 2px 12px rgba(0,0,0,0.06)",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      position: "relative",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    {result.status === "done" && result.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.url}
                        alt={STYLE_CONFIGS[key].label}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : result.status === "error" ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 8px" }}>
                        <span style={{ fontSize: 28 }}>❌</span>
                        <span style={{ fontSize: 11, color: "#ef4444", textAlign: "center" }}>生成失败，点击重试</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }} className="animate-pulse-slow">
                        <span style={{ fontSize: 28 }}>⏳</span>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{STYLE_CONFIGS[key].label}</span>
                      </div>
                    )}
                    {/* 选中勾标 */}
                    {isActive && result.status === "done" && (
                      <div style={{
                        position: "absolute", top: 8, right: 8,
                        width: 24, height: 24, background: "#F29C6B",
                        borderRadius: "50%", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                        boxShadow: "0 2px 8px rgba(242,156,107,0.4)",
                      }}>✓</div>
                    )}
                    {/* 重试中 spinner */}
                    {isRetrying && (
                      <div style={{
                        position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)",
                        borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg style={{ animation: "spin 1s linear infinite" }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F29C6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* 风格名标签 */}
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: "#1A1818",
                    background: "rgba(255,255,255,0.85)",
                    padding: "5px 14px", borderRadius: 999,
                    border: "1px solid rgba(235,228,218,0.6)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    backdropFilter: "blur(4px)",
                  }}>
                    {STYLE_CONFIGS[key].label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 语录卡片（有文案时显示） ── */}
        {generatedText && (
          <div style={{
            padding: "28px 32px",
            borderBottom: "1px solid rgba(235,228,218,0.5)",
            background: "#fff",
            display: "flex", justifyContent: "center",
          }}>
            <div style={{
              maxWidth: 680, width: "100%",
              background: "#FAFAFA",
              borderRadius: 18, padding: "32px 40px 28px",
              position: "relative",
              border: "1px solid rgba(235,228,218,0.4)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            }}>
              {/* 装饰引号 SVG（参照 lucide Quote 图标风格） */}
              <svg
                width="36" height="36" viewBox="0 0 24 24"
                fill="none" stroke="rgba(242,156,107,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", top: 16, left: 18, pointerEvents: "none" }}
              >
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
              </svg>
              <p className="font-serif-sc" style={{
                fontSize: 16, lineHeight: 1.95,
                color: "rgba(26,24,24,0.82)",
                fontStyle: "italic",
                textAlign: "center",
                margin: 0,
                padding: "0 20px",
                letterSpacing: "0.04em",
                position: "relative", zIndex: 1,
              }}>
                {generatedText}
              </p>
            </div>
          </div>
        )}

        {/* ── 图纸打印设置 ── */}
        <div style={{ padding: "28px 32px 48px", background: "#fff", flex: 1 }}>

          {/* 标题 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <span style={{ fontSize: 18 }}>⚙</span>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: "#1A1818", margin: 0 }}>图纸打印设置</h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

            {/* 左：物理尺寸选择 */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 }}>物理尺寸选择</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {ALL_SIZES.map(key => (
                  <label key={key} style={{ cursor: "pointer" }}>
                    <input
                      type="radio" name="tattooSize" value={key}
                      checked={selectedSize === key}
                      onChange={() => setSelectedSize(key)}
                      style={{ display: "none" }}
                    />
                    <div style={{
                      border: `2px solid ${selectedSize === key ? "#F29C6B" : "rgba(235,228,218,0.7)"}`,
                      borderRadius: 14, padding: "14px 8px",
                      textAlign: "center",
                      background: selectedSize === key ? "rgba(242,156,107,0.05)" : "#fff",
                      transition: "all 0.2s",
                    }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#1A1818", marginBottom: 2 }}>{key}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#F29C6B", marginBottom: 4 }}>{SIZE_CONFIG[key].cm}cm</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{SIZE_CONFIG[key].desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 右：转印预处理 + 下载 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 }}>转印预处理</div>
                <div style={{
                  background: "#f9fafb",
                  border: "1px solid rgba(235,228,218,0.7)",
                  borderRadius: 14, padding: "14px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1818", display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 16 }}>⇌</span>
                      开启自动镜像
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>纹身转印纸需镜像打印才能正向显示</div>
                  </div>
                  {/* Toggle */}
                  <div
                    className={`toggle-track ${isMirror ? "on" : ""}`}
                    onClick={() => setIsMirror(m => !m)}
                  >
                    <div className="toggle-thumb" />
                  </div>
                </div>
              </div>

              {/* 下载按钮 */}
              <button
                onClick={() => activeImageUrl && setShowDownloadModal(true)}
                disabled={!activeImageUrl}
                style={{
                  width: "100%", padding: "16px 20px",
                  background: activeImageUrl ? "#F29C6B" : "#e5e7eb",
                  color: activeImageUrl ? "#fff" : "#9ca3af",
                  border: "none", borderRadius: 14,
                  fontSize: 15, fontWeight: 800,
                  cursor: activeImageUrl ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: activeImageUrl ? "0 12px 24px rgba(242,156,107,0.35)" : "none",
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                  marginTop: "auto",
                }}
                onMouseEnter={e => {
                  if (activeImageUrl) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#E08856";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={e => {
                  if (activeImageUrl) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#F29C6B";
                    (e.currentTarget as HTMLButtonElement).style.transform = "none";
                  }
                }}
              >
                <span>⬇</span>
                下载打印专属图纸
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 下载 Modal */}
      {showDownloadModal && activeImageUrl && (
        <DownloadModal
          imageUrl={activeImageUrl}
          petName={petName || undefined}
          mirror={isMirror}
          onClose={() => setShowDownloadModal(false)}
        />
      )}

      {/* 重新制作确认弹层 */}
      {showResetConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => e.target === e.currentTarget && setShowResetConfirm(false)}
        >
          <div style={{
            background: "#fff", borderRadius: 20,
            padding: "32px 28px 24px", width: 300,
            maxWidth: "90vw", textAlign: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            animation: "popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🐾</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", marginBottom: 6 }}>确定要重新开始吗？</div>
            <div style={{ fontSize: 13, color: "#9b8e80", marginBottom: 24 }}>当前生成的所有结果将丢失</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{ flex: 1, padding: "11px 0", border: "1.5px solid #e5e7eb", borderRadius: 10, background: "#fff", color: "#6b7280", fontSize: 14, cursor: "pointer" }}
              >
                再想想
              </button>
              <button
                onClick={() => { setShowResetConfirm(false); handleReset(); }}
                style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, background: "#F29C6B", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                确定重做
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
