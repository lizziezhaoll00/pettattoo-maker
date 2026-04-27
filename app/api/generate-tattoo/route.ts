import https from "https";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/** Node.js 原生 https/http 下载图片，自动跟随重定向（最多 5 次） */
function downloadImage(
  url: string,
  redirectCount = 0
): Promise<{ data: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("图片下载重定向次数过多"));
    const parsed = new URL(url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = parsed.protocol === "https:" ? https : require("http");
    lib.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      (res: import("http").IncomingMessage) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
          res.resume();
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

/** 带重试的 POST（429 限流 + 网络抖动自动重试） */
async function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: string,
  maxRetries = 4
): Promise<{ status: number; data: string }> {
  let lastResult: { status: number; data: string } | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await httpsPostOnce(url, headers, body);
      if (result.status === 429) {
        lastResult = result;
        if (attempt === maxRetries) break;
        await new Promise((r) => setTimeout(r, attempt * 3000));
        continue;
      }
      return result;
    } catch (err) {
      lastErr = err;
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("ENOTFOUND") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("ECONNREFUSED"));
      if (!isRetryable || attempt === maxRetries) break;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  if (lastResult) return lastResult;
  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, tattooPrompt, schemeId } = (await req.json()) as {
      imageUrl: string;      // 抠图后加灰底合成的 data URL
      tattooPrompt: string;  // 方案专属 prompt
      schemeId?: string;     // 日志追踪用
    };

    if (!imageUrl || !tattooPrompt) {
      return NextResponse.json({ error: "缺少参数 imageUrl 或 tattooPrompt" }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK_API_KEY 未配置" }, { status: 500 });
    }

    // 支持 data URL 或外部 URL
    let imageBase64: string;
    if (imageUrl.startsWith("data:")) {
      imageBase64 = imageUrl;
    } else {
      const { data: imgBuf, contentType } = await downloadImage(imageUrl);
      imageBase64 = `data:${contentType};base64,${imgBuf.toString("base64")}`;
    }

    const reqBody = JSON.stringify({
      model: "doubao-seedream-4-5-251128",
      prompt: tattooPrompt,
      image: imageBase64,
      size: "2K",
      response_format: "url",
      watermark: false,
      stream: false,
      sequential_image_generation: "disabled",
    });

    console.log("[generate-tattoo] schemeId:", schemeId ?? "(unknown)", "| prompt:", tattooPrompt.slice(0, 80));

    const { status, data: rawData } = await httpsPost(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      reqBody
    );

    if (status !== 200) {
      console.error("[generate-tattoo] API error:", status, rawData.slice(0, 300));
      return NextResponse.json({ error: `Seedream API 错误（${status}）` }, { status: 500 });
    }

    const result = JSON.parse(rawData);
    if (result.error) {
      return NextResponse.json({ error: result.error.message || "生成失败" }, { status: 500 });
    }

    const imageData = result.data?.[0];
    if (!imageData) {
      return NextResponse.json({ error: "未返回图片数据" }, { status: 500 });
    }

    // 下载并转 base64，避免跨域
    const imgUrl = imageData.url as string;
    const { data: imgBuf, contentType } = await downloadImage(imgUrl);
    const dataUrl = `data:${contentType};base64,${imgBuf.toString("base64")}`;

    console.log("[generate-tattoo] 成功，schemeId:", schemeId ?? "(unknown)");
    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("[generate-tattoo]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "纹身生成服务异常" },
      { status: 500 }
    );
  }
}
