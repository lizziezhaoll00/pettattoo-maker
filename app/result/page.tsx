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
import { renderFinalCanvas, canvasToBlob, downloadBlob } from "@/lib/canvas";
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
    reset,
  } = useEditorStore();

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [retryingKey, setRetryingKey] = useState<StyleKey | null>(null);
  const [mirrorDataUrl, setMirrorDataUrl] = useState<string | null>(null);

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

  // 镜像预览
  useEffect(() => {
    if (!activeImageUrl) { setMirrorDataUrl(null); return; }
    let cancelled = false;
    renderFinalCanvas({
      imageUrl: activeImageUrl, size: "S",
      colorMode: "color", showWhiteBorder: false,
      squareCrop: false, cropRect: null, mirror: true,
    }).then(canvas => {
      if (!cancelled) setMirrorDataUrl(canvas.toDataURL("image/jpeg", 0.8));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeImageUrl]);

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

  // 推荐尺寸提示
  const firstBody = selectedBodyParts[0];
  const recommendTip = firstBody
    ? `已根据你选择的「${BODY_PART_CONFIG[firstBody].label}」部位，为你推荐 ${BODY_PART_CONFIG[firstBody].recommendedSize} 码 (${SIZE_CONFIG[BODY_PART_CONFIG[firstBody].recommendedSize].cm}cm)`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#faf6f0", display: "flex", flexDirection: "column" }}>
      {/* 顶部导航 */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #f0f0f0",
        padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => setShowResetConfirm(true)}
          style={{ background: "none", border: "none", fontSize: 14, color: "#6b7280", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          ← 重新制作
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
          {petName ? `查看独属于「${petName}」的专属印记` : "🐾 查看你的专属印记"}
        </span>
        <button
          onClick={() => activeImageUrl && setShowDownloadModal(true)}
          disabled={!activeImageUrl}
          style={{
            padding: "6px 16px",
            background: activeImageUrl ? "#f59e0b" : "#e5e7eb",
            color: activeImageUrl ? "#fff" : "#9ca3af",
            border: "none", borderRadius: 999,
            fontSize: 13, fontWeight: 700, cursor: activeImageUrl ? "pointer" : "not-allowed",
          }}
        >
          下载
        </button>
      </div>

      <div style={{ flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "20px 24px 40px" }}>

        {/* ── 大图 + 右侧缩略图 ── */}
        <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 0 }}>
          {/* 左侧：风格缩略图竖排 */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            flexShrink: 0, width: 88, justifyContent: "flex-start", paddingTop: 2,
          }}>
            {selectedStyles.map(key => {
              const result = generationResults[key];
              const isActive = key === activeKey;
              const isRetrying = retryingKey === key;
              return (
                <div
                  key={key}
                  onClick={() => {
                    if (result.status === "error" && !isRetrying) handleRetry(key);
                    else if (result.status === "done") setCurrentStyleKey(key);
                  }}
                  style={{
                    width: "100%", borderRadius: 12, overflow: "hidden",
                    border: `2px solid ${isActive ? "#f59e0b" : "transparent"}`,
                    cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s",
                    background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  title={result.status === "error" ? "点击重试" : STYLE_CONFIGS[key].label}
                >
                  {result.status === "done" && result.url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={result.url} alt={STYLE_CONFIGS[key].label}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                      <div style={{ fontSize: 10, fontWeight: 700, textAlign: "center", padding: "3px 4px", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {STYLE_CONFIGS[key].label}
                      </div>
                    </>
                  ) : result.status === "error" ? (
                    <div style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff5f5", gap: 2 }}>
                      <span style={{ fontSize: 18 }}>❌</span>
                      <span style={{ fontSize: 8, color: "#ef4444" }}>重试</span>
                    </div>
                  ) : (
                    <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}
                      className="animate-pulse-slow"
                    >
                      <span style={{ fontSize: 20 }}>⏳</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 右侧：大图展示区 —— 完整展示生成图，不裁切 */}
          <div style={{
            flex: 1, minWidth: 0, borderRadius: 20, overflow: "hidden",
            background: "#fff", position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 200,
          }}>
            {activeImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImageUrl} alt="生成结果"
                style={{ width: "100%", height: "auto", display: "block", borderRadius: 20 }}
              />
            ) : (
              <div style={{ width: "100%", minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", background: "#f9f7f4", borderRadius: 20 }}>
                <p style={{ fontSize: 14, color: "#9ca3af" }}>
                  {activeKey && generationResults[activeKey]?.status === "error" ? "❌ 生成失败" : "⏳ 生成中…"}
                </p>
              </div>
            )}
            {/* 重生按钮 右下角 */}
            <button
              onClick={() => activeKey && handleRetry(activeKey)}
              disabled={!activeKey || retryingKey !== null}
              style={{
                position: "absolute", bottom: 16, right: 14,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #e5e7eb", borderRadius: 20,
                padding: "5px 14px", fontSize: 12, color: "#374151",
                fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(4px)", zIndex: 2,
                transition: "background 0.15s",
                opacity: retryingKey ? 0.5 : 1,
              }}
            >
              {retryingKey ? "重生成中…" : "↺ 重生"}
            </button>
          </div>
        </div>

        {/* ── 底部三栏调节面板 ── */}
        <div style={{
          display: "flex", background: "#fff", borderRadius: 20,
          marginTop: 14, padding: "18px 16px", gap: 0,
          boxShadow: "0 2px 16px rgba(0,0,0,0.08)", alignItems: "flex-start",
        }}>
          {/* 第一栏：尺寸选择 */}
          <div style={{ flex: 1, minWidth: 0, padding: "0 12px 0 0" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>尺寸选择</div>
            <div style={{ display: "flex", gap: 6 }}>
              {ALL_SIZES.map(key => (
                <button
                  key={key}
                  onClick={() => setSelectedSize(key)}
                  style={{
                    flex: 1, padding: "10px 4px",
                    borderRadius: 12, textAlign: "center",
                    border: `2px solid ${selectedSize === key ? "#f59e0b" : "#e5e7eb"}`,
                    background: selectedSize === key ? "#fffbf0" : "#fff",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.2s",
                    color: selectedSize === key ? "#b45309" : "#374151",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{key}</div>
                  <div style={{ fontSize: 12, margin: "1px 0" }}>{SIZE_CONFIG[key].cm}cm</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{SIZE_CONFIG[key].desc}</div>
                </button>
              ))}
            </div>
            {recommendTip && (
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, fontWeight: 500, lineHeight: 1.4 }}>
                {recommendTip}
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div style={{ width: 1, background: "#f0f0f0", alignSelf: "stretch", flexShrink: 0 }} />

          {/* 第二栏：镜像预览 */}
          <div style={{ flex: 1, minWidth: 0, padding: "0 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
              镜像预览
              <span style={{ background: "#f59e0b", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>镜像</span>
            </div>
            <div style={{ position: "relative", display: "inline-block" }}>
              {mirrorDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mirrorDataUrl} alt="镜像预览"
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 12, transform: "scaleX(-1)", display: "block" }}
                />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: 12, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>预览中</span>
                </div>
              )}
              <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>
                300DPI
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>直接放纸打印即可</div>
          </div>

          {/* 分隔线 */}
          <div style={{ width: 1, background: "#f0f0f0", alignSelf: "stretch", flexShrink: 0 }} />

          {/* 第三栏：高级操作 + 下载 */}
          <div style={{ flex: 1, minWidth: 0, padding: "0 0 0 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>高级操作</div>
            </div>
            <button
              onClick={() => activeImageUrl && setShowDownloadModal(true)}
              disabled={!activeImageUrl}
              style={{
                width: "100%", padding: "14px 16px",
                background: activeImageUrl ? "#f59e0b" : "#e5e7eb",
                color: activeImageUrl ? "#fff" : "#9ca3af",
                border: "none", borderRadius: 14,
                fontSize: 14, fontWeight: 700, cursor: activeImageUrl ? "pointer" : "not-allowed",
                marginBottom: 0, transition: "background 0.2s",
              }}
            >
              {petName ? `🐾 下载「${petName}」的纹身素材包` : "🐾 下载纹身素材包"}
            </button>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, lineHeight: 1.4 }}>
              *已自动为您开启镜像处理，直接打印即可使用专用纹身转印贴纸
            </div>
          </div>
        </div>
      </div>

      {/* 下载 Modal */}
      {showDownloadModal && activeImageUrl && (
        <DownloadModal
          imageUrl={activeImageUrl}
          petName={petName || undefined}
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
                style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, background: "#f59e0b", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
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
