import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

type ArtStyle = "lineart" | "watercolor" | "cartoon";

/**
 * 从 URL 或 base64 dataURL 获取图片 Buffer
 */
async function getImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error("无效的 data URL 格式");
    return Buffer.from(match[1], "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`图片下载失败: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 核心工具：对 RGB 通道应用滤镜，保留原始 alpha 通道
 * 同时处理 remove.bg 免费版遗留的白色残影：
 *   白色区域（R>240 & G>240 & B>240）的 alpha 会被压低，使其接近透明
 * 流程：
 *   1. 提取原始 alpha 通道
 *   2. 合白底后对 RGB 做滤镜
 *   3. 把滤镜结果的 RGB 和原始 alpha 重新合并
 *   4. 用逐像素处理消除白色残影
 */
async function applyFilterKeepAlpha(
  inputBuf: Buffer,
  applyToRgb: (rgbBuf: Buffer) => Promise<Buffer>
): Promise<Buffer> {
  const { width, height } = await sharp(inputBuf).metadata();

  // Step 1: 提取 alpha 通道（灰度图）
  const alphaBuf = await sharp(inputBuf)
    .extractChannel("alpha")
    .png()
    .toBuffer();

  // Step 2: 合白底后应用 RGB 滤镜
  const flatBuf = await sharp(inputBuf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
  const filteredBuf = await applyToRgb(flatBuf);

  // Step 3: 把滤镜结果转为 RGB，再合并 alpha 通道
  const rgbBuf = await sharp(filteredBuf)
    .removeAlpha()
    .resize(width, height)  // 确保尺寸一致
    .toBuffer();

  // joinChannel 把 alpha 叠加回去
  const withAlpha = await sharp(rgbBuf)
    .joinChannel(alphaBuf)
    .png()
    .toBuffer();

  // Step 4: 直接返回，alpha 通道完全来自原始抠图，不做额外处理
  // 注意：不能用颜色值判断白色并透明化，因为动物的白色毛发也是白色
  return withAlpha;
}

/**
 * 线稿风：去色 + 高对比度 → 模拟墨线手绘效果，保留透明背景
 */
async function applyLineart(inputBuf: Buffer): Promise<Buffer> {
  return applyFilterKeepAlpha(inputBuf, async (flatBuf) =>
    sharp(flatBuf)
      .greyscale()
      .linear(2.5, -(255 * 1.3))  // 提高对比度，压暗中间调
      .normalise()
      .png()
      .toBuffer()
  );
}

/**
 * 水彩风：柔化 + 饱和度提升 → 模拟水彩晕染，保留透明背景
 */
async function applyWatercolor(inputBuf: Buffer): Promise<Buffer> {
  return applyFilterKeepAlpha(inputBuf, async (flatBuf) =>
    sharp(flatBuf)
      .blur(1.5)
      .modulate({ saturation: 1.8, brightness: 1.05 })
      .png()
      .toBuffer()
  );
}

/**
 * 卡通风：高饱和 + 锐化 → 模拟扁平卡通效果，保留透明背景
 */
async function applyCartoon(inputBuf: Buffer): Promise<Buffer> {
  return applyFilterKeepAlpha(inputBuf, async (flatBuf) =>
    sharp(flatBuf)
      .modulate({ saturation: 2.2, brightness: 1.0 })
      .sharpen({ sigma: 2.5, m1: 1, m2: 3 })
      .png()
      .toBuffer()
  );
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

    // 获取原始图片 Buffer
    const inputBuf = await getImageBuffer(imageUrl);

    // 根据风格应用对应滤镜（均保留透明通道）
    let resultBuf: Buffer;
    switch (style) {
      case "lineart":
        resultBuf = await applyLineart(inputBuf);
        break;
      case "watercolor":
        resultBuf = await applyWatercolor(inputBuf);
        break;
      case "cartoon":
        resultBuf = await applyCartoon(inputBuf);
        break;
      default:
        return NextResponse.json({ error: "不支持的风格" }, { status: 400 });
    }

    // 转为 base64 data URL 返回（透明 PNG）
    const resultBase64 = resultBuf.toString("base64");
    const dataUrl = `data:image/png;base64,${resultBase64}`;

    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("[stylize]", error);
    const msg = error instanceof Error ? error.message : "风格化服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
