"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useEditorStore,
  ALL_BODY_PARTS,
  BODY_PART_CONFIG,
  StyleKey,
} from "@/store/editorStore";
import { STYLE_CONFIGS } from "@/components/StyleGrid";
import { stylize } from "@/lib/stylize";
import Uploader from "@/components/Uploader";
import StyleGrid from "@/components/StyleGrid";

// ─── 步骤配置 ────────────────────────────────────────────
const STEPS = [
  { label: "上传照片" },
  { label: "选择风格" },
  { label: "纹身生成" },
  { label: "微调打印" },
];

// ─── 桌面端竖向步骤条 ───────────────────────────────────
function DesktopStepper({
  activeStep,
  summaries,
  showRestart,
  onRestart,
}: {
  activeStep: number;
  summaries: string[];
  showRestart: boolean;
  onRestart: () => void;
}) {
  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        background: "#fff",
        borderRight: "1px solid #f0f0f0",
        display: "flex",
        flexDirection: "column",
        padding: "28px 0 24px",
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "0 24px 28px", borderBottom: "1px solid #f5f5f3" }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
          PetTattoo<span style={{ color: "#f59e0b" }}>.</span>
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>把毛孩子纹在身上</div>
      </div>

      {/* 步骤条 */}
      <div style={{ flex: 1, padding: "24px 24px 0", overflowY: "auto" }}>
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const done = stepNum < activeStep;
          const active = stepNum === activeStep;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 28 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: `2px solid ${done ? "#10b981" : active ? "#f59e0b" : "#e5e7eb"}`,
                  background: done ? "#10b981" : active ? "#f59e0b" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: done || active ? "#fff" : "#9ca3af",
                  transition: "all 0.3s",
                  flexShrink: 0,
                }}>
                  {done ? "✓" : stepNum}
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 2,
                    background: done ? "#10b981" : "#e5e7eb",
                    flex: 1,
                    minHeight: 12,
                    transition: "background 0.4s",
                    margin: "2px 0",
                  }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: active ? "#f59e0b" : done ? "#1a1a1a" : "#9ca3af",
                  lineHeight: "28px",
                  transition: "color 0.3s",
                }}>
                  {step.label}
                </div>
                {done && summaries[i] && (
                  <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, marginTop: 1 }}>
                    {summaries[i]}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 重新制作按钮（仅结果页展示） */}
      {showRestart && (
        <div style={{ padding: "16px 24px 8px", borderTop: "1px solid #f0ece6" }}>
          <button
            onClick={onRestart}
            style={{
              width: "100%", background: "none",
              border: "1.5px solid #d1c9be", borderRadius: 10,
              color: "#9b8e80", fontSize: 13, padding: "9px 0",
              cursor: "pointer", transition: "all 0.18s", textAlign: "center",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#f59e0b";
              (e.currentTarget as HTMLButtonElement).style.color = "#f59e0b";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1c9be";
              (e.currentTarget as HTMLButtonElement).style.color = "#9b8e80";
            }}
          >
            ← 重新制作
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── 手机端顶部步骤条 ────────────────────────────────────
function MobileTopBar({ activeStep, summaries }: { activeStep: number; summaries: string[] }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "#faf6f0", borderBottom: "1px solid #f0f0f0",
    }}>
      <div style={{
        maxWidth: 480, margin: "0 auto", padding: "0 16px",
        display: "flex", alignItems: "stretch",
      }}>
        {/* 迷你步骤条 */}
        <div style={{ flex: 1, padding: "8px 0 4px", display: "flex", flexDirection: "column" }}>
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const done = stepNum < activeStep;
            const active = stepNum === activeStep;
            return (
              <div key={step.label} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: `2px solid ${done ? "#10b981" : active ? "#f59e0b" : "#e5e7eb"}`,
                    background: done ? "#10b981" : active ? "#f59e0b" : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700,
                    color: done || active ? "#fff" : "#9ca3af",
                    flexShrink: 0, transition: "all 0.3s",
                  }}>
                    {done ? "✓" : stepNum}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 2, background: done ? "#10b981" : "#e5e7eb", flex: 1, minHeight: 3, transition: "background 0.4s" }} />
                  )}
                </div>
                <div style={{
                  flex: 1, display: "flex", alignItems: "center",
                  flexWrap: "wrap", columnGap: 5, paddingBottom: 4,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: active ? "#f59e0b" : done ? "#10b981" : "#9ca3af",
                    lineHeight: "20px", whiteSpace: "nowrap",
                    transition: "color 0.3s",
                  }}>{step.label}</span>
                  {done && summaries[i] && (
                    <span style={{
                      fontSize: 10, color: "#6b7280", lineHeight: "20px",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: 160,
                    }}>{summaries[i]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Logo */}
        <div style={{ padding: "10px 0 6px 14px", borderLeft: "1px solid #f0f0f0", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
            PetTattoo<span style={{ color: "#f59e0b" }}>.</span>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>把毛孩子纹在身上</div>
        </div>
      </div>
    </div>
  );
}

// ─── 生成结果卡片（等待页） ───────────────────────────────
function GenCard({ styleKey }: { styleKey: StyleKey }) {
  const { generationResults, bgRemoveStatus } = useEditorStore();
  const result = generationResults[styleKey];
  const cfg = STYLE_CONFIGS[styleKey];
  // 防御：旧缓存 key 不存在时渲染占位
  if (!cfg || !result) return null;
  // 抠图还没完成时，generation 还没开始（idle/pending 都还在等抠图）
  const waitingForBgRemove = bgRemoveStatus === "pending" && result.status === "idle";

  return (
    <div style={{
      flexShrink: 0,
      width: 140,
      border: `2px solid ${result.status === "done" ? "#f59e0b" : "#e5e7eb"}`,
      borderRadius: 14,
      overflow: "hidden",
      background: result.status === "done" ? "#fff" : "#fafafa",
      position: "relative",
      animation: result.status === "done" ? "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" : undefined,
    }}>
      {/* 图片区 */}
      <div style={{ width: "100%", aspectRatio: "1", background: "#f3f4f6", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {result.status === "done" && result.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt={cfg.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)",
              color: "#fff", fontSize: 11, fontWeight: 700, padding: "14px 8px 7px",
            }}>{cfg.label}</div>
            <div style={{
              position: "absolute", top: 6, right: 6, width: 18, height: 18,
              background: "#10b981", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 10,
            }}>✓</div>
          </>
        ) : result.status === "error" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "0 8px" }}>
            <span style={{ fontSize: 24 }}>❌</span>
            <span style={{ fontSize: 9, color: "#ef4444", textAlign: "center", lineHeight: 1.3 }}>生成失败</span>
          </div>
        ) : waitingForBgRemove ? (
          // 抠图还没完成，等待中
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} className="animate-pulse-slow">
            <span style={{ fontSize: 24 }}>🪄</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#c4a96a", textAlign: "center", lineHeight: 1.3 }}>毛发处理中</span>
            <span style={{ fontSize: 9, color: "#9ca3af" }}>完成后自动开始</span>
          </div>
        ) : (
          // 风格化生成中
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }} className="animate-pulse-slow">
            <span style={{ fontSize: 28 }}>⏳</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>{cfg.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 部位卡片（等待页）────────────────────────────────────
const BODY_PART_IMGS: Record<string, string> = {
  finger:     "https://images.unsplash.com/photo-1586041828039-b8d193d6d1fb?w=200&q=70",
  hand:       "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=70",
  wrist:      "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=200&q=70",
  ankle:      "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=200&q=70",
  collarbone: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=200&q=70",
  shoulder:   "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200&q=70",
  forearm:    "https://images.unsplash.com/photo-1612532275214-e4ca76d0e4d1?w=200&q=70",
  upperarm:   "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=70",
};

function BodyCardW({ partKey }: { partKey: typeof ALL_BODY_PARTS[number] }) {
  const { selectedBodyParts, toggleBodyPart } = useEditorStore();
  const cfg = BODY_PART_CONFIG[partKey];
  const selected = selectedBodyParts.includes(partKey);
  const sizeLabel = cfg.recommendedSize === "S" ? "S · 3cm" : cfg.recommendedSize === "M" ? "M · 5cm" : "L · 8cm";

  return (
    <div
      onClick={() => toggleBodyPart(partKey)}
      style={{
        flex: "1 1 0", minWidth: 64, maxWidth: 120,
        border: `2px solid ${selected ? "#f59e0b" : "#e5e7eb"}`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        background: "#fff", transition: "all 0.15s", position: "relative",
        boxShadow: selected ? "0 0 0 2px #fef3c7" : "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BODY_PART_IMGS[partKey]}
        alt={cfg.label}
        style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", background: "#f3f4f6", display: "block" }}
        loading="lazy"
      />
      <div style={{ padding: "4px 4px 5px", textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{cfg.label}</div>
        <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600, marginTop: 1 }}>{sizeLabel}</div>
      </div>
      {selected && (
        <div style={{
          position: "absolute", top: 4, right: 4, width: 15, height: 15,
          background: "#f59e0b", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 8,
        }}>✓</div>
      )}
    </div>
  );
}

// ─── 主页组件 ────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const {
    phase, setPhase,
    petName,
    originalUrl,
    selectedStyles,
    generationResults,
    removedBgUrl, bgRemoveStatus, bgRemoveError,
    setGenResult, setCurrentStyleKey,
    setSelectedSize,
    selectedBodyParts,
    reset,
  } = useEditorStore();

  const generationStartedRef = useRef(false);

  // phase → 步骤序号（1-based）
  const activeStep = phase === "upload" ? 1 : phase === "style" ? 2 : phase === "waiting" ? 3 : 4;

  // 摘要文案
  const summaries = [
    originalUrl ? "照片已上传" : "",
    selectedStyles.length > 0 ? selectedStyles.map(k => STYLE_CONFIGS[k].label).join("、") : "",
    selectedStyles.length > 0 ? `${selectedStyles.length} 种风格` : "",
    "",
  ];

  // 预选推荐尺寸
  const applyRecommendedSize = useCallback(() => {
    if (selectedBodyParts.length === 0) return;
    const recommended = BODY_PART_CONFIG[selectedBodyParts[0]].recommendedSize;
    setSelectedSize(recommended);
  }, [selectedBodyParts, setSelectedSize]);

  // 并行触发生成
  const triggerGeneration = useCallback(
    async (imageUrl: string) => {
      if (generationStartedRef.current) return;
      generationStartedRef.current = true;
      const { petName: name, originalUrl: origUrl, selectedStyles: styles } = useEditorStore.getState();
      styles.forEach((key) => setGenResult(key, { status: "pending" }));
      await Promise.all(
        styles.map(async (key) => {
          try {
            const url = await stylize(imageUrl, key, origUrl ?? undefined, name || undefined);
            setGenResult(key, { status: "done", url });
          } catch (e) {
            setGenResult(key, { status: "error", error: e instanceof Error ? e.message : "生成失败" });
          }
        })
      );
    },
    [setGenResult]
  );

  // 进入 waiting 页后：
  //   始终等抠图完成再触发风格化（抠图结果更干净，效果更好）
  //   抠图完成 → 立刻用抠图结果
  //   抠图失败 / 超时（150s）→ fallback 原图，不卡住用户
  const BG_REMOVE_TIMEOUT_MS = 150_000; // BiRefNet cold start 最长约 90s，给 150s 余量
  useEffect(() => {
    if (phase !== "waiting") return;
    if (generationStartedRef.current) return;

    const start = Date.now();
    let cancelled = false;

    const tryStart = () => {
      if (cancelled || generationStartedRef.current) return;
      const { bgRemoveStatus: s, removedBgUrl: rbUrl, originalUrl: origUrl } = useEditorStore.getState();

      if (s === "done" && rbUrl) {
        // 抠图完成，用最优质量图片生成
        triggerGeneration(rbUrl);
        return;
      }
      if (s === "error" || Date.now() - start >= BG_REMOVE_TIMEOUT_MS) {
        // 抠图失败 或 150s 超时 → fallback 原图
        console.warn("[waiting] 抠图未完成，fallback 原图. status:", s, "elapsed:", Date.now() - start);
        if (origUrl) triggerGeneration(origUrl);
        return;
      }
      // 抠图还在跑，每 500ms 轮询一次
      setTimeout(tryStart, 500);
    };

    tryStart();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]); // 只监听 phase 变化，生成只触发一次

  const allSettled = selectedStyles.length > 0 &&
    selectedStyles.every(k => generationResults[k].status === "done" || generationResults[k].status === "error");
  const doneCount = selectedStyles.filter(k => generationResults[k].status === "done").length;

  const handleGoToResult = useCallback(() => {
    applyRecommendedSize();
    const firstDone = selectedStyles.find(k => generationResults[k].status === "done");
    if (firstDone) setCurrentStyleKey(firstDone);
    setPhase("done");
    router.push("/result");
  }, [applyRecommendedSize, selectedStyles, generationResults, setCurrentStyleKey, setPhase, router]);

  const handleUploaded = useCallback((_file: File, _preview: string) => {
    setTimeout(() => setPhase("style"), 500);
  }, [setPhase]);

  const handleConfirmStyles = useCallback(() => {
    generationStartedRef.current = false; // 重置，允许 useEffect 触发
    setPhase("waiting"); // phase 变化 → useEffect 触发生成
  }, [setPhase]);

  const handleReset = useCallback(() => {
    generationStartedRef.current = false;
    reset();
    setPhase("upload");
  }, [reset, setPhase]);

  return (
    <>
      {/* ── 桌面端左侧栏 (≥768px) ── */}
      <div className="hidden md:block">
        <DesktopStepper
          activeStep={activeStep}
          summaries={summaries}
          showRestart={phase === "done"}
          onRestart={handleReset}
        />
      </div>

      {/* ── 手机端顶部步骤条 (<768px) ── */}
      <div className="block md:hidden">
        <MobileTopBar activeStep={activeStep} summaries={summaries} />
      </div>

      {/* ── 主内容区 ── */}
      <div className="md:ml-[220px] min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col animate-phase-in">

          {/* ════ 上传页 ════ */}
          {phase === "upload" && (
            <div className="flex-1 flex flex-col">
              <Uploader onUploaded={handleUploaded} />
            </div>
          )}

          {/* ════ 风格选择页 ════ */}
          {phase === "style" && (
            <div className="flex-1 flex flex-col" style={{ maxWidth: "100%" }}>
              <div className="flex-1 overflow-y-auto" style={{ paddingTop: 0 }}>
                <div style={{ padding: "0 24px" }}>
                  {/* 顶部标题行 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 10px" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>选择纹身风格</div>
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>选择适合宝贝的1–3种纹身风格</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 12, fontWeight: 600,
                        color: selectedStyles.length >= 3 ? "#ef4444" : "#f59e0b",
                        background: selectedStyles.length >= 3 ? "#fef2f2" : "#fffbf0",
                        border: `1px solid ${selectedStyles.length >= 3 ? "#fecaca" : "#fde68a"}`,
                        borderRadius: 999, padding: "3px 10px",
                      }}>
                        已选 {selectedStyles.length} / 3 种
                      </span>
                      <button
                        onClick={handleReset}
                        style={{ background: "none", border: "none", fontSize: 13, color: "#9ca3af", cursor: "pointer" }}
                      >
                        重新上传
                      </button>
                    </div>
                  </div>
                  <StyleGrid />
                  <div style={{ height: 120 }} />
                </div>
              </div>
              {/* 底部固定按钮 */}
              <div style={{
                position: "sticky", bottom: 0,
                background: "linear-gradient(to top, #faf6f0 75%, transparent)",
                padding: "12px 24px 24px",
              }}>
                <button
                  onClick={handleConfirmStyles}
                  disabled={selectedStyles.length === 0}
                  style={{
                    width: "100%", padding: 16,
                    background: selectedStyles.length > 0 ? "#f59e0b" : "#e5e7eb",
                    color: selectedStyles.length > 0 ? "#fff" : "#9ca3af",
                    border: "none", borderRadius: 16,
                    fontSize: 16, fontWeight: 700, cursor: selectedStyles.length > 0 ? "pointer" : "not-allowed",
                    transition: "background 0.2s",
                  }}
                >
                  {selectedStyles.length === 0 ? "请先选择至少 1 种风格" : `确认风格，开始生成 → (${selectedStyles.length} 种)`}
                </button>
              </div>
            </div>
          )}

          {/* ════ 等待页 ════ */}
          {phase === "waiting" && (
            <div className="flex-1 flex flex-col" style={{ padding: "0 24px" }}>
              <div className="flex-1 overflow-y-auto">

                {/* 抠图失败提示 */}
                {bgRemoveStatus === "error" && bgRemoveError && (
                  <div style={{
                    margin: "16px 0", padding: "14px 20px",
                    background: "#fff5f5", border: "1px solid #fecaca",
                    borderRadius: 16, fontSize: 14, color: "#ef4444", textAlign: "center",
                  }}>
                    ❌ 抠图失败：{bgRemoveError}
                    <button
                      onClick={() => { generationStartedRef.current = false; setPhase("style"); }}
                      style={{ marginLeft: 8, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}
                    >
                      返回重试
                    </button>
                  </div>
                )}

                {/* 上区：进度 */}
                <div style={{ padding: "20px 0 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>
                    {allSettled ? "全部完成！🎉" : "正在勾勒毛孩子的灵魂轮廓…"}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                    {allSettled ? "快去看看你家主子的纹身效果吧" : "约 1-3 分钟，还请耐心等待"}
                  </div>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, marginTop: 6 }}>
                    已完成 {doneCount} / {selectedStyles.length} 种
                  </div>
                  {/* 抠图进度提示 */}
                  {!allSettled && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      marginTop: 8, fontSize: 11, color: "#9ca3af",
                      background: "#f9fafb", border: "1px solid #e5e7eb",
                      borderRadius: 20, padding: "3px 10px",
                    }}>
                      {bgRemoveStatus === "pending" && <span className="animate-pulse-slow">⏳</span>}
                      {bgRemoveStatus === "done" && <span>✅</span>}
                      {bgRemoveStatus === "error" && <span>⚠️</span>}
                      <span>
                        {bgRemoveStatus === "pending" && "正在精细处理毛发，完成后立即开始生成…"}
                        {bgRemoveStatus === "done"    && "毛发处理完成，已用高精度版本生成"}
                        {bgRemoveStatus === "error"   && "精细处理失败，已用原图生成（效果略降）"}
                        {bgRemoveStatus === "idle"    && "准备开始…"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 原图 → 结果卡片 */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, overflowX: "auto", justifyContent: "center" }} className="scrollbar-hide">
                  {originalUrl && (
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>原图</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={originalUrl} alt="原图"
                        style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 14, border: "2px solid #e5e7eb", display: "block", background: "#f3f4f6" }}
                      />
                    </div>
                  )}
                  <div style={{ fontSize: 20, color: "#d1d5db", flexShrink: 0 }}>→</div>
                  {selectedStyles.map(key => <GenCard key={key} styleKey={key} />)}
                </div>

                {/* 下区：部位选择 */}
                <div style={{
                  background: "#fff", borderRadius: 20,
                  border: "1px solid #f0f0f0", padding: 16, marginTop: 16,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
                    📍 趁等待，先选一下打算纹在哪里？
                  </div>
                  <div style={{ display: "flex", flexDirection: "row", flexWrap: "nowrap", gap: 8, overflowX: "auto", paddingBottom: 4 }} className="scrollbar-hide">
                    {ALL_BODY_PARTS.map(part => <BodyCardW key={part} partKey={part} />)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10, padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    📐 选部位仅用于智能推荐打印大小，不影响图片内容
                  </div>
                </div>

                <div style={{ height: 20 }} />
              </div>

              {/* 底部：查看结果按钮 */}
              <div style={{
                position: "sticky", bottom: 0,
                background: "linear-gradient(to top, #faf6f0 75%, transparent)",
                padding: "12px 0 24px",
              }}>
                <button
                  onClick={handleGoToResult}
                  disabled={!allSettled}
                  className={allSettled ? "animate-btn-pop" : ""}
                  style={{
                    width: "100%", padding: 16,
                    background: allSettled ? "#f59e0b" : "#e5e7eb",
                    color: allSettled ? "#fff" : "#9ca3af",
                    border: "none", borderRadius: 16,
                    fontSize: 16, fontWeight: 700,
                    cursor: allSettled ? "pointer" : "not-allowed",
                    transition: "background 0.3s, color 0.3s",
                  }}
                >
                  {allSettled ? "查看全部结果 →" : `结果生成中… (${doneCount}/${selectedStyles.length})`}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
