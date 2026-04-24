import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// Vercel Serverless Function 超时设置（Hobby 计划最大 60s）
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未收到图片" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "图片太大，请上传 10MB 以内的图片" }, { status: 400 });
    }

    // 把文件转成 base64 data URL，传给 Replicate
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // 调用 Replicate rembg 模型（高质量抠图，保留原始分辨率）
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // 同步等待结果，最多等 60s
      },
      body: JSON.stringify({
        version: "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
        input: { image: dataUrl },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("[remove-bg] Replicate create error:", errText);
      return NextResponse.json({ error: `抠图失败（${createRes.status}）` }, { status: 500 });
    }

    const prediction = await createRes.json();

    // Prefer: wait 时直接拿结果，否则轮询
    let outputUrl: string | null = null;

    if (prediction.status === "succeeded" && prediction.output) {
      outputUrl = prediction.output as string;
    } else if (prediction.status === "failed") {
      console.error("[remove-bg] Replicate failed:", prediction.error);
      return NextResponse.json({ error: "抠图失败，请重试" }, { status: 500 });
    } else {
      // 轮询（最多 30 次 × 2s = 60s）
      const pollUrl = prediction.urls?.get;
      if (!pollUrl) {
        return NextResponse.json({ error: "无法获取任务状态" }, { status: 500 });
      }
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: { "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}` },
        });
        const pollData = await pollRes.json();
        if (pollData.status === "succeeded") {
          outputUrl = pollData.output as string;
          break;
        }
        if (pollData.status === "failed") {
          console.error("[remove-bg] Replicate poll failed:", pollData.error);
          return NextResponse.json({ error: "抠图失败，请重试" }, { status: 500 });
        }
      }
    }

    if (!outputUrl) {
      return NextResponse.json({ error: "抠图超时，请重试" }, { status: 500 });
    }

    // 下载结果图片
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "结果图片获取失败" }, { status: 500 });
    }
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

    // 去黑边后处理：
    // rembg 边缘半透明像素混入了深色背景，用 Sharp 逐像素把暗色边缘提亮
    // 方法：把 alpha < 200 的像素的 RGB 强制拉向白色（线性插值）
    const { data, info } = await sharp(rawBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info; // channels === 4 (RGBA)
    const pixels = new Uint8Array(data);

    for (let i = 0; i < width * height; i++) {
      const base = i * 4;
      const a = pixels[base + 3];
      if (a > 0 && a < 250) {
        // 半透明边缘：把 RGB 按 alpha 比例拉向白色，消除暗色溢色
        const t = a / 255; // 0=完全透明 → 白, 1=完全不透明 → 保持原色
        pixels[base + 0] = Math.round(pixels[base + 0] * t + 255 * (1 - t));
        pixels[base + 1] = Math.round(pixels[base + 1] * t + 255 * (1 - t));
        pixels[base + 2] = Math.round(pixels[base + 2] * t + 255 * (1 - t));
      }
    }

    const cleanedBuffer = await sharp(Buffer.from(pixels), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

    return new NextResponse(cleanedBuffer, {
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
