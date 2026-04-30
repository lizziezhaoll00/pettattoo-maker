import https from "https";
import http from "http";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type StyleKey =
  | "watercolor"
  | "outline"
  | "cartoon"
  | "kawaii"
  | "lineart"
  | "realism"
  | "neotraditional"
  | "geometric"
  | "dotwork";

/** 向后兼容 */
type ArtStyle = StyleKey;

// 各风格对应的 Seedream prompt（来源：PetTattoo-Maker-StyleGuide.md V1.1）
const STYLE_PROMPTS: Record<StyleKey, string> = {
  watercolor:
    "将图中的宠物转化为艺术水彩纹身设计。采用虚实结合的手法：五官与面部核心轮廓使用柔和的湿焦笔触勾勒，确保在色彩晕染中依然保持清晰的辨识度。彻底摒弃大面积的纯白与灰色。采用「负空间」表现手法，利用主体周围的水洗色层勾勒出宠物的白色边缘。【配色规则】将宠物毛发视为色彩流动的画布，不论宠物原本毛色深浅，必须主动引入艺术性的鲜活色彩，严禁大面积出现纯白或灰白色块。笔触轻盈灵动，伴有自然的艺术墨滴喷溅，色彩明快不脏、不灰、不苍白。纯白背景隔离，整体呈现出电影级的光影氛围与高端艺术纸质感。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的「眼神光」和五官细节。",
  outline:
    "将图中的宠物转化为极简单线轮廓纹身设计（Fine Line Outline style）。【线条规则】全图只使用均匀细线，严禁出现粗细变化、排线填充或阴影色块；线条流畅连贯，呈现「手绘一笔画」的轻盈感。【留白原则】宠物身体内部保持大面积纯白留白，仅用最少的线条勾勒外轮廓和关键体块转折（耳廓、腿部分叉、尾巴收尾），省略所有毛发纹理。【五官】适度保留：眼睛用小实心点或细弧线表达，保留清澈的「眼神光」高光点；鼻子用极小三角或短弧线，整体五官极简但有神。【装饰】可选加入 1-2 个与宠物气质相符的极简装饰元素（如细线爱心、小星星、短虚线、小花朵轮廓），装饰元素必须与宠物轮廓保持呼应，同样使用匀细单线，不喧宾夺主。【整体】构图干净，纯白背景，四周留足白边，呈现极简现代的线条插画审美，适合纹身转印。务必精准还原原图中宠物的整体姿态轮廓与标志性体态特征（耳朵形状、尾巴走势等）。",
  cartoon:
    "将图中的宠物转化为高级萌系贴纸艺术。采用日系Q版（Chibi）审美，夸张其灵动的眼神，缩小身体比例，捕捉性格精髓。拥有大胆且极其干净的闭合粗黑轮廓线，采用纯粹的平涂赛璐珞阴影（Flat cell shading），严禁任何形式的纹理或杂色。图案外圈带有一层均匀的、厚度约2px的闭合白边。纯白色背景，高端矢量艺术质感，边缘极其清晰干净，无杂乱线条，无阴影渐变，适合纹身贴纸印刷。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的「眼神光」和五官细节。",
  kawaii:
    "将图中的宠物转化为日韩风萌系手绘插画贴纸。【风格核心】整张图必须是「手绘数字插画」风格，绝对禁止出现照片感或写实摄影质感——宠物需被完整插画化，呈现柔和的手绘笔触、简洁的色块光影、带有轮廓线的插画毛发，风格参考韩国宠物手绘定制贴纸。【宠物呈现】还原原图中宠物的毛色、毛发形态与面部神态（尤其是眼睛的眼神光），以插画方式重绘，宠物居中大头特写，头部和上半身为主体，占画布约 60%，外轮廓带白色 die-cut 边框。【装饰融合——关键】3-5 个 Kawaii 小图标（骨头、草莓、纸杯蛋糕、小鱼、星星等）紧贴宠物轮廓边缘有机排布，部分小图标可轻微叠压在宠物身体边缘，形成一个整体融合的贴纸构图，而非四散分离的独立小贴纸。所有装饰图标采用同一插画风格绘制，低饱和糖果配色。【字体】下方排列彩色 3D 胖乎乎泡泡字「My Baby」，每个字母颜色随机，带 3D 立体阴影，膨胀感强。【整体】纯白背景，全图低饱和糖果色系，清新治愈，整体是一个浑然一体的萌系宠物贴纸，而不是照片拼贴。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的「眼神光」和五官细节。",
  lineart:
    "将图中的宠物转化为传统铅笔素描风格纹身手稿（Pencil Sketch / Graphite Drawing）。【笔触质感】使用真实的铅笔石墨质感，线条带有手工绘制的轻微抖动感，呈现随性而自然的「大师速写」气质；严禁数字感过强的完美直线。【排线技法】用交叉排线（Cross-hatching）表现暗部与毛发层次，排线方向自然随机，疏密变化自然流畅；亮部大面积留白，形成强烈的明暗对比。【细节重心】重点刻画眼睛的高光与阴影，以及鼻头、嘴部的结构细节，还原宠物神韵；毛发用轻柔的弧线排列表现蓬松感，而非逐根精细刻画。【整体构图】略带晕染的铅笔灰调，纯白背景，四周留足白边，整体呈现出「素描写生」的艺术氛围，适合纹身转印与艺术装裱。务必精准还原原图中宠物的面部比例与俏皮神态，尤其是双眼中清澈明亮的「眼神光」。",
  realism:
    "将图中的宠物转化为极致微写实纹身风格设计（Micro-Realism Tattoo Style）。【核心目标】以纹身墨水的黑白灰色域，极致还原宠物真实的毛发质感、皮肤纹理与眼神细节，效果接近「黑白照片」但带有微妙的手工刺青质感。【眼神光是灵魂】眼睛必须是全图最精细的区域：瞳孔深邃有层次，高光点清澈明亮，眼眶周围的细毛清晰可辨，捕捉宠物的情感与灵气。【毛发层次】逐丝表现毛发的方向与卷曲规律，亮部毛发用细白线条勾勒，暗部毛发密集渐变为深黑色块，形成丰富的明暗层次。【整体风格】以黑色为主色调，用细腻的灰度变化塑造体积感；背景纯白干净，构图紧凑聚焦主体面部或上半身；整体呈现高端纹身工作室的专业写实手稿风格。务必精准还原原图中宠物的品种特征、面部比例与独特神态。",
  neotraditional:
    "将图中的宠物转化为美式新传统纹身风格（Neo-Traditional Tattoo Style）。【风格核心】以经典美式纹身的粗黑轮廓线为骨架，结合新传统风格的丰富细节和更广泛的配色；色彩浓郁饱和，使用宝蓝、深红、金黄、翠绿等经典美式色调，但允许更多色彩层次和渐变。【装饰元素——关键】在宠物周围有机融入以下1-3种装饰元素：金色皇冠（戴在头顶）、牡丹或玫瑰花卉（环绕主体）、精致丝带或旗帜（可加文字「Forever My Baby」）、宝石或珍珠串；装饰元素需与宠物主体融为一体，形成华丽的宠物肖像构图。【线条】轮廓线粗黑闭合，内部填色饱满无漏白；阴影用深色同色系渐变表现，不用交叉排线。【整体】纯白背景，画面华丽且平衡，整体呈现「挂在美式纹身工作室墙上的经典宠物肖像纹身」的质感。务必精准还原原图中宠物的品种特征与神态。",
  geometric:
    "将图中的宠物转化为几何解构风格纹身设计（Geometric Tattoo / Sacred Geometry Style）。【核心构图】整体采用「写实与几何的二元对立」结构：宠物面部或上半身的核心区域（尤其是眼睛和鼻头）以写实细节呈现，而身体的边缘、毛发末端则逐渐分解为规律排列的几何多边形碎片（三角形为主），形成「从真实到解体」的渐变视觉冲击。【几何框架】在宠物主体周围叠加简洁的几何线框：圆形、等边三角形或六边形，用细线（约0.5pt）绘制；部分几何图形可填充为深色或留空，与宠物主体形成层次对比。【色调】主体以黑白灰为核心色调，几何框架和碎片可加入1-2种强调色（如深蓝或金色），整体克制优雅。【整体】纯白背景，构图精准对称，呈现现代高端纹身工作室的几何设计感。务必精准还原原图中宠物最标志性的面部特征，尤其是眼神光。",
  dotwork:
    "将图中的宠物转化为专业点刺纹身风格（Dotwork / Stippling Tattoo Style）。【核心技法】全图严禁任何线条——只用大小不同、疏密变化的黑色圆点来构建图像；亮部用极稀疏的小点，暗部用密集的大点，通过点的密度梯度来表现体积、毛发层次和明暗关系。【毛发表现】宠物毛发用顺着毛发方向排布的点列来表现，形成毛流感；毛发尖端用单点或双点表现蓬松末梢；亮部毛发区域大量留白，以纯白和深点的对比强调光感。【眼神光】眼睛是全图重心：瞳孔用极密集的点构建深邃感，高光处留出纯白椭圆，眼眶周围用精细的点渐变表现眼窝深度。【整体】纯白背景，黑白点阵，无任何彩色；构图紧凑，聚焦宠物面部或半身；整体呈现极简而精致的「颗粒磨砂」高级质感，仿佛用针尖在皮肤上精雕细琢的传统纹身手稿。务必精准还原宠物的品种特征与神态。",
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
    const { imageUrl, originalImageUrl, style, cropHint, petName } = (await req.json()) as {
      /** 抠图后的图片（主图，白底合成），必填 */
      imageUrl: string;
      /** 原始上传图片（可选），有时能帮助模型理解完整的身形 */
      originalImageUrl?: string;
      style: StyleKey;
      /** analyze-crop 返回的统一提示词（V2.9 已废弃，保留兼容） */
      cropHint?: string;
      /** 宠物名字（可选，仅 kawaii 风格带入 prompt） */
      petName?: string;
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

    // --- 2. 原图（已不使用，只传抠图主图给 Seedream）---
    void originalImageUrl; // 保留参数接收，不再处理
    const originalBase64: string | null = null;

    // --- 3. 拼接 prompt ---
    const stylePrompt = STYLE_PROMPTS[style];
    if (!stylePrompt) {
      return NextResponse.json({ error: "不支持的风格" }, { status: 400 });
    }

    // kawaii 风格：若用户填了宠物名字，将「My Baby」替换为实际名字
    // 注意：先替换「泡泡字「My Baby」」再替换通用「My Baby」，避免二次替换
    let finalStylePrompt = stylePrompt;
    if (style === "kawaii" && petName && petName.trim()) {
      const name = petName.trim();
      // 先替换带前缀的特定模式，再替换通用模式，防止重叠替换
      finalStylePrompt = stylePrompt
        .replace(/泡泡字「My Baby」/g, `泡泡字「${name}」`)
        .replace(/「My Baby」/g, `「${name}」`);
    }

    // 只使用风格 prompt，不附加原图说明
    const prompt = finalStylePrompt;

    // --- 4. 构建请求体（支持多图：参考图 + 原图 + 抠图主图） ---
    // 每种风格从对应的 refs 目录加载本地参考图（public/<style>-refs/）
    const STYLE_REFS_DIR: Record<StyleKey, string> = {
      watercolor:      "watercolor-refs",
      outline:         "outline-refs",
      cartoon:         "cartoon-refs",
      kawaii:          "kawaii-refs",
      lineart:         "lineart-refs",
      realism:         "realism-refs",
      neotraditional:  "neotraditional-refs",
      geometric:       "geometric-refs",
      dotwork:         "dotwork-refs",
    };

    // 参考图 URL（GitHub Raw，公开可访问，生产/本地均可用）
    const GITHUB_RAW = "https://raw.githubusercontent.com/lizziezhaoll00/pettattoo-maker/main/public";
    const STYLE_REFS_URLS: Record<StyleKey, string[]> = {
      watercolor: [
        `${GITHUB_RAW}/watercolor-refs/ref1.png`,
        `${GITHUB_RAW}/watercolor-refs/ref2.jpg`,
        `${GITHUB_RAW}/watercolor-refs/ref3.png`,
      ],
      outline: [
        `${GITHUB_RAW}/outline-refs/ref1.png`,
        `${GITHUB_RAW}/outline-refs/ref2.png`,
        `${GITHUB_RAW}/outline-refs/ref3.png`,
      ],
      cartoon:        [], // 暂无参考图
      kawaii: [
        `${GITHUB_RAW}/kawaii-refs/1.jpg`,
        `${GITHUB_RAW}/kawaii-refs/2.jpg`,
        `${GITHUB_RAW}/kawaii-refs/3.jpg`,
      ],
      lineart:        [], // 暂无参考图
      realism:        [], // 暂无参考图
      neotraditional: [], // 暂无参考图
      geometric:      [], // 暂无参考图
      dotwork:        [], // 暂无参考图
    };

    // 只传抠图主图，不传风格示意图和原图
    void STYLE_REFS_DIR;
    void STYLE_REFS_URLS;
    void originalBase64;
    const imageField = imageBase64;

    // 当前使用 doubao-seedream-4-0-250828（4.5 无免费额度，切换到 4.0）
    // 恢复高版本时改回对应 model id
    // 4.0 参数：size="2K"（大写），response_format="url"，不支持 sequential_image_generation
    const reqBody = JSON.stringify({
      model: "doubao-seedream-4-0-250828",
      prompt,
      image: imageField,
      size: "2K",             // 4.0 支持大写枚举
      response_format: "url", // 返回图片 URL，服务端再下载
      stream: false,
      watermark: false,       // 关闭水印
    });

    console.log(
      "[seedream-stylize] 开始调用 Seedream 4.0 API，style:", style,
      "| 多图模式:", !!originalBase64,
      "| petName:", petName || "（无）"
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
