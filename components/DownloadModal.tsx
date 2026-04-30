"use client";

import { useState } from "react";
import JSZip from "jszip";
import { useEditorStore, SIZE_CONFIG, SizeKey, StyleKey } from "@/store/editorStore";
import { renderFinalCanvas, canvasToBlob } from "@/lib/canvas";
import { STYLE_CONFIGS } from "@/components/StyleGrid";

interface DownloadItem {
  key: StyleKey;
  url: string;
}

interface DownloadModalProps {
  onClose: () => void;
  /** 多张风格图（已完成的） */
  items: DownloadItem[];
  /** 宠物名字，用于文件名 */
  petName?: string;
  /** 是否镜像（默认 true）*/
  mirror?: boolean;
  /** 当前选中尺寸（从打印设置面板传入） */
  selectedSize: SizeKey;
}

const TIPS = [
  { icon: "🖨️", title: "使用纹身转印纸", desc: "请购买专用纹身转印纸，普通打印纸无法使用" },
  { icon: "📐", title: "打印时设置实际尺寸", desc: "打印机设置选「实际大小」或「100%」，不要选「适应页面」" },
  { icon: "🔄", title: "已自动镜像翻转", desc: "导出图已自动水平翻转，贴在皮肤上方向会正确" },
  { icon: "💧", title: "贴纸使用方法", desc: "湿润皮肤 → 贴上纹身纸（图案朝下）→ 按压 30 秒 → 慢慢揭开" },
];

const ALL_SIZES: SizeKey[] = ["S", "M", "L"];

export default function DownloadModal({
  onClose,
  items,
  petName,
  mirror = true,
  selectedSize,
}: DownloadModalProps) {
  const { colorMode, showWhiteBorder, squareCrop, cropRect, selectedBase } = useEditorStore();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const namePart = petName ? `_${petName}` : "";
  const isSingle = items.length === 1;

  /** 渲染单个尺寸的 canvas blob */
  async function renderBlob(url: string, size: SizeKey): Promise<Blob> {
    const canvas = await renderFinalCanvas({
      imageUrl: url,
      size,
      colorMode,
      showWhiteBorder,
      squareCrop,
      cropRect: cropRect ?? null,
      mirror,
      isRealistic: selectedBase === "realistic",
    });
    return await canvasToBlob(canvas);
  }

  const handleDownloadAll = async () => {
    setLoading(true);
    try {
      if (isSingle) {
        // 单张：直接下载选中的三个尺寸（原逻辑）
        const item = items[0];
        for (const size of ALL_SIZES) {
          setProgress(`正在导出 ${SIZE_CONFIG[size].label}…`);
          const blob = await renderBlob(item.url, size);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `pettattoo${namePart}_${STYLE_CONFIGS[item.key].label}_${SIZE_CONFIG[size].cm}cm.png`;
          a.click();
          URL.revokeObjectURL(a.href);
          await new Promise(r => setTimeout(r, 300));
        }
      } else {
        // 多张：按选中尺寸打包成 zip
        const zip = new JSZip();
        const folder = zip.folder(`PetTattoo${namePart}`) ?? zip;
        for (const item of items) {
          setProgress(`正在渲染「${STYLE_CONFIGS[item.key].label}」…`);
          const blob = await renderBlob(item.url, selectedSize);
          folder.file(
            `${STYLE_CONFIGS[item.key].label}_${SIZE_CONFIG[selectedSize].cm}cm.png`,
            blob
          );
        }
        setProgress("正在打包 ZIP…");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zipBlob);
        a.download = `PetTattoo${namePart}_全部风格_${SIZE_CONFIG[selectedSize].cm}cm.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      setProgress("");
      onClose();
    } catch (e) {
      alert("导出失败，请重试");
      console.error(e);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100">
          <h2 className="text-lg font-bold text-gray-800">🖨️ 打印前必看</h2>
          <p className="text-sm text-gray-500 mt-0.5">避免浪费纹身纸的小贴士</p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-4">
          {TIPS.map((tip) => (
            <div key={tip.title} className="flex gap-3">
              <span className="text-2xl shrink-0">{tip.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{tip.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 下载内容说明 */}
        <div className="mx-6 mb-4 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600">
          <p className="text-xs font-semibold text-gray-500 mb-2">📦 下载包含</p>
          <div className="flex flex-col gap-1">
            {isSingle ? (
              ALL_SIZES.map((size) => (
                <div key={size} className="flex justify-between">
                  <span>{SIZE_CONFIG[size].label}</span>
                  <span className="font-medium text-gray-700">{SIZE_CONFIG[size].desc} · 已镜像</span>
                </div>
              ))
            ) : (
              items.map((item) => (
                <div key={item.key} className="flex justify-between">
                  <span>✦ {STYLE_CONFIGS[item.key].label}</span>
                  <span className="font-medium text-gray-700">{SIZE_CONFIG[selectedSize].cm}cm · 已镜像</span>
                </div>
              ))
            )}
          </div>
          {!isSingle && (
            <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
              打包为 ZIP 文件，共 {items.length} 张图纸
            </div>
          )}
        </div>

        {/* 进度提示 */}
        {progress && (
          <div className="mx-6 mb-3 text-xs text-amber-600 text-center animate-pulse">{progress}</div>
        )}

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            再看看
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold transition-colors disabled:opacity-60"
          >
            {loading ? "导出中…" : isSingle ? "一键下载全部 🐾" : "打包下载全部 🐾"}
          </button>
        </div>
      </div>
    </div>
  );
}
