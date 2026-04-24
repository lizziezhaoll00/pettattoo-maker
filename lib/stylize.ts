import { ArtStyle } from "@/store/editorStore";

// 各风格对应的 CSS filter 字符串
// Canvas 的 ctx.filter 和 CSS filter 语法完全一致
const STYLE_FILTERS: Record<ArtStyle, string> = {
  // 线稿：去色 + 高对比度 + 反相（让暗部变线条）
  lineart: "grayscale(1) contrast(4) brightness(1.2)",
  // 水彩：轻微模糊 + 高饱和 + 稍微提亮
  watercolor: "saturate(2) brightness(1.1) contrast(0.9)",
  // 卡通：极高饱和 + 高对比度，色块感强
  cartoon: "saturate(3) contrast(1.4) brightness(1.0)",
};

/**
 * 用前端 Canvas 对透明 PNG 做风格化滤镜
 * Canvas 天然保留 alpha 通道，完全不需要服务端处理
 */
export async function stylize(
  imageUrl: string,
  style: ArtStyle
): Promise<string> {
  const filter = STYLE_FILTERS[style];

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d")!;

      // 应用 CSS filter，Canvas 会保留原图的 alpha 通道
      ctx.filter = filter;
      ctx.drawImage(img, 0, 0);

      // 线稿风额外处理：用 destination-out 把浅灰区域变透明感更强
      // （可选，目前靠 contrast 已经够用）

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageUrl;
  });
}
