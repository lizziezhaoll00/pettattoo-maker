"use client";

import { StyleKey, ALL_STYLE_KEYS, useEditorStore } from "@/store/editorStore";

// ─── 风格配置（来自 StyleGuide.md + 原型同款图片） ─────────
export const STYLE_CONFIGS: Record<
  StyleKey,
  { label: string; desc: string; previewImg: string }
> = {
  watercolor:     { label: "水彩晕染风",   desc: "通透浪漫｜色彩晕染｜灵动如梦",       previewImg: "/style-previews/watercolor.png" },
  outline:        { label: "极简单线风",   desc: "一笔勾勒｜留白极简｜低调优雅",       previewImg: "/style-previews/outline.png" },
  cartoon:        { label: "插画卡通风",   desc: "萌感爆表｜Q版卡通｜活泼可爱",       previewImg: "/style-previews/cartoon.png" },
  kawaii:         { label: "萌系贴纸风",   desc: "日韩手绘｜糖果色系｜治愈满分",       previewImg: "/style-previews/kawaii.png" },
  lineart:        { label: "素描手绘风",   desc: "铅笔质感｜交叉排线｜艺术范儿",       previewImg: "/style-previews/lineart.png" },
  realism:        { label: "微写实风",     desc: "毛发毕现｜眼神传神｜像照片一样真",   previewImg: "/style-previews/realism.png" },
  neotraditional: { label: "美式新传统",   desc: "浓郁配色｜华丽花卉｜复古肖像",       previewImg: "/style-previews/neotraditional.png" },
  geometric:      { label: "几何解构风",   desc: "半写实半多边形｜现代感极强",         previewImg: "/style-previews/geometric.png" },
  dotwork:        { label: "点刺肌理风",   desc: "疏密点阵｜颗粒磨砂｜静谧高级感",     previewImg: "/style-previews/dotwork.png" },
};

export default function StyleGrid() {
  const { selectedStyles, toggleStyle } = useEditorStore();
  const maxReached = selectedStyles.length >= 3;

  return (
    <div style={{
      display: "grid",
      gap: 8,
      // 桌面 5 列，平板 4 列，手机 3 列
      gridTemplateColumns: "repeat(5, 1fr)",
    }}
    className="style-grid-responsive"
    >
      <style>{`
        .style-grid-responsive { grid-template-columns: repeat(5, 1fr); }
        @media (max-width: 767px) { .style-grid-responsive { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 479px) { .style-grid-responsive { grid-template-columns: repeat(3, 1fr); } }
      `}</style>

      {ALL_STYLE_KEYS.map((key) => {
        const cfg = STYLE_CONFIGS[key];
        // 防御：浏览器缓存了旧版 store key（如 woodcut）时跳过
        if (!cfg) return null;
        const isSelected = selectedStyles.includes(key);
        const isDisabled = !isSelected && maxReached;

        return (
          <div
            key={key}
            onClick={() => !isDisabled && toggleStyle(key)}
            style={{
              border: `2px solid ${isSelected ? "#f59e0b" : "#e5e7eb"}`,
              borderRadius: 16,
              overflow: "hidden",
              cursor: isDisabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              position: "relative",
              background: "#fff",
              opacity: isDisabled ? 0.4 : 1,
              boxShadow: isSelected ? "0 0 0 3px #fef3c7" : "none",
            }}
            onMouseEnter={e => !isDisabled && ((e.currentTarget as HTMLDivElement).style.borderColor = "#fcd34d")}
            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = isSelected ? "#f59e0b" : "#e5e7eb")}
          >
            {/* 示意图 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cfg.previewImg}
              alt={cfg.label}
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", background: "#f3f4f6", display: "block" }}
              loading="lazy"
            />

            {/* 文字区 */}
            <div style={{ padding: "5px 7px 8px" }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: "#1a1a1a",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {cfg.label}
              </div>
              <div style={{
                fontSize: 10, color: "#6b7280", marginTop: 2, lineHeight: 1.3,
                display: "-webkit-box", WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {cfg.desc}
              </div>
            </div>

            {/* 选中角标 */}
            {isSelected && (
              <div style={{
                position: "absolute", top: 8, right: 8,
                width: 22, height: 22, background: "#f59e0b",
                borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 12,
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }}>
                ✓
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
