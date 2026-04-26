import https from "https";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ArtStyle = "lineart" | "watercolor" | "cartoon";

// 各风格对应的 Seedream prompt
const STYLE_PROMPTS: Record<ArtStyle, string> = {
  lineart:
    "将图中的宠物转化为专业转印就绪的细线纹身设计、使用细致的开阔排线和点刺来表现真实且适合皮肤的毛发质感、不使用过度密集的交叉排线、高对比度黑墨艺术、极简主义构图、具有明确粗细变化的干净轮廓、纯白背景隔离、高级纹身手稿审美。",
  watercolor:
    "将图中的宠物转化为艺术水彩纹身设计、柔和通透的水彩、细腻的笔触纹理、轻盈的水彩晕染笔触、温柔可爱的插画风、纯白背景隔离、电影级光影、专业级数字水彩杰作。务必保留原图宠物的姿态/脸部/毛发特征。",
  cartoon:
    "将图中的宠物转化为高级萌系贴纸艺术风格，采用日系可爱萌系漫画审美，拥有大胆且粗厚的黑色墨水轮廓线，鲜艳的平涂赛璐珞阴影。夸张且富有灵气的眼睛，可爱的Q版比例。图案外圈带有一层干净的闭合白边，整体在纯白色背景上隔离。高端矢量艺术质感，边缘极其清晰干净，无杂乱线条，无阴影渐变，适合纹身贴纸印刷。",
};

/** 用 Node.js 原生 https/http 下载图片，自动跟随重定向（最多 5 次） */
function downloadImage(
  url: string,
  redirectCount = 0
): Promise<{ data: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("图片下载重定向次数过多"));

    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : require("http");

    lib.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res: import("http").IncomingMessage) => {
        const status = res.statusCode ?? 0;

        // 跟随重定向
        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
          res.resume(); // 丢弃 body
          return downloadImage(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        }

        if (status !== 200) {
          res.resume();
          return reject(new Error(`图片下载失败: ${status}`));
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            data: Buffer.concat(chunks),
            contentType: (res.headers["content-type"] || "image/png").split(";")[0],
          })
        );
      }
    ).on("error", reject);
  });
}

/** 用 Node.js 原生 https POST JSON（单次），绕开 Next.js fetch polyfill 对大 body 的限制 */
function httpsPostOnce(
  url: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; data: string }> {
  const bodyBuf = Buffer.from(body, "utf8");
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { ...headers, "Content-Length": bodyBuf.length },
      },
      (res: import("http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

/** 带重试的 POST，对 DNS/网络抖动自动重试最多 3 次，每次等待递增 */
async function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: string,
  maxRetries = 3
): Promise<{ status: number; data: string }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await httpsPostOnce(url, headers, body);
    } catch (err) {
      lastErr = err;
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("ENOTFOUND") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("ECONNREFUSED"));
      if (!isRetryable || attempt === maxRetries) break;
      const wait = attempt * 1500; // 1.5s, 3s
      console.warn(`[seedream-stylize] 网络抖动，${wait}ms 后重试（第 ${attempt} 次）:`, (err as Error).message);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, style } = (await req.json()) as {
      imageUrl: string;
      style: ArtStyle;
    };

    if (!imageUrl || !style) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK_API_KEY 未配置" }, { status: 500 });
    }

    // 把图片转成 base64（支持 data URL 或外部 URL）
    let imageBase64: string;
    let mimeType = "image/png";

    if (imageUrl.startsWith("data:")) {
      imageBase64 = imageUrl;
    } else {
      // 外部 URL，用 Node.js 原生 https 下载，避免 Next.js fetch polyfill 的问题
      const { data: imgBuf, contentType } = await downloadImage(imageUrl);
      mimeType = contentType;
      const base64 = imgBuf.toString("base64");
      imageBase64 = `data:${mimeType};base64,${base64}`;
    }

    const prompt = STYLE_PROMPTS[style];
    if (!prompt) {
      return NextResponse.json({ error: "不支持的风格" }, { status: 400 });
    }

    const reqBody = JSON.stringify({
      model: "doubao-seedream-5-0-260128",
      prompt,
      image: imageBase64,
      size: "1920x1920",          // 最小合法尺寸（≥ 3,686,400 像素）
      output_format: "png",
      response_format: "b64_json", // 直接返回 base64，避免跨域
      watermark: false,
      sequential_image_generation: "disabled",
    });

    console.log("[seedream-stylize] 开始调用 Seedream API，style:", style);

    // 用 Node.js 原生 https 发请求，避免 Next.js fetch polyfill 对大 body 的问题
    const { status, data: rawData } = await httpsPost(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      reqBody
    );

    if (status !== 200) {
      console.error("[seedream-stylize] API error status:", status, rawData.slice(0, 300));
      return NextResponse.json(
        { error: `Seedream API 错误（${status}）` },
        { status: 500 }
      );
    }

    const result = JSON.parse(rawData);

    if (result.error) {
      console.error("[seedream-stylize] result error:", result.error);
      return NextResponse.json(
        { error: result.error.message || "生成失败" },
        { status: 500 }
      );
    }

    const imageData = result.data?.[0];
    if (!imageData) {
      return NextResponse.json({ error: "未返回图片数据" }, { status: 500 });
    }

    console.log("[seedream-stylize] 成功，style:", style);
    const dataUrl = `data:image/png;base64,${imageData.b64_json}`;
    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("[seedream-stylize]", error);
    const msg = error instanceof Error ? error.message : "风格化服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
