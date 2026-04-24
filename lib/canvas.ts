import { ColorMode, SizeKey, SIZE_CONFIG } from "@/store/editorStore";

/**
 * 给图片 URL 加上白边描边（膨胀算法）
 * 返回带白边的 canvas dataURL
 */
export function addWhiteBorder(
  img: HTMLImageElement,
  borderPx = 3
): HTMLCanvasElement {
  const w = img.naturalWidth + borderPx * 2;
  const h = img.naturalHeight + borderPx * 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // 用 shadow 模拟描边（最简单方案，效果好）
  ctx.shadowColor = "white";
  ctx.shadowBlur = borderPx * 2;
  // 多次绘制加强白边
  for (let i = 0; i < 4; i++) {
    ctx.drawImage(img, borderPx, borderPx);
  }
  ctx.shadowBlur = 0;
  // 最后再绘制一次原图覆盖（保持清晰）
  ctx.drawImage(img, borderPx, borderPx);

  return canvas;
}

/**
 * 渲染最终 Canvas（含补光/白边/黑白/镜像），并返回用于导出的 Canvas
 */
export function renderFinalCanvas(options: {
  imageUrl: string;
  size: SizeKey;
  colorMode: ColorMode;
  showWhiteBorder: boolean;
  mirror: boolean; // 导出时为 true，预览时为 false
  isRealistic?: boolean; // 写实风时补光 brightness(1.1)
}): Promise<HTMLCanvasElement> {
  const { imageUrl, size, colorMode, showWhiteBorder, mirror, isRealistic = false } = options;
  const targetPx = SIZE_CONFIG[size].px;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Step 1: 加白边（可选）
      const sourceCanvas = showWhiteBorder ? addWhiteBorder(img) : null;
      const sourceImg = sourceCanvas || img;
      const srcW = sourceCanvas ? sourceCanvas.width : img.naturalWidth;
      const srcH = sourceCanvas ? sourceCanvas.height : img.naturalHeight;

      // Step 2: 计算目标尺寸
      // 策略：不强制放大（放大只会模糊），只在原图超过 targetPx 时才等比缩小
      // 免费版 remove.bg 最大约 500px，强制拉到 945px 反而更糊
      const srcMax = Math.max(srcW, srcH);
      const scale = srcMax > targetPx ? targetPx / srcMax : 1;
      const dstW = Math.round(srcW * scale);
      const dstH = Math.round(srcH * scale);

      // Step 3: 创建最终 Canvas
      const canvas = document.createElement("canvas");
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext("2d")!;

      // Step 4: 滤镜
      // - 写实风时补光 brightness(1.1)，无论是否开白边（保证亮度一致）
      // - 黑白模式时增强对比度
      const filters: string[] = [];
      if (isRealistic) filters.push("brightness(1.1)");
      if (colorMode === "bw") filters.push("grayscale(1) contrast(1.4)");
      ctx.filter = filters.length > 0 ? filters.join(" ") : "none";

      // Step 5: 镜像翻转（导出时）
      if (mirror) {
        ctx.translate(dstW, 0);
        ctx.scale(-1, 1);
      }

      // Step 6: 绘制
      if (sourceCanvas) {
        ctx.drawImage(sourceCanvas, 0, 0, dstW, dstH);
      } else {
        ctx.drawImage(img, 0, 0, dstW, dstH);
      }

      resolve(canvas);
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageUrl;
  });
}

/**
 * 导出 Canvas 为 Blob（PNG），并在文件名上标注尺寸
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas 导出失败"));
      },
      "image/png",
      1.0
    );
  });
}

/**
 * 触发浏览器下载
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
