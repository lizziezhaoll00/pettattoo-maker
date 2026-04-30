"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useEditorStore,
  BODY_PART_CONFIG,
  StyleKey,
  SIZE_CONFIG,
  SizeKey,
} from "@/store/editorStore";
import { STYLE_CONFIGS } from "@/components/StyleGrid";
import { stylize } from "@/lib/stylize";
import Uploader, { UploaderCTA } from "@/components/Uploader";
import DownloadModal from "@/components/DownloadModal";

// ── 步骤 2 动态加载文案 ──
const LOADING_TEXTS = [
  "正在建立 AI 魔法连接...",
  "正在解析宝贝的面部特征...",
  "正在注入独特的艺术灵魂...",
  "正在勾勒专属线条与光影...",
  "AI 画师正在进行最终上色...",
];

const ALL_SIZES: SizeKey[] = ["S", "M", "L"];

// ── 拖拽前后对比组件 ──
function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [splitPct, setSplitPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calcPct = (clientX: number) => {
    if (!containerRef.current) return;
    const { left, width } = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - left) / width) * 100));
    setSplitPct(pct);
  };

  const onMouseDown = (e: React.MouseEvent) => { isDragging.current = true; e.preventDefault(); };
  const onTouchStart = () => { isDragging.current = true; };

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDragging.current) calcPct(e.clientX); };
    const onTouchMove = (e: TouchEvent) => { if (isDragging.current) calcPct(e.touches[0].clientX); };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", aspectRatio: "5/6", maxHeight: "calc(100vh - 200px)", borderRadius: 18, overflow: "hidden", userSelect: "none", cursor: "col-resize", boxShadow: "0 4px 32px rgba(0,0,0,0.10)" }}
      onClick={e => calcPct(e.clientX)}
    >
      {/* 底层：原始照片（右侧） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={beforeUrl} alt="原图" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#F5F0EB" }} />

      {/* 上层：纹身手稿（左侧，clip 裁切） */}
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - splitPct}% 0 0)`, transition: "clip-path 0s" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterUrl} alt="纹身手稿" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#fff" }} />
      </div>

      {/* 分割线 */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${splitPct}%`, transform: "translateX(-50%)", width: 2, background: "rgba(255,255,255,0.9)", boxShadow: "0 0 8px rgba(0,0,0,0.25)", pointerEvents: "none" }} />

      {/* 拖拽把手 */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{ position: "absolute", top: "50%", left: `${splitPct}%`, transform: "translate(-50%, -50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(26,24,24,0.88)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "col-resize", boxShadow: "0 2px 16px rgba(0,0,0,0.3)", zIndex: 10, color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: -1, userSelect: "none" }}
      >
        ‹›
      </div>

    </div>
  );
}

// ── 进度条组件（由 page 控制，避免 transform stacking context 问题） ──
function StepHeader({ currentStep, onReset }: { currentStep: 1 | 2 | 3; onReset?: () => void }) {
  const steps = [
    { n: 1, label: "上传与构思" },
    { n: 2, label: "AI 灵感生成" },
    { n: 3, label: "下载纹身图纸" },
  ] as const;

  return (
    <header style={{
      maxWidth: 1440, margin: "0 auto", padding: "20px 56px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      boxSizing: "border-box",
      background: "rgba(255,255,255,0.38)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderRadius: 20, borderBottom: "1px solid rgba(235,228,218,0.5)",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 38, height: 38, background: "#1A1818", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>✦</div>
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>PetTattoo<span style={{ color: "#F29C6B" }}>.</span></span>
      </div>

      {/* 步骤条 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {steps.map((step, idx) => {
          const isDone = currentStep > step.n;
          const isActive = currentStep === step.n;
          return (
            <div key={step.n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                background: isActive ? "#1A1818" : isDone ? "rgba(242,156,107,0.15)" : "transparent",
                color: isActive ? "#fff" : isDone ? "#D97706" : "#8A817C",
                borderRadius: 999, padding: "6px 16px",
                fontSize: 13, fontWeight: 700,
                transition: "all 0.35s ease",
              }}>
                <span style={{
                  width: 22, height: 22,
                  background: isActive ? "rgba(255,255,255,0.15)" : isDone ? "#F29C6B" : "transparent",
                  border: isDone ? "none" : isActive ? "none" : "1.5px solid #D1C9BE",
                  borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, flexShrink: 0,
                  transition: "all 0.35s ease",
                  color: isDone ? "#fff" : "inherit",
                }}>
                  {isDone ? "✓" : step.n}
                </span>
                {step.label}
              </div>
              {idx < steps.length - 1 && (
                <div style={{
                  width: 48, height: 2, borderRadius: 99,
                  background: isDone ? "rgba(242,156,107,0.5)" : "rgba(26,24,24,0.08)",
                  transition: "background 0.4s ease",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* 右侧：步骤3时显示返回按钮，其余占位 */}
      {currentStep === 3 && onReset ? (
        <button
          onClick={onReset}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.6)", border: "1px solid rgba(235,228,218,0.7)", borderRadius: 999, padding: "7px 16px", fontSize: 12, fontWeight: 600, color: "#6B6560", cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "all 0.2s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.9)"; e.currentTarget.style.color = "#1A1818"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.6)"; e.currentTarget.style.color = "#6B6560"; }}
        >
          ← 返回重新构思
        </button>
      ) : (
        <div style={{ width: 80 }} />
      )}
    </header>
  );
}

// ─── 主页组件 ──────────────────────────────────────────
export default function Home() {
  const {
    setGenResult, setCurrentStyleKey,
    setSelectedSize,
    setGeneratedText,
    selectedBodyParts,
    selectedStyles,
    generationResults,
    currentStyleKey,
    originalUrl,
    petName,
    generatedText,
    reset,
    selectedSize,
  } = useEditorStore();

  const generationStartedRef = useRef(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const [isMirror, setIsMirror] = useState(true);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // 单张重新生成弹框
  const [regenKey, setRegenKey] = useState<StyleKey | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [isRegening, setIsRegening] = useState(false);

  // 步骤 2 动态文案轮播：到最后一条后停住，不再循环
  useEffect(() => {
    if (currentStep !== 2) return;
    setLoadingTextIndex(0);
    const interval = setInterval(() => {
      setLoadingTextIndex(prev => {
        if (prev >= LOADING_TEXTS.length - 1) {
          clearInterval(interval); // 到最后一条，停止轮播
          return prev;
        }
        return prev + 1;
      });
    }, 3200);
    return () => clearInterval(interval);
  }, [currentStep]);

  // 预选推荐尺寸
  const applyRecommendedSize = useCallback(() => {
    if (selectedBodyParts.length === 0) return;
    const recommended = BODY_PART_CONFIG[selectedBodyParts[0]].recommendedSize;
    setSelectedSize(recommended);
  }, [selectedBodyParts, setSelectedSize]);

  const handleUploaded = useCallback((_file: File, _preview: string) => {}, []);

  // 点击「开始魔法」
  const handleStartMagic = useCallback(async () => {
    if (generationStartedRef.current) return;
    generationStartedRef.current = true;
    setIsGenerating(true);
    setCurrentStep(2); // 立即切到步骤 2

    const { petName: name, originalUrl: origUrl, selectedStyles: styles, removedBgUrl: rbUrl, bgRemoveStatus: bgStatus } = useEditorStore.getState();

    const imageUrl = (bgStatus === "done" && rbUrl) ? rbUrl : origUrl;
    if (!imageUrl) {
      setIsGenerating(false);
      generationStartedRef.current = false;
      setCurrentStep(1);
      return;
    }

    styles.forEach((key) => setGenResult(key, { status: "pending" }));

    const finalName = name.trim() || "小天使";
    const styleLabels = styles.map(k => STYLE_CONFIGS[k]?.label ?? k).join("、");

    const textPromise = (async () => {
      try {
        const res = await fetch("/api/generate-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petName: finalName, styles: styleLabels }),
        });
        if (!res.ok) throw new Error("文案生成失败");
        const { text } = await res.json();
        if (text) setGeneratedText(text);
      } catch { /* 静默 */ }
    })();

    try {
      await Promise.all([
        textPromise,
        ...styles.map(async (key: StyleKey) => {
          try {
            const url = await stylize(imageUrl, key, origUrl ?? undefined, name || undefined);
            setGenResult(key, { status: "done", url });
          } catch (e) {
            setGenResult(key, { status: "error", error: e instanceof Error ? e.message : "生成失败" });
          }
        }),
      ]);
    } finally {
      applyRecommendedSize();
      const firstDone = useEditorStore.getState().selectedStyles.find(
        k => useEditorStore.getState().generationResults[k].status === "done"
      );
      if (firstDone) setCurrentStyleKey(firstDone);
      setIsGenerating(false);
      setCurrentStep(3); // 生成完毕切到步骤 3
    }
  }, [setGenResult, setGeneratedText, setCurrentStyleKey, applyRecommendedSize]);

  const handleReset = useCallback(() => {
    generationStartedRef.current = false;
    setIsGenerating(false);
    setCurrentStep(1);
    // 仅重置图片和生成结果，保留用户填写的名字、选择的风格
    useEditorStore.getState().resetImageOnly();
  }, []);

  // 单张重新生成
  const handleRegen = useCallback(async (key: StyleKey, extraPrompt: string) => {
    const { removedBgUrl, bgRemoveStatus, originalUrl: origUrl, petName: name } = useEditorStore.getState();
    const imageUrl = (bgRemoveStatus === "done" && removedBgUrl) ? removedBgUrl : origUrl;
    if (!imageUrl) return;
    setIsRegening(true);
    setGenResult(key, { status: "pending" });
    try {
      const url = await stylize(imageUrl, key, origUrl ?? undefined, name || undefined, extraPrompt || undefined);
      setGenResult(key, { status: "done", url });
      setCurrentStyleKey(key);
    } catch (e) {
      setGenResult(key, { status: "error", error: e instanceof Error ? e.message : "生成失败" });
    } finally {
      setIsRegening(false);
      setRegenKey(null);
      setRegenPrompt("");
    }
  }, [setGenResult, setCurrentStyleKey]);

  // 结果页数据
  const activeKey = currentStyleKey ?? selectedStyles.find(k => generationResults[k]?.status === "done") ?? null;
  const activeResult = activeKey ? generationResults[activeKey] : null;
  const activeImageUrl = activeResult?.status === "done" ? activeResult.url : null;

  return (
    <>
      {/* ── 固定背景光晕（全局） ── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div className="animate-blob" style={{ position: "absolute", top: "-10%", left: "-10%", width: "55vw", height: "55vw", background: "rgba(242,156,107,0.09)", borderRadius: "50%", filter: "blur(120px)" }} />
        <div className="animate-blob-delay-2" style={{ position: "absolute", bottom: "-15%", right: "-8%", width: "45vw", height: "45vw", background: "rgba(232,195,150,0.12)", borderRadius: "50%", filter: "blur(120px)" }} />
        <div className="animate-blob-delay-4" style={{ position: "absolute", top: "35%", left: "25%", width: "35vw", height: "35vw", background: "rgba(251,207,232,0.07)", borderRadius: "50%", filter: "blur(90px)" }} />
      </div>

      {/* ── 进度条 Header（在所有步骤上方，不受 transform 容器影响） ── */}
      <div style={{ position: "relative", zIndex: 10, padding: "0 56px" }}>
        <StepHeader currentStep={currentStep} onReset={currentStep === 3 ? () => setShowResetConfirm(true) : undefined} />
      </div>

      {/* ══════════════════════════════════════════
          步骤 1：上传与构思
      ══════════════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="animate-phase-in" style={{ position: "relative", zIndex: 1 }}>
          {/* 主标题（由 page 统一管理） */}
          <div style={{ textAlign: "center", padding: "28px 24px 32px", maxWidth: 1440, margin: "0 auto", boxSizing: "border-box" }}>
            <h1 className="font-serif-sc" style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, color: "#1A1818", lineHeight: 1.2, marginBottom: 14, letterSpacing: "0.06em" }}>
              把对它的爱，化作永恒符号
            </h1>
            <p style={{ color: "#8A817C", fontSize: 15, margin: "0 auto", lineHeight: 1.75, maxWidth: 560 }}>
              上传一张清晰的照片，我们将结合 AI 魔法，为你生成独一无二的专属纹身手稿。
            </p>
          </div>
          <Uploader
            onUploaded={handleUploaded}
            isGenerating={isGenerating}
            hideHeader
          />
        </div>
      )}

      {/* ══════════════════════════════════════════
          步骤 2：AI 生成中
      ══════════════════════════════════════════ */}
      {currentStep === 2 && (
        <div className="animate-phase-in" style={{ position: "relative", zIndex: 1, minHeight: "calc(100vh - 90px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 56px" }}>
          <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ background: "rgba(255,255,255,0.40)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 28, border: "1px solid rgba(235,228,218,0.55)", boxShadow: "0 4px 40px rgba(0,0,0,0.04)", padding: "56px 48px 64px", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

              {/* 照片 + 扫描光效 */}
              <div style={{ position: "relative", width: 260, height: 260, marginBottom: 40 }}>
                {originalUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={originalUrl}
                    alt="宠物照片"
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 24, display: "block", boxShadow: "0 8px 40px rgba(0,0,0,0.14)" }}
                  />
                )}
                {/* 扫描光束 */}
                <div style={{ position: "absolute", inset: 0, borderRadius: 24, overflow: "hidden", pointerEvents: "none" }}>
                  <div className="scan-beam" style={{
                    position: "absolute", left: 0, right: 0, height: 48,
                    background: "linear-gradient(to bottom, transparent, rgba(242,156,107,0.45), transparent)",
                    animation: "scanBeam 2.2s ease-in-out infinite",
                  }} />
                </div>
                {/* 四角扫描框 */}
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {["topLeft","topRight","bottomLeft","bottomRight"].map(corner => {
                    const isTop = corner.startsWith("top");
                    const isLeft = corner.endsWith("Left");
                    return (
                      <div key={corner} style={{
                        position: "absolute",
                        top: isTop ? 8 : "auto", bottom: isTop ? "auto" : 8,
                        left: isLeft ? 8 : "auto", right: isLeft ? "auto" : 8,
                        width: 22, height: 22,
                        borderTop: isTop ? "2.5px solid #F29C6B" : "none",
                        borderBottom: !isTop ? "2.5px solid #F29C6B" : "none",
                        borderLeft: isLeft ? "2.5px solid #F29C6B" : "none",
                        borderRight: !isLeft ? "2.5px solid #F29C6B" : "none",
                        borderRadius: isTop && isLeft ? "6px 0 0 0" : isTop && !isLeft ? "0 6px 0 0" : !isTop && isLeft ? "0 0 0 6px" : "0 0 6px 0",
                      }} />
                    );
                  })}
                </div>
              </div>

              {/* 进度风格标签 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap", justifyContent: "center" }}>
                {selectedStyles.map(key => {
                  const result = generationResults[key];
                  const isDone = result?.status === "done";
                  const isErr = result?.status === "error";
                  return (
                    <span key={key} style={{
                      fontSize: 13, fontWeight: 700,
                      padding: "6px 16px", borderRadius: 999,
                      background: isDone ? "rgba(52,211,153,0.12)" : isErr ? "rgba(239,68,68,0.1)" : "rgba(242,156,107,0.10)",
                      color: isDone ? "#059669" : isErr ? "#dc2626" : "#B45309",
                      border: `1px solid ${isDone ? "rgba(52,211,153,0.35)" : isErr ? "rgba(239,68,68,0.3)" : "rgba(242,156,107,0.3)"}`,
                      display: "inline-flex", alignItems: "center", gap: 6,
                      transition: "all 0.4s",
                    }}>
                      {isDone ? "✓ " : isErr ? "✕ " : ""}{STYLE_CONFIGS[key]?.label}
                      {!isDone && !isErr && (
                        <svg style={{ animation: "spin 1.2s linear infinite", flexShrink: 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      )}
                    </span>
                  );
                })}
              </div>

              {/* 动态文案：轮播到最后一条后锁定，spinner 持续转 */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1818", marginBottom: 16, letterSpacing: "0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <svg style={{ animation: "spin 1.2s linear infinite", color: "#F29C6B", flexShrink: 0 }} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  {LOADING_TEXTS[loadingTextIndex]}
                </div>
                {/* 提示胶囊（参考图2样式） */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.75)", border: "1px solid rgba(235,228,218,0.7)", borderRadius: 999, padding: "10px 22px", fontSize: 13, color: "#6B6560", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                  预计需要 15~30 秒，请不要刷新或离开当前页面
                </div>
              </div>

            </div>
          </div>

          <style>{`
            @keyframes scanBeam {
              0%   { top: -48px; }
              50%  { top: calc(100% + 0px); }
              100% { top: -48px; }
            }
          `}</style>
        </div>
      )}

      {/* ══════════════════════════════════════════
          步骤 3：结果内嵌
      ══════════════════════════════════════════ */}
      {currentStep === 3 && (
        <div className="animate-phase-in" style={{ position: "relative", zIndex: 1, padding: "16px 40px 24px", boxSizing: "border-box" }}>
          <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto" }}>

            {/* 主体内容区：左右两列布局 */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>

              {/* ══ 左列：大图 + 语录 ══ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* 大图卡片 - hover 展示重新生成入口 */}
                <div className="main-card-wrap" style={{ background: "rgba(255,255,255,0.40)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 24, border: "1px solid rgba(235,228,218,0.55)", boxShadow: "0 4px 40px rgba(0,0,0,0.04)", overflow: "hidden", position: "relative" }}>

                  {/* 当前风格名胶囊 */}
                  {activeKey && (
                    <div style={{ position: "absolute", top: 12, right: 12, zIndex: 3, display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.88)", border: "1px solid rgba(235,228,218,0.7)", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#1A1818", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                      <span style={{ color: "#F29C6B", fontSize: 12 }}>✦</span>
                      {STYLE_CONFIGS[activeKey].label}
                    </div>
                  )}

                  {/* 图片区 */}
                  <div style={{ padding: "16px 28px 12px", position: "relative" }}>
                    {activeImageUrl && originalUrl ? (
                      <div style={{ position: "relative", zIndex: 1, maxHeight: "calc(100vh - 200px)", overflow: "hidden", borderRadius: 18 }}>
                        <BeforeAfterSlider key={activeKey ?? ""} beforeUrl={originalUrl} afterUrl={activeImageUrl} />
                        {/* hover 时显示的重新生成覆盖层 - 在图片内部 */}
                        {activeKey && generationResults[activeKey]?.status !== "pending" && (
                          <div className={`regen-hover-layer${regenKey === activeKey ? " open" : ""}`} style={{ position: "absolute", inset: 0, zIndex: 4, opacity: 0, transition: "opacity 0.2s", pointerEvents: "none", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                            {regenKey === activeKey ? (
                              <div style={{ pointerEvents: "auto", margin: "0 14px 14px", background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 14, border: "1px solid rgba(235,228,218,0.9)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                                <span style={{ fontSize: 13, color: "#F29C6B", flexShrink: 0 }}>✏</span>
                                <input
                                  autoFocus
                                  value={regenPrompt}
                                  onChange={e => setRegenPrompt(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter" && !isRegening) handleRegen(activeKey, regenPrompt); if (e.key === "Escape") { setRegenKey(null); setRegenPrompt(""); } }}
                                  placeholder="告诉 AI 修改要求（可直接不填发送）"
                                  disabled={isRegening}
                                  style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "#1A1818", background: "transparent", fontFamily: "inherit" }}
                                />
                                <button onClick={() => { setRegenKey(null); setRegenPrompt(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
                                <button
                                  onClick={() => !isRegening && handleRegen(activeKey, regenPrompt)}
                                  disabled={isRegening}
                                  style={{ width: 34, height: 34, borderRadius: 10, background: isRegening ? "#fbd5b5" : "#F29C6B", border: "none", cursor: isRegening ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                >
                                  {isRegening
                                    ? <svg style={{ animation: "spin 1s linear infinite" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                  }
                                </button>
                              </div>
                            ) : (
                              <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center", paddingBottom: 14 }}>
                                <button
                                  onClick={() => { setRegenKey(activeKey); setRegenPrompt(""); }}
                                  style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(26,24,24,0.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
                                  对此张不满意？微调重绘
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: "calc(100vh - 200px)", background: "#F5F0EB", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, position: "relative", zIndex: 1 }}>
                        <svg style={{ animation: "spin 1.2s linear infinite" }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F29C6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>AI 正在生成手稿…</span>
                      </div>
                    )}
                  </div>


                  {/* 语录 */}
                  {generatedText && (
                    <div style={{ padding: "16px 28px 20px", borderTop: "1px solid rgba(235,228,218,0.45)" }}>
                      <p className="font-serif-sc" style={{ fontSize: 15, lineHeight: 2, color: "rgba(26,24,24,0.72)", fontStyle: "italic", textAlign: "center", margin: 0, letterSpacing: "0.06em" }}>
                        {generatedText}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ══ 右列：功能面板 ══ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 36 }}>

                {/* 风格切换：大卡片+底部标签名样式 */}
                <div style={{ background: "rgba(255,255,255,0.40)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 20, border: "1px solid rgba(235,228,218,0.55)", padding: "20px 20px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                    <span style={{ color: "#F29C6B", fontSize: 12 }}>✦</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>切换浏览其他风格</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selectedStyles.length, 3)}, 1fr)`, gap: 8 }}>
                    {selectedStyles.map(key => {
                      const result = generationResults[key];
                      const isActive = key === activeKey;
                      return (
                        <div
                          key={key}
                          className={`style-thumb-card${isActive ? " active" : ""}`}
                          onClick={() => result?.status === "done" && setCurrentStyleKey(key)}
                          style={{ cursor: result?.status === "done" ? "pointer" : "default", display: "flex", flexDirection: "column", borderRadius: 14, overflow: "hidden", border: `2px solid ${isActive ? "#F29C6B" : "rgba(235,228,218,0.5)"}`, boxShadow: isActive ? "0 0 0 2px rgba(242,156,107,0.2)" : "none", transition: "all 0.2s", position: "relative", background: "#fff", opacity: isActive ? 1 : 0.55 }}
                        >
                          {/* 图片区 */}
                          <div style={{ width: "100%", aspectRatio: "1/1", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                            {result?.status === "done" && result.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={result.url} alt={STYLE_CONFIGS[key].label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                            ) : result?.status === "error" ? (
                              <span style={{ fontSize: 18 }}>❌</span>
                            ) : (
                              <svg style={{ animation: "spin 1.2s linear infinite" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F29C6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                            )}
                            {/* 对勾角标 */}
                            {isActive && result?.status === "done" && (
                              <div style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, background: "#F29C6B", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, zIndex: 2, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>✓</div>
                            )}
                          </div>
                          {/* 标签名 */}
                          <div style={{ padding: "6px 4px 7px", textAlign: "center", fontSize: 11, fontWeight: 700, color: isActive ? "#F29C6B" : "#374151", background: isActive ? "rgba(242,156,107,0.06)" : "#fff", borderTop: `1px solid ${isActive ? "rgba(242,156,107,0.2)" : "rgba(235,228,218,0.6)"}` }}>
                            {STYLE_CONFIGS[key]?.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 图纸打印设置 */}
                <div style={{ background: "rgba(255,255,255,0.40)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 20, border: "1px solid rgba(235,228,218,0.55)", padding: "20px 20px 18px", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>图纸打印设置</span>
                  </div>

                  {/* 尺寸 */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#C4BAB2", marginBottom: 8, letterSpacing: "0.05em" }}>物理尺寸选择</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
                    {ALL_SIZES.map(key => (
                      <div key={key} onClick={() => setSelectedSize(key)} style={{ cursor: "pointer", border: `1.5px solid ${selectedSize === key ? "#F29C6B" : "rgba(235,228,218,0.7)"}`, borderRadius: 10, padding: "8px 4px", textAlign: "center", background: selectedSize === key ? "rgba(242,156,107,0.05)" : "#fff", transition: "all 0.2s" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: selectedSize === key ? "#1A1818" : "#6B6560", marginBottom: 1 }}>{key}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: selectedSize === key ? "#F29C6B" : "#C4BAB2", marginBottom: 1 }}>{SIZE_CONFIG[key].cm}cm</div>
                        <div style={{ fontSize: 9, color: "#C4BAB2", lineHeight: 1.4 }}>{SIZE_CONFIG[key].desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* 转印预处理 */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#C4BAB2", marginBottom: 8, letterSpacing: "0.05em" }}>转印预处理</div>
                  <div style={{ background: "#f9fafb", border: "1px solid rgba(235,228,218,0.7)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1818", display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <span style={{ fontSize: 13 }}>⇌</span> 开启自动镜像
                      </div>
                      <div style={{ fontSize: 9, color: "#9ca3af", lineHeight: 1.5 }}>纹身转印纸需镜像打印才能正向显示</div>
                    </div>
                    <div className={`toggle-track ${isMirror ? "on" : ""}`} onClick={() => setIsMirror(m => !m)}>
                      <div className="toggle-thumb" />
                    </div>
                  </div>
                </div>

                {/* 下载按钮 */}
                {(() => {
                  const doneItems = selectedStyles
                    .map(k => ({ key: k, url: generationResults[k]?.status === "done" ? generationResults[k].url! : null }))
                    .filter((it): it is { key: StyleKey; url: string } => !!it.url);
                  const hasAny = doneItems.length > 0;
                  return (
                    <>
                      <button
                        onClick={() => hasAny && setShowDownloadModal(true)}
                        disabled={!hasAny}
                        style={{ width: "100%", padding: "16px 20px", background: hasAny ? "#F29C6B" : "#e5e7eb", color: hasAny ? "#fff" : "#9ca3af", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 800, cursor: hasAny ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: hasAny ? "0 12px 24px rgba(242,156,107,0.35)" : "none", transition: "all 0.2s" }}
                        onMouseEnter={e => { if (hasAny) { (e.currentTarget).style.background = "#E08856"; (e.currentTarget).style.transform = "translateY(-1px)"; } }}
                        onMouseLeave={e => { if (hasAny) { (e.currentTarget).style.background = "#F29C6B"; (e.currentTarget).style.transform = "none"; } }}
                      >
                        <span>⬇</span>
                        {doneItems.length > 1 ? "一键打包下载全部图纸" : `下载「${doneItems[0] ? STYLE_CONFIGS[doneItems[0].key].label : "…"}」图纸`}
                      </button>
                    </>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CTA 底栏（仅步骤 1 显示） ── */}
      {currentStep === 1 && (
        <UploaderCTA onStartMagic={handleStartMagic} isGenerating={isGenerating} />
      )}

      {/* ── 下载 Modal ── */}
      {showDownloadModal && (() => {
        const doneItems = selectedStyles
          .map(k => ({ key: k, url: generationResults[k]?.status === "done" ? generationResults[k].url! : null }))
          .filter((it): it is { key: StyleKey; url: string } => !!it.url);
        return doneItems.length > 0 ? (
          <DownloadModal
            items={doneItems}
            petName={petName || undefined}
            mirror={isMirror}
            selectedSize={selectedSize}
            onClose={() => setShowDownloadModal(false)}
          />
        ) : null;
      })()}


      {/* ── 重新构思确认弹层 ── */}
      {showResetConfirm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => e.target === e.currentTarget && setShowResetConfirm(false)}
        >
          <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px 24px", width: 300, maxWidth: "90vw", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", animation: "popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🐾</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", marginBottom: 6 }}>返回重新构思？</div>
            <div style={{ fontSize: 13, color: "#9b8e80", marginBottom: 24 }}>已选风格和名字会保留，仅生成结果会清除</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "11px 0", border: "1.5px solid #e5e7eb", borderRadius: 10, background: "#fff", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>再看看</button>
              <button onClick={() => { setShowResetConfirm(false); handleReset(); }} style={{ flex: 1, padding: "11px 0", border: "none", borderRadius: 10, background: "#F29C6B", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>返回构思</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .result-img-grid-1 { max-width: 400px; margin: 0 auto; }
        .result-img-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 680px; margin: 0 auto; }
        .result-img-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .toggle-track { width: 44px; height: 24px; background: #d1d5db; border-radius: 999px; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
        .toggle-track.on { background: #68D391; }
        .main-card-wrap:hover .regen-hover-layer { opacity: 1 !important; pointer-events: auto !important; }
        .regen-hover-layer.open { opacity: 1 !important; pointer-events: auto !important; }
        .style-thumb-card:not(.active):hover { opacity: 1 !important; border-color: rgba(235,228,218,0.9) !important; box-shadow: 0 2px 10px rgba(0,0,0,0.08) !important; }
        .toggle-thumb { width: 20px; height: 20px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
        .toggle-track.on .toggle-thumb { transform: translateX(20px); }
        @media (max-width: 640px) {
          .result-img-grid-2 { grid-template-columns: 1fr 1fr; gap: 12px; }
          .result-img-grid-3 { grid-template-columns: 1fr 1fr; gap: 10px; }
        }
      `}</style>
    </>
  );
}
