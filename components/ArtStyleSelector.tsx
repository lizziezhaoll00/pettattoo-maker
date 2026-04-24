"use client";

import { useState } from "react";
import { ArtStyle, useEditorStore } from "@/store/editorStore";
import { stylize } from "@/lib/stylize";
import LoadingCat from "./LoadingCat";

// 🚧 Mock 示例图：用同一只猫的三种风格效果图占位
// 等 Replicate 接通后替换为真实生成的图片
const STYLE_PREVIEW_IMAGES: Record<ArtStyle, string> = {
  lineart:
    "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&q=80&sat=-100&con=50",
  watercolor:
    "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=300&q=80",
  cartoon:
    "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=300&q=80",
};

const STYLES: {
  key: ArtStyle;
  emoji: string;
  label: string;
  desc: string;
}[] = [
  { key: "lineart", emoji: "✏️", label: "线稿风", desc: "极简黑白，纹身经典款" },
  { key: "watercolor", emoji: "🎨", label: "水彩风", desc: "颜色通透，小红书出片" },
  { key: "cartoon", emoji: "🐱", label: "漫画风", desc: "萌感十足，卡通主子" },
];

export default function ArtStyleSelector() {
  const [hoveredStyle, setHoveredStyle] = useState<ArtStyle | null>(null);

  const {
    removedBgUrl,
    stylizedUrls,
    isStylizing,
    stylizeErrors,
    selectedArtStyle,
    setSelectedArtStyle,
    setStylizedUrl,
    setIsStylizing,
    setStylizeError,
  } = useEditorStore();

  const handleSelectStyle = async (style: ArtStyle) => {
    setSelectedArtStyle(style);
    if (stylizedUrls[style]) return;
    if (!removedBgUrl) return;

    setIsStylizing(style, true);
    setStylizeError(style, null);

    try {
      const url = await stylize(removedBgUrl, style);
      setStylizedUrl(style, url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "风格化失败，请重试";
      setStylizeError(style, msg);
    } finally {
      setIsStylizing(style, false);
    }
  };

  const currentUrl = stylizedUrls[selectedArtStyle];
  const currentLoading = isStylizing[selectedArtStyle];
  const currentError = stylizeErrors[selectedArtStyle];
  const currentStyleConfig = STYLES.find((s) => s.key === selectedArtStyle)!;

  return (
    <div className="flex flex-col gap-4">
      {/* 风格选择卡片 */}
      <div className="flex gap-2">
        {STYLES.map((s) => {
          const isSelected = selectedArtStyle === s.key;
          const isHovered = hoveredStyle === s.key;
          const showPreview = isHovered; // Hover 时展示示例图，替换文案

          return (
            <button
              key={s.key}
              onClick={() => handleSelectStyle(s.key)}
              onMouseEnter={() => setHoveredStyle(s.key)}
              onMouseLeave={() => setHoveredStyle(null)}
              // 移动端用 touch 模拟 hover
              onTouchStart={() => setHoveredStyle(s.key)}
              onTouchEnd={() => setHoveredStyle(null)}
              className={`
                relative flex-1 rounded-2xl border-2 overflow-hidden
                transition-all duration-200
                ${isSelected
                  ? "border-amber-400 ring-2 ring-amber-100"
                  : "border-gray-200 hover:border-amber-300"
                }
              `}
              style={{ aspectRatio: "1 / 1.1" }}
            >
              {/* 示例图层（Hover 时显示） */}
              <div
                className={`absolute inset-0 transition-opacity duration-200 ${
                  showPreview ? "opacity-100" : "opacity-0"
                }`}
              >
                <img
                  src={STYLE_PREVIEW_IMAGES[s.key]}
                  alt={`${s.label}示例`}
                  className="w-full h-full object-cover"
                />
                {/* 半透明遮罩 + 标签，让图片不会太抢眼 */}
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent py-2 px-2">
                  <span className="text-white text-xs font-semibold">{s.label} 示例效果</span>
                </div>
              </div>

              {/* 文案层（默认显示，Hover 时淡出） */}
              <div
                className={`
                  absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2
                  transition-opacity duration-200
                  ${showPreview ? "opacity-0" : "opacity-100"}
                  ${isSelected ? "bg-amber-50" : "bg-white"}
                `}
              >
                <span className="text-2xl">{s.emoji}</span>
                <span className={`text-sm font-semibold ${isSelected ? "text-amber-700" : "text-gray-700"}`}>
                  {s.label}
                </span>
                <span className="text-[11px] text-gray-400 leading-tight text-center">
                  {s.desc}
                </span>
              </div>

              {/* 选中勾 */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center text-white text-xs z-10 shadow">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 生成结果预览区 */}
      <div
        className="rounded-2xl min-h-48 flex items-center justify-center overflow-hidden border border-gray-100"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
          backgroundColor: "#f5f5f5",
        }}
      >
        {currentLoading ? (
          <LoadingCat text={`正在生成${currentStyleConfig.label}`} />
        ) : currentError ? (
          <div className="text-center px-4">
            <p className="text-sm text-red-500 mb-2">{currentError}</p>
            <button
              onClick={() => handleSelectStyle(selectedArtStyle)}
              className="text-sm text-amber-600 underline"
            >
              重试
            </button>
          </div>
        ) : currentUrl ? (
          <img
            src={currentUrl}
            alt={currentStyleConfig.label}
            className="max-w-full max-h-64 object-contain rounded-xl"
          />
        ) : (
          <div className="text-center text-gray-400 py-8">
            <div className="text-4xl mb-2">{currentStyleConfig.emoji}</div>
            <p className="text-sm">点击风格卡片开始生成</p>
            <p className="text-xs text-gray-300 mt-1">悬停卡片可预览效果</p>
          </div>
        )}
      </div>
    </div>
  );
}
