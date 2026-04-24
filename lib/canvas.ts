import { ColorMode, SizeKey, SIZE_CONFIG } from "@/store/editorStore";

/**
 * 给图片加上白边描边
 * 原理：
 *   1. 先把原图偏移若干像素绘制 N 个方向，形成"膨胀"轮廓
 *   2. 用 destination-out 把原图区域抠掉，只留轮廓
 *   3. 把轮廓染成白色（source-in）
 *   4. 最后在白色轮廓上方叠回原图
 * 这样白边只出现在轮廓外侧，不会产生黑边
 */
export function addWhiteBorder(
  img: HTMLImageElement,
  borderPx = 6
): HTMLCanvasElement {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const w = sw + borderPx * 2;
  const h = sh + borderPx * 2;
  const ox = borderPx; // 原图在大画布上的偏移
  const oy = borderPx;

  // Step 1: 在 offscreen canvas 上画出膨胀后的轮廓（把原图向 8 个方向+多圈偏移绘制）
  const outline = document.createElement("canvas");
  outline.width = w;
  outline.height = h;
  const octx = outline.getContext("2d")!;

  const steps = Math.ceil(borderPx / 2);
  for (let r = 1; r <= steps; r++) {
    const d = r * 2;
    for (let dx = -d; dx <= d; dx += d) {
      for (let dy = -d; dy <= d; dy += d) {
        octx.drawImage(img, ox + dx, oy + dy);
      }
    }
    // 水平 / 垂直方向补充
    octx.drawImage(img, ox + d, oy);
    octx.drawImage(img, ox - d, oy);
    octx.drawImage(img, ox, oy + d);
    octx.drawImage(img, ox, oy - d);
  }

  // Step 2: destination-out 把原图区域抠掉，只保留外轮廓
  octx.globalCompositeOperation = "destination-out";
  octx.drawImage(img, ox, oy);
  octx.globalCompositeOperation = "source-over";

  // Step 3: source-in 把轮廓染成纯白
  const white = document.createElement("canvas");
  white.width = w;
  white.height = h;
  const wctx = white.getContext("2d")!;
  wctx.drawImage(outline, 0, 0);
  wctx.globalCompositeOperation = "source-in";
  wctx.fillStyle = "white";
  wctx.fillRect(0, 0, w, h);

  // Step 4: 合成最终结果：白色轮廓 + 原图
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(white, 0, 0);       // 白色轮廓层
  ctx.drawImage(img, ox, oy);       // 原图层（覆盖在上方）

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
