import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type ArtStyle = "lineart" | "watercolor" | "cartoon" | "kawaii" | "outline";

// 各风格对应的 Seedream prompt
const STYLE_PROMPTS: Record<ArtStyle, string> = {
  outline:
    "将图中的宠物转化为极简单线轮廓纹身设计（Fine Line Outline style）。【线条规则】全图只使用均匀细线，严禁出现粗细变化、排线填充或阴影色块；线条流畅连贯，呈现「手绘一笔画」的轻盈感。【留白原则】宠物身体内部保持大面积纯白留白，仅用最少的线条勾勒外轮廓和关键体块转折（耳廓、腿部分叉、尾巴收尾），省略所有毛发纹理。【五官】适度保留：眼睛用小实心点或细弧线表达，保留清澈的「眼神光」高光点；鼻子用极小三角或短弧线，整体五官极简但有神。【装饰】可选加入 1-2 个与宠物气质相符的极简装饰元素（如细线爱心、小星星、短虚线、小花朵轮廓），装饰元素必须与宠物轮廓保持呼应，同样使用匀细单线，不喧宾夺主。【整体】构图干净，纯白背景，四周留足白边，呈现极简现代的线条插画审美，适合纹身转印。务必精准还原原图中宠物的整体姿态轮廓与标志性体态特征（耳朵形状、尾巴走势等）。",
  lineart:
    "将图中的宠物转化为专业转印就绪的细线纹身手稿。采用明确且富有粗细变化的墨黑线条，利用开阔的平行排线和细腻的点刺（stippling）表现毛发体积感，严禁使用密集的交叉网格排线。构图极简，重点刻画眼睛和鼻头的结构以还原神态。纯白背景隔离，具有高级的复古科学插画与矢量线条质感。高对比度黑墨艺术，高级纹身手稿审美。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的\"眼神光\"和五官细节。",
  watercolor:
    "将图中的宠物转化为艺术水彩纹身设计。采用虚实结合的手法：五官与面部核心轮廓使用柔和的湿焦笔触勾勒，确保在色彩晕染中依然保持清晰的辨识度。彻底摒弃大面积的纯白与灰色。采用\"负空间\"表现手法，利用主体周围的水洗色层勾勒出宠物的白色边缘。【配色规则】将宠物毛发视为色彩流动的画布，不论宠物原本毛色深浅，必须主动引入艺术性的鲜活色彩，严禁大面积出现纯白或灰白色块。笔触轻盈灵动，伴有自然的艺术墨滴喷溅，色彩明快不脏、不灰、不苍白。纯白背景隔离，整体呈现出电影级的光影氛围与高端艺术纸质感。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的\"眼神光\"和五官细节。",
  cartoon:
    "将图中的宠物转化为高级萌系贴纸艺术。采用日系Q版（Chibi）审美，夸张其灵动的眼神，缩小身体比例，捕捉性格精髓。拥有大胆且极其干净的闭合粗黑轮廓线，采用纯粹的平涂赛璐珞阴影（Flat cell shading），严禁任何形式的纹理或杂色。图案外圈带有一层均匀的、厚度约2px的闭合白边。纯白色背景，高端矢量艺术质感，边缘极其清晰干净，无杂乱线条，无阴影渐变，适合纹身贴纸印刷。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的\"眼神光\"和五官细节。",
  kawaii:
    "将图中的宠物转化为日韩风萌系手绘插画贴纸。【风格核心】整张图必须是「手绘数字插画」风格，绝对禁止出现照片感或写实摄影质感——宠物需被完整插画化，呈现柔和的手绘笔触、简洁的色块光影、带有轮廓线的插画毛发，风格参考韩国宠物手绘定制贴纸。【宠物呈现】还原原图中宠物的毛色、毛发形态与面部神态（尤其是眼睛的眼神光），以插画方式重绘，宠物居中大头特写，头部和上半身为主体，占画布约 60%，外轮廓带白色 die-cut 边框。【装饰融合——关键】3-5 个 Kawaii 小图标（骨头、草莓、纸杯蛋糕、小鱼、星星等）紧贴宠物轮廓边缘有机排布，部分小图标可轻微叠压在宠物身体边缘，形成一个整体融合的贴纸构图，而非四散分离的独立小贴纸。所有装饰图标采用同一插画风格绘制，低饱和糖果配色。【字体】下方排列彩色 3D 胖乎乎泡泡字「My Baby」，每个字母颜色随机，带 3D 立体阴影，膨胀感强。【整体】纯白背景，全图低饱和糖果色系，清新治愈，整体是一个浑然一体的萌系宠物贴纸，而不是照片拼贴。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的\"眼神光\"和五官细节。",
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

/**
 * 把外部图片 URL 或 data: URL 转换为 base64 data URL
 * data: URL 直接返回；外部 URL 用 Node.js 下载后转换
 */
async function toBase64DataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const { data: imgBuf, contentType } = await downloadImage(url);
  return `data:${contentType};base64,${imgBuf.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, originalImageUrl, style, cropHint } = (await req.json()) as {
      /** 抠图后的图片（主图，白底合成），必填 */
      imageUrl: string;
      /** 原始上传图片（可选），有时能帮助模型理解完整的身形 */
      originalImageUrl?: string;
      style: ArtStyle;
      /** analyze-crop 返回的统一提示词，同时用于抠图和风格化 */
      cropHint?: string;
    };

    if (!imageUrl || !style) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK_API_KEY 未配置" }, { status: 500 });
    }

    // --- 1. 准备主图（抠图后，白底合成）base64 ---
    const imageBase64 = await toBase64DataUrl(imageUrl);

    // --- 2. 准备原图（可选）base64 ---
    let originalBase64: string | null = null;
    if (originalImageUrl) {
      try {
        originalBase64 = await toBase64DataUrl(originalImageUrl);
      } catch (e) {
        // 原图加载失败不影响主流程，降级为单图
        console.warn("[seedream-stylize] 原图加载失败，降级单图模式:", (e as Error).message);
      }
    }

    // --- 3. 拼接 prompt ---
    const stylePrompt = STYLE_PROMPTS[style];
    if (!stylePrompt) {
      return NextResponse.json({ error: "不支持的风格" }, { status: 400 });
    }

    // 把 stylizeHint 拼接到 prompt 最前面，明确告知模型主体范围，防止裁剪
    // 当有原图时，补充说明原图的使用规则：只在抠图内容与构图要求有冲突/缺失时才参考原图补全，
    // 原图不作为主要输入，不要引入原图的背景或其他元素
    const originalImageNote = originalBase64
      ? " The final artwork must contain EXACTLY the elements listed in the subject info above — nothing more, nothing less. (1) If the cutout is missing any listed element (e.g. a body part, mat, hat, or accessory is absent or cropped), refer to the original photo to restore it. (2) If the cutout contains any extra element NOT listed in the subject info (e.g. residual background, stray objects), remove it completely. The original photo is for restoration reference only — do not introduce its background or any unlisted element."
      : "";
    const prompt = cropHint
      ? `[Subject Info] ${cropHint}${originalImageNote}\n\n${stylePrompt}`
      : stylePrompt;

    // --- 4. 构建请求体（支持多图：参考图 + 原图 + 抠图主图） ---
    // 每种风格从对应的 refs 目录加载本地参考图（public/<style>-refs/）
    const STYLE_REFS_DIR: Record<ArtStyle, string> = {
      lineart: "lineart-refs",
      watercolor: "watercolor-refs",
      cartoon: "cartoon-refs",
      kawaii: "kawaii-refs",
      outline: "outline-refs",
    };

    // 参考图 URL（GitHub Raw，公开可访问，生产/本地均可用）
    // 文件已提交到 GitHub 仓库 public/*-refs/ 目录，Seedream 直接通过 URL 读取，无需 base64
    const GITHUB_RAW = "https://raw.githubusercontent.com/lizziezhaoll00/pettattoo-maker/main/public";
    const STYLE_REFS_URLS: Record<ArtStyle, string[]> = {
      lineart:    [], // 暂无参考图
      watercolor: [
        `${GITHUB_RAW}/watercolor-refs/ref1.png`,
        `${GITHUB_RAW}/watercolor-refs/ref2.jpg`,
        `${GITHUB_RAW}/watercolor-refs/ref3.png`,
      ],
      cartoon:    [], // 暂无参考图
      kawaii:     [
        `${GITHUB_RAW}/kawaii-refs/1.jpg`,
        `${GITHUB_RAW}/kawaii-refs/2.jpg`,
        `${GITHUB_RAW}/kawaii-refs/3.jpg`,
      ],
      outline:    [
        `${GITHUB_RAW}/outline-refs/ref1.png`,
        `${GITHUB_RAW}/outline-refs/ref2.png`,
        `${GITHUB_RAW}/outline-refs/ref3.png`,
      ],
    };

    // 本地开发：用本地文件 base64（可离线调试）；生产环境：用 GitHub Raw URL（直接传 URL，无需 base64 编码）
    let styleRefImages: string[] = [];
    if (process.env.NODE_ENV === "development") {
      const refsDir = path.join(process.cwd(), "public", STYLE_REFS_DIR[style]);
      try {
        const files = fs.readdirSync(refsDir)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .sort()
          .slice(0, 3);
        for (const file of files) {
          const buf = fs.readFileSync(path.join(refsDir, file));
          const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
          styleRefImages.push(`data:image/${ext};base64,${buf.toString("base64")}`);
        }
        console.log(`[seedream-stylize] 本地：${style} 参考图 ${styleRefImages.length} 张（base64）`);
      } catch {
        console.log(`[seedream-stylize] 本地：${style} 无参考图`);
      }
    } else {
      styleRefImages = STYLE_REFS_URLS[style] ?? [];
      console.log(`[seedream-stylize] 生产：${style} 参考图 ${styleRefImages.length} 张（GitHub Raw URL）`);
    }

    // 图片数组组装：[...参考图, 原图(可选), 抠图主图]
    const imageField = (() => {
      const arr: string[] = [
        ...styleRefImages,
        ...(originalBase64 ? [originalBase64] : []),
        imageBase64,
      ];
      return arr.length === 1 ? arr[0] : arr;
    })();

    // 当前使用 doubao-seedream-4-5-251128（5.0 无免费额度，临时切换）
    // 恢复 5.0 时改回 "doubao-seedream-5-0-260128"
    // 4.5 与 5.0 参数完全相同：size="2K"（大写），response_format="url"
    const reqBody = JSON.stringify({
      model: "doubao-seedream-4-5-251128",
      prompt,
      image: imageField,
      size: "2K",                              // 4.5 / 5.0 均用大写枚举
      response_format: "url",                  // 返回图片 URL，服务端再下载
      sequential_image_generation: "disabled", // 生成单张图（非组图）
      stream: false,
      watermark: false,                        // 关闭水印
    });

    console.log(
      "[seedream-stylize] 开始调用 Seedream 4.5 API，style:", style,
      "| 多图模式:", !!originalBase64,
      "| cropHint:", cropHint ? cropHint.slice(0, 80) : "（无）"
    );

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
    return NextResponse.json({ url: dataUrl, promptUsed: prompt });
  } catch (error) {
    console.error("[seedream-stylize]", error);
    const msg = error instanceof Error ? error.message : "风格化服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
