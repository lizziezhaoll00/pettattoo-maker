import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import Replicate from "replicate";

export const maxDuration = 60;

// ─── 模型版本 ───────────────────────────────────────────────────────────────
// BiRefNet：men1scus/birefnet（A100·高精度，~12-22s）
const BIREFNET_VERSION = "f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7";
// rembg：lucataco/remove-bg（T4·快速，~1s，备用）
const REMBG_VERSION = "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";
// LangSAM：tmappdev/lang-segment-anything（文本引导，~5-15s）
const LANGSAM_VERSION = "891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc";

// ─── 多主体检测（LangSAM 对多主体局部分割不稳定，自动降级 BiRefNet）──────────
const ANIMAL_WORDS = [
  "dog","cat","rabbit","hamster","bird","fish","turtle","snake","lizard",
  "parrot","guinea pig","ferret","fox","wolf","bear","deer","horse","pony",
  "cow","sheep","goat","pig","duck","chicken","penguin","koala","panda",
  "lion","tiger","leopard","cheetah","corgi","poodle","husky","labrador",
  "golden retriever","bulldog","chihuahua","shiba","ragdoll","persian",
  "siamese","tabby","maine coon","bengal","calico",
];

function hasMultipleSubjects(cropHint: string): boolean {
  const lower = cropHint.toLowerCase();
  const found = ANIMAL_WORDS.filter((w) => lower.includes(w));
  // 去重后 ≥ 2 个不同动物词 → 多主体
  const unique = [...new Set(found)];
  return unique.length >= 2;
}

// ─── 后处理：去除半透明边缘的暗色溢色 ────────────────────────────────────────
async function cleanEdges(rawBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(rawBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = new Uint8Array(data);

  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = pixels[base + 3];
    if (a > 0 && a < 250) {
      const t = a / 255;
      pixels[base + 0] = Math.round(pixels[base + 0] * t + 255 * (1 - t));
      pixels[base + 1] = Math.round(pixels[base + 1] * t + 255 * (1 - t));
      pixels[base + 2] = Math.round(pixels[base + 2] * t + 255 * (1 - t));
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ─── 下载外部图片（含重定向）────────────────────────────────────────────────
async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Replicate 轮询（Prefer:wait 未生效时的备用路径）────────────────────────
async function pollReplicate(pollUrl: string, token: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.status === "succeeded") return data.output as string;
    if (data.status === "failed") throw new Error(data.error || "抠图失败，请重试");
  }
  throw new Error("抠图超时，请重试");
}

// ─── BiRefNet / rembg（共用 Replicate 手撸 fetch 路径）──────────────────────
async function runReplicateModel(
  version: string,
  dataUrl: string,
  apiToken: string
): Promise<Buffer> {
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ version, input: { image: dataUrl } }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate 调用失败（${createRes.status}）: ${errText.slice(0, 200)}`);
  }

  const prediction = await createRes.json();
  let outputUrl: string | null = null;

  if (prediction.status === "succeeded" && prediction.output) {
    outputUrl = prediction.output as string;
  } else if (prediction.status === "failed") {
    throw new Error(prediction.error || "抠图失败，请重试");
  } else {
    const pollUrl = prediction.urls?.get;
    if (!pollUrl) throw new Error("无法获取任务状态");
    outputUrl = await pollReplicate(pollUrl, apiToken);
  }

  return downloadUrl(outputUrl!);
}

// ─── LangSAM（使用官方 SDK，坑 6：手撸 fetch 传 binary body 会发空 body）────
async function runLangSAM(
  imageFile: File,
  cropHint: string,
  apiToken: string
): Promise<Buffer> {
  const replicate = new Replicate({ auth: apiToken });

  const arrayBuffer = await imageFile.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: imageFile.type || "image/jpeg" });

  // SDK 自动上传 Blob 到 Replicate Files API 并获取 URL
  const output = await replicate.run(`tmappdev/lang-segment-anything:${LANGSAM_VERSION}`, {
    input: {
      image: blob,
      text_prompt: cropHint,
    },
  });

  // output 是 FileOutput（ReadableStream），调 .blob() 读取 mask 二进制
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maskBlob = await (output as any).blob();
  const maskBuffer = Buffer.from(await maskBlob.arrayBuffer());

  // 将 mask 灰度值作为原图 alpha 通道，合成透明 PNG
  const origBuffer = Buffer.from(await imageFile.arrayBuffer());

  const [origMeta, maskMeta] = await Promise.all([
    sharp(origBuffer).metadata(),
    sharp(maskBuffer).metadata(),
  ]);

  // 统一 mask 尺寸与原图一致
  const maskResized = await sharp(maskBuffer)
    .resize(origMeta.width!, origMeta.height!, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  const { data: origData, info: origInfo } = await sharp(origBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const origPixels = new Uint8Array(origData);
  const maskPixels = new Uint8Array(maskResized);
  const { width, height } = origInfo;

  // 用 mask 灰度值覆盖原图 alpha 通道
  for (let i = 0; i < width * height; i++) {
    origPixels[i * 4 + 3] = maskPixels[i]; // 白=前景(255)，黑=背景(0)
  }

  return sharp(Buffer.from(origPixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ─── remove.bg 商业 API ────────────────────────────────────────────────────
async function runRemoveBg(imageFile: File, apiKey: string): Promise<Buffer> {
  const formData = new FormData();
  formData.append("image_file", imageFile);
  formData.append("size", "auto");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`remove.bg 失败（${res.status}）: ${errText.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── 主 Handler ──────────────────────────────────────────────────────────────
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

    const replicateToken = process.env.REPLICATE_API_TOKEN ?? "";
    const removeBgKey = process.env.REMOVE_BG_API_KEY ?? "";

    // LangSAM 遇到多主体 → 自动降级 BiRefNet（坑 8）
    let model = modelParam;
    if (model === "langsam" && cropHint && hasMultipleSubjects(cropHint)) {
      console.log("[remove-bg] 多主体检测：LangSAM 降级 → BiRefNet");
      model = "birefnet";
    }
    // LangSAM 无 cropHint → 降级 BiRefNet
    if (model === "langsam" && !cropHint.trim()) {
      model = "birefnet";
    }

    console.log(`[remove-bg] model=${model}${cropHint ? ` | cropHint=${cropHint.slice(0, 60)}` : ""}`);

    // 转 base64 data URL（BiRefNet / rembg 路径使用）
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    let rawBuffer: Buffer;

    if (model === "removebg") {
      // ── remove.bg 商业 API ──────────────────────────────────────────────
      if (!removeBgKey) {
        return NextResponse.json({ error: "REMOVE_BG_API_KEY 未配置" }, { status: 500 });
      }
      rawBuffer = await runRemoveBg(file, removeBgKey);

    } else if (model === "langsam") {
      // ── LangSAM 文本引导 ────────────────────────────────────────────────
      if (!replicateToken) {
        return NextResponse.json({ error: "REPLICATE_API_TOKEN 未配置" }, { status: 500 });
      }
      rawBuffer = await runLangSAM(file, cropHint, replicateToken);

    } else if (model === "rembg") {
      // ── rembg（快速备用）────────────────────────────────────────────────
      if (!replicateToken) {
        return NextResponse.json({ error: "REPLICATE_API_TOKEN 未配置" }, { status: 500 });
      }
      rawBuffer = await runReplicateModel(REMBG_VERSION, dataUrl, replicateToken);

    } else {
      // ── BiRefNet（默认）─────────────────────────────────────────────────
      if (!replicateToken) {
        return NextResponse.json({ error: "REPLICATE_API_TOKEN 未配置" }, { status: 500 });
      }
      rawBuffer = await runReplicateModel(BIREFNET_VERSION, dataUrl, replicateToken);
    }

    // 统一后处理：去除半透明边缘暗色溢色
    const cleanedBuffer = await cleanEdges(rawBuffer);

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
