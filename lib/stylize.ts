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
 * 服务端 Node.js 无法访问 blob: URL，需要在发请求前先转换
 */
async function toDataUrl(url: string): Promise<string> {
  // 已经是 data URL 时，也需要合白底处理（可能是带透明通道的 PNG）
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      // 先铺纯白背景：Seedream 图生图对透明/半透明输入效果差，
      // 白底能让模型专注于前景主体，边缘更利落
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

/**
 * 调用服务端 Seedream 5.0 API 进行 AI 风格化（图生图）
 * 失败时自动降级到前端 Canvas filter
 * 通过串行队列防止并发请求导致 DNS/连接超时
 */
export function stylize(imageUrl: string, style: ArtStyle): Promise<string> {
  return enqueue(async () => {
    try {
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
    } catch (err) {
      console.warn("[stylize] Seedream API 失败，降级到 Canvas filter:", err);
      // 降级：使用前端 Canvas CSS filter
      return stylizeWithCanvas(imageUrl, style);
    }
  });
}

// 各风格对应的 CSS filter 字符串（降级方案）
const STYLE_FILTERS: Record<ArtStyle, string> = {
  lineart: "grayscale(1) contrast(4) brightness(1.2)",
  watercolor: "saturate(2) brightness(1.1) contrast(0.9)",
  cartoon: "saturate(3) contrast(1.4) brightness(1.0)",
};

/**
 * 降级方案：前端 Canvas CSS filter
 */
function stylizeWithCanvas(imageUrl: string, style: ArtStyle): Promise<string> {
  const filter = STYLE_FILTERS[style];

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d")!;
      ctx.filter = filter;
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageUrl;
  });
}
