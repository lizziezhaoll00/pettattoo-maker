"use client";

import { useState } from "react";
import { useEditorStore, SIZE_CONFIG } from "@/store/editorStore";
import { renderFinalCanvas, canvasToBlob, downloadBlob } from "@/lib/canvas";

interface DownloadModalProps {
  onClose: () => void;
  imageUrl: string;
}

const TIPS = [
  { icon: "🖨️", title: "使用纹身转印纸", desc: "请购买专用纹身转印纸，普通打印纸无法使用" },
  { icon: "📐", title: "打印时设置实际尺寸", desc: "打印机设置选「实际大小」或「100%」，不要选「适应页面」" },
  { icon: "🔄", title: "已自动镜像翻转", desc: "导出图已自动水平翻转，贴在皮肤上方向会正确" },
  { icon: "💧", title: "贴纸使用方法", desc: "湿润皮肤 → 贴上纹身纸（图案朝下）→ 按压 30 秒 → 慢慢揭开" },
];

export default function DownloadModal({ onClose, imageUrl }: DownloadModalProps) {
  const { selectedSize, colorMode, showWhiteBorder, selectedBase } = useEditorStore();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const canvas = await renderFinalCanvas({
        imageUrl,
        size: selectedSize,
        colorMode,
        showWhiteBorder,
        mirror: true,
        isRealistic: selectedBase === "realistic",
      });
      const blob = await canvasToBlob(canvas);
      const sizeLabel = SIZE_CONFIG[selectedSize].cm;
      downloadBlob(blob, `pettattoo_${sizeLabel}cm_300dpi_mirror.png`);
      onClose();
    } catch (e) {
      alert("导出失败，请重试");
      console.error(e);
    } finally {
      setLoading(false);
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
        <div className="mx-6 mb-4 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>导出尺寸</span>
            <span className="font-medium">{SIZE_CONFIG[selectedSize].label} · {SIZE_CONFIG[selectedSize].desc}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>分辨率</span>
            <span className="font-medium">透明 PNG（最高可用画质）</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>镜像</span>
            <span className="font-medium text-green-600">✅ 已自动翻转</span>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">再看看</button>
          <button onClick={handleDownload} disabled={loading} className="flex-1 py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold transition-colors disabled:opacity-60">
            {loading ? "导出中..." : "确认下载 🐾"}
          </button>
        </div>
      </div>
    </div>
  );
}
