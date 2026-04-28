import { ArtStyle } from "@/store/editorStore";

/**
 * 简单串行队列：同时只允许一个 Seedream 请求在飞行，防止并发导致 DNS/连接超时
 */
let stylizeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = stylizeQueue.then(task);
  // 把队列推进，忽略错误（错误由 result 的调用方处理）
  stylizeQueue = result.then(
    () => {},
    () => {}
  );
  return result;
}

/**
 * 把任意图片 URL（包括 blob:）在浏览器端转成 data: URL
 * - 背景策略：先铺纯白，再叠一层极淡灰色边框辅助（仅覆盖透明区域）
 *   → 白猫毛发在白底上渲染为白色（正确），Seedream 通过整体构图识别主体
 *   → 之前用 #e8e8e8 全面铺底，导致白猫/浅色猫咪半透明毛发区域被染灰
 * - 等比压缩至最长边 ≤ 1024px（防止 body 超过 Vercel 4.5MB 限制）
 * 服务端 Node.js 无法访问 blob: URL，需要在发请求前先转换
 */
async function toDataUrl(url: string, maxSide = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      // 等比缩放，不放大
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d")!;

      // 1. 铺纯白底——透明区域变白，白色毛发保持白色，不会被灰色污染
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, dw, dh);

      // 2. 绘制宠物主体（透明 PNG 叠在白底上）
      ctx.drawImage(img, 0, 0, dw, dh);

      // 3. 在四周加一圈极淡灰色边框（8px），帮助 Seedream 识别画面边界
      //    只影响边框区域，不影响主体颜色
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#888888";
      const b = 8;
      ctx.fillRect(0, 0, dw, b);         // 上
      ctx.fillRect(0, dh - b, dw, b);    // 下
      ctx.fillRect(0, 0, b, dh);         // 左
      ctx.fillRect(dw - b, 0, b, dh);    // 右
      ctx.globalAlpha = 1;

      resolve(canvas.toDataURL("image/jpeg", 0.9)); // JPEG 压缩，比 PNG 体积小 3-5x
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

/**
 * 调用服务端 Seedream 5.0 API 进行 AI 风格化（图生图）
 * 失败时直接抛出错误，由 editor page 展示"失败 + 点击重试"
 * 通过串行队列防止并发请求导致 DNS/连接超时
 */
export function stylize(imageUrl: string, style: ArtStyle): Promise<string> {
  return enqueue(async () => {
    // blob: URL 只在浏览器里有效，服务端无法访问，必须先转成 data: URL
    const dataUrl = await toDataUrl(imageUrl);

    const res = await fetch("/api/seedream-stylize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: dataUrl, style }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "未知错误" }));
      throw new Error(error || `请求失败 ${res.status}`);
    }

    const { url } = await res.json();
    if (!url) throw new Error("未返回图片 URL");
    return url;
  });
}


