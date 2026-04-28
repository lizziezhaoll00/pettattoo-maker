import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import Replicate from "replicate";

// Vercel Serverless Function 超时设置（Hobby 计划最大 60s）
export const maxDuration = 60;

// ─────────────────────────────────────────────
// 工具：去预乘（Unpremultiply）边缘修复
//
// 问题根因：BiRefNet / rembg 输出的是预乘 alpha（premultiplied alpha）PNG，
// 边缘半透明像素的 RGB 已经与背景色混合（如暖色背景会让白猫边缘偏黄橙）。
//
// 修复原理：对 alpha 在 (0, 255) 的半透明像素做"去预乘"，
// 将 RGB 除以归一化 alpha，还原出纯前景色：
//   前景RGB = 当前RGB / (alpha/255)
// 完全透明(alpha=0) 直接清零，完全不透明(alpha=255) 保持原色不变。
// ─────────────────────────────────────────────
async function unpremultiplyEdges(rawBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(rawBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = new Uint8Array(data);

  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = pixels[base + 3];
    if (a === 0) {
      // 完全透明：RGB 清零，避免残留背景色
      pixels[base + 0] = 0;
      pixels[base + 1] = 0;
      pixels[base + 2] = 0;
    } else if (a < 255) {
      // 半透明：去预乘，还原纯前景色
      const inv = 255 / a;
      pixels[base + 0] = Math.min(255, Math.round(pixels[base + 0] * inv));
      pixels[base + 1] = Math.min(255, Math.round(pixels[base + 1] * inv));
      pixels[base + 2] = Math.min(255, Math.round(pixels[base + 2] * inv));
    }
    // alpha === 255：完全不透明，保持原色不动
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ─────────────────────────────────────────────
// 工具：Replicate 通用调用（手撸 fetch + 轮询，用于 BiRefNet / rembg）
// ─────────────────────────────────────────────
async function replicatePredict(body: object): Promise<string> {
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait", // 同步等待，最多 60s
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("[remove-bg] Replicate create error:", errText);
    throw new Error(`抠图失败（${createRes.status}）`);
  }

  const prediction = await createRes.json();

  if (prediction.status === "succeeded" && prediction.output) {
    return prediction.output as string;
  }
  if (prediction.status === "failed") {
    console.error("[remove-bg] Replicate failed:", prediction.error);
    throw new Error("抠图失败，请重试");
  }

  // 轮询（最多 30 次 × 2s = 60s）
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) throw new Error("无法获取任务状态");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    const pollData = await pollRes.json();
    if (pollData.status === "succeeded") return pollData.output as string;
    if (pollData.status === "failed") {
      console.error("[remove-bg] Replicate poll failed:", pollData.error);
      throw new Error("抠图失败，请重试");
    }
  }
  throw new Error("抠图超时，请重试");
}

// ─────────────────────────────────────────────
// 模型实现
// ─────────────────────────────────────────────

/**
 * rembg（lucataco/remove-bg）：轻量快速，Lab 备用
 * 警告：双宠同框主体缺失严重，不推荐线上使用
 */
async function runRembg(dataUrl: string): Promise<Buffer> {
  const outputUrl = await replicatePredict({
    version: "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
    input: { image: dataUrl },
  });
  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error("结果图片获取失败");
  const rawBuffer = Buffer.from(await imgRes.arrayBuffer());
  return rawBuffer;
}

/**
 * BiRefNet（men1scus/birefnet）：高精度通用抠图，线上默认
 * A100 80GB，CAAI AIR 2024 论文级，Lab 横评验证效果最优
 */
async function runBiRefNet(dataUrl: string): Promise<Buffer> {
  const outputUrl = await replicatePredict({
    version: "f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7",
    input: { image: dataUrl },
  });
  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error("结果图片获取失败");
  const rawBuffer = Buffer.from(await imgRes.arrayBuffer());
  return rawBuffer;
}

/**
 * remove.bg API：商业级抠图，50次/月免费
 * 效果接近 BiRefNet，毛发稍差；可作备选
 */
async function runRemoveBgApi(arrayBuffer: ArrayBuffer, mimeType: string): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) throw new Error("未配置 REMOVE_BG_API_KEY");

  const formData = new FormData();
  formData.append("image_file", new Blob([arrayBuffer], { type: mimeType }), "image.png");
  formData.append("size", "auto");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[remove-bg] remove.bg API error:", errText);
    throw new Error(`remove.bg 抠图失败（${res.status}）`);
  }

  const rawBuffer = Buffer.from(await res.arrayBuffer());
  return rawBuffer;
}

/**
 * LangSAM（tmappdev/lang-segment-anything）：文本引导精准分割
 *
 * 触发条件：cropHint 非空（前端保证）
 * 关键技术点：
 *   - image 字段必须是 URL（不支持 base64），官方 SDK 自动处理上传
 *   - 输出是灰度 mask（白=前景，黑=背景），不是透明 PNG
 *   - 用 sharp 把 mask 灰度值作为原图 alpha 通道，合成透明 PNG
 *   - 最后过 cleanEdges 去黑边
 *
 * ⚠️ 坑：不能手撸 Replicate Files API（undici 空 body）
 *     → 必须用官方 replicate npm SDK（replicate.run()），传 Blob，SDK 自动上传
 */
async function runLangSAM(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
  cropHint: string
): Promise<Buffer> {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // SDK 传 Blob，内部自动上传到 Replicate Files API 并获取 URL
  const imageBlob = new Blob([arrayBuffer], { type: mimeType });

  console.log("[remove-bg] LangSAM text_prompt:", cropHint.slice(0, 80));

  const output = await replicate.run(
    "tmappdev/lang-segment-anything:891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc",
    {
      input: {
        image: imageBlob,
        text_prompt: cropHint,
      },
    }
  );

  // SDK 返回 FileOutput（ReadableStream），调 .blob() 直接读取 mask 二进制
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maskBlob = await (output as any).blob();
  const maskBuffer = Buffer.from(await maskBlob.arrayBuffer());

  // 把灰度 mask 作为 alpha 通道与原图合成透明 PNG
  const originalBuffer = Buffer.from(arrayBuffer);

  const { data: maskData, info: maskInfo } = await sharp(maskBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data: origData, info: origInfo } = await sharp(originalBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 如果 mask 尺寸与原图不同，先 resize mask 到原图尺寸
  let finalMaskData = new Uint8Array(maskData);
  if (maskInfo.width !== origInfo.width || maskInfo.height !== origInfo.height) {
    const resized = await sharp(maskBuffer)
      .greyscale()
      .resize(origInfo.width, origInfo.height)
      .raw()
      .toBuffer();
    finalMaskData = new Uint8Array(resized);
  }

  const origPixels = new Uint8Array(origData);
  const w = origInfo.width;
  const h = origInfo.height;
  const result = new Uint8Array(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    result[i * 4 + 0] = origPixels[i * 4 + 0];
    result[i * 4 + 1] = origPixels[i * 4 + 1];
    result[i * 4 + 2] = origPixels[i * 4 + 2];
    // 二值化阈值处理：mask 灰度 > 128 → 完全不透明，否则完全透明
    // 直接用灰度值作 alpha 会导致半透明边缘与背景色混合，产生颜色渗透
    result[i * 4 + 3] = finalMaskData[i] > 128 ? 255 : 0;
  }

  const composited = await sharp(Buffer.from(result), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  return composited;
}

// ─────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const modelParam = (formData.get("model") as string | null) ?? "birefnet";
    const cropHint = (formData.get("cropHint") as string | null) ?? "";

    if (!file) {
      return NextResponse.json({ error: "未收到图片" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "图片太大，请上传 10MB 以内的图片" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // 模型路由：前端已按 cropHint 决策好模型，服务端直接执行
    //   有 cropHint → langsam（文本引导精准分割）
    //   无 cropHint → birefnet（高精度通用，线上默认）
    //   removebg   → remove.bg 商业 API（已配置 KEY，额度充足时可选）
    //   rembg      → Replicate rembg（Lab 备用）
    const model = modelParam;

    console.log(`[remove-bg] model=${model}, cropHint="${cropHint.slice(0, 60)}"`);

    let cleanedBuffer: Buffer;

    switch (model) {
      case "rembg":
        cleanedBuffer = await runRembg(dataUrl);
        break;

      case "removebg":
        cleanedBuffer = await runRemoveBgApi(arrayBuffer, mimeType);
        break;

      case "langsam":
        // cropHint 为空时不应走到这里（前端已处理），保险起见降级
        if (!cropHint) {
          console.log("[remove-bg] LangSAM cropHint 为空，降级到 BiRefNet");
          cleanedBuffer = await runBiRefNet(dataUrl);
        } else {
          try {
            cleanedBuffer = await runLangSAM(arrayBuffer, mimeType, cropHint);
          } catch (langsamErr) {
            // LangSAM 依赖 Replicate Files API 上传，在某些网络环境下会 fetch failed
            // 自动降级到 BiRefNet，保证主流程不中断
            console.warn("[remove-bg] LangSAM 失败，降级到 BiRefNet:", langsamErr);
            cleanedBuffer = await runBiRefNet(dataUrl);
          }
        }
        break;

      case "birefnet":
      default:
        cleanedBuffer = await runBiRefNet(dataUrl);
        break;
    }

    return new NextResponse(new Uint8Array(cleanedBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[remove-bg]", error);
    const msg = error instanceof Error ? error.message : "抠图服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
