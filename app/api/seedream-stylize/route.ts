import https from "https";
import http from "http";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ArtStyle = "lineart" | "watercolor" | "cartoon";

// 各风格对应的 Seedream prompt
const STYLE_PROMPTS: Record<ArtStyle, string> = {
  lineart:
    "将图中的宠物转化为专业转印就绪的细线纹身手稿。采用明确且富有粗细变化的墨黑线条，利用开阔的平行排线和细腻的点刺（stippling）表现毛发体积感，严禁使用密集的交叉网格排线。构图极简，重点刻画眼睛和鼻头的结构以还原神态。纯白背景隔离，具有高级的复古科学插画与矢量线条质感。高对比度黑墨艺术，高级纹身手稿审美。",
  watercolor:
    "将图中的宠物转化为艺术水彩纹身设计。采用虚实结合的手法：五官与主要轮廓使用柔和的细线固定，躯干毛发采用通透、半透明的水彩晕染。笔触轻盈灵动，伴有自然的艺术墨滴喷溅，色彩明快不脏。务必保留原图宠物的神态/脸部/毛发特征（尤其是眼睛的眼神光）。纯白背景隔离，整体呈现出电影级的光影氛围与高端艺术纸质感。",
  cartoon:
    "将图中的宠物转化为高级萌系贴纸艺术。采用日系Q版（Chibi）审美，夸张其灵动的眼神，缩小身体比例，捕捉性格精髓。拥有大胆且极其干净的闭合粗黑轮廓线，采用纯粹的平涂赛璐珞阴影（Flat cell shading），严禁任何形式的纹理或杂色。图案外圈带有一层均匀的、厚度约2px的闭合白边。纯白色背景，高端矢量艺术质感，边缘极其清晰干净，无杂乱线条，无阴影渐变，适合纹身贴纸印刷。",
};

/** 用 Node.js 原生 https/http 下载图片，自动跟随重定向（最多 5 次） */
function downloadImage(
  url: string,
  redirectCount = 0
): Promise<{ data: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("图片下载重定向次数过多"));

    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

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

    // 当前使用 doubao-seedream-4-5-251128（5.0 无免费额度，临时切换）
    // 恢复 5.0 时改回 "doubao-seedream-5-0-260128"
    // 4.5 与 5.0 参数完全相同：size="2K"（大写），response_format="url"
    const reqBody = JSON.stringify({
      model: "doubao-seedream-4-5-251128",
      prompt,
      image: imageBase64,
      size: "2K",                              // 4.5 / 5.0 均用大写枚举
      response_format: "url",                  // 返回图片 URL，服务端再下载
      sequential_image_generation: "disabled", // 生成单张图（非组图）
      stream: false,
      watermark: false,                        // 关闭水印
    });

    console.log("[seedream-stylize] 开始调用 Seedream 4.5 API，style:", style);

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

    // response_format="url" 时返回图片 URL，用 Node.js https 下载后转 base64 返回给前端
    // （前端是浏览器，不能直接访问火山 CDN；服务端中转避免跨域）
    const imgUrl = imageData.url;
    if (!imgUrl) {
      return NextResponse.json({ error: "未返回图片 URL" }, { status: 500 });
    }
    const { data: imgBuf, contentType } = await downloadImage(imgUrl);
    const b64 = imgBuf.toString("base64");
    const dataUrl = `data:${contentType};base64,${b64}`;
    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("[seedream-stylize]", error);
    const msg = error instanceof Error ? error.message : "风格化服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
