import https from "https";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/** 6 种纹身方案，每种都有独立的生成 prompt */
export interface TattooScheme {
  id: string;
  title: string;
  styleEmoji: string;
  poseDesc: string;  // 一句话描述姿态/场景
  bodyPart: string;  // 推荐贴的位置
  size: "S" | "M" | "L";
  tattooPrompt: string; // 传给 Seedream 的生成提示词
}

function httpsPost(
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

const SYSTEM_PROMPT = `你是一位专业的宠物纹身贴设计师。用户会上传一张宠物照片，你需要分析这张照片，为这只宠物量身设计 6 种不同风格的纹身贴方案。

每种方案必须包含：
- id: 英文简写（如 lineart_fullbody / watercolor_face / cartoon_sitting 等，确保 6 个 id 各不相同）
- title: 2-6字中文标题（如"极简线稿"、"水彩写意"）
- styleEmoji: 1个最符合风格的 emoji
- poseDesc: 一句话描述（10-20字，说清楚构图和风格特点）
- bodyPart: 推荐贴的位置（如"手腕"、"锁骨"、"脚踝"）
- size: 推荐尺寸，只能是 "S"、"M" 或 "L" 其中之一
- tattooPrompt: 传给图像生成模型的英文 prompt，用于生成该风格的纹身贴图（详细说明风格、构图、颜色处理、透明背景等）

6 种方案必须覆盖以下维度的多样性：
1. 风格多样：至少包含线稿(lineart)、水彩(watercolor)、卡通(cartoon)、写实(realistic)等不同风格
2. 构图多样：全身、半身、大头特写、局部场景等不同取景
3. 尺寸分布：S/M/L 各有分布，不要全是同一尺寸

tattooPrompt 写作规范：
- 必须以 "Tattoo sticker design of [宠物种类]:" 开头
- 描述具体的宠物姿态/构图
- 描述清晰的艺术风格（线稿/水彩/卡通等）
- 末尾固定加 "transparent background, no text, no watermark, clean edges"
- 示例："Tattoo sticker design of a corgi dog: full body sitting pose, minimalist black lineart style, thin elegant strokes, transparent background, no text, no watermark, clean edges"

请严格返回 JSON 数组格式，不要有任何额外文字：
[
  { "id": "...", "title": "...", "styleEmoji": "...", "poseDesc": "...", "bodyPart": "...", "size": "M", "tattooPrompt": "..." },
  ...
]`;

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = (await req.json()) as { imageDataUrl: string };

    if (!imageDataUrl) {
      return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK_API_KEY 未配置" }, { status: 500 });
    }

    const reqBody = JSON.stringify({
      model: "doubao-seed-2-0-pro-260215",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_image", image_url: imageDataUrl },
            { type: "input_text", text: "请分析这张宠物照片，为它量身定制 6 种纹身贴方案。" },
          ],
        },
      ],
    });

    const { status, data: rawData } = await httpsPost(
      "https://ark.cn-beijing.volces.com/api/v3/responses",
      { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      reqBody
    );

    if (status !== 200) {
      console.error("[analyze-crop] API error:", status, rawData.slice(0, 300));
      return NextResponse.json({ schemes: getDefaultSchemes() });
    }

    const result = JSON.parse(rawData);
    type ResponseOutput = { type: string; content?: Array<{ type: string; text?: string }> };
    const msgOutput = (result.output as ResponseOutput[])?.find((o) => o.type === "message");
    const content = msgOutput?.content?.find((c) => c.type === "output_text")?.text ?? "";

    let schemes: TattooScheme[] = [];
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { schemes = JSON.parse(jsonMatch[0]); } catch {
        console.error("[analyze-crop] JSON parse failed:", jsonMatch[0]);
      }
    }

    if (!schemes || schemes.length < 3) {
      schemes = getDefaultSchemes();
    }

    // 取最多 6 个，补全必填字段
    schemes = schemes.slice(0, 6).map((s, i) => ({
      id: s.id || `scheme_${i}`,
      title: s.title || "纹身方案",
      styleEmoji: s.styleEmoji || "🎨",
      poseDesc: s.poseDesc || "经典构图",
      bodyPart: s.bodyPart || "手腕",
      size: (["S", "M", "L"].includes(s.size) ? s.size : "M") as "S" | "M" | "L",
      tattooPrompt: s.tattooPrompt || `Tattoo sticker design of a pet, scheme ${i + 1}, transparent background, no text, no watermark, clean edges`,
    }));

    return NextResponse.json({ schemes });
  } catch (error) {
    console.error("[analyze-crop]", error);
    return NextResponse.json({ schemes: getDefaultSchemes() });
  }
}

export function getDefaultSchemes(): TattooScheme[] {
  return [
    {
      id: "lineart_fullbody",
      title: "极简线稿",
      styleEmoji: "✏️",
      poseDesc: "全身线稿，干净极简",
      bodyPart: "手腕",
      size: "M",
      tattooPrompt: "Tattoo sticker design of a pet: full body pose, minimalist black lineart style, thin elegant strokes, simple outline, transparent background, no text, no watermark, clean edges",
    },
    {
      id: "watercolor_face",
      title: "水彩大脸",
      styleEmoji: "🎨",
      poseDesc: "头部大特写，水彩晕染",
      bodyPart: "锁骨",
      size: "M",
      tattooPrompt: "Tattoo sticker design of a pet: close-up face portrait, soft watercolor style, gentle color blending, pastel tones, transparent background, no text, no watermark, clean edges",
    },
    {
      id: "cartoon_sitting",
      title: "卡通坐姿",
      styleEmoji: "🐾",
      poseDesc: "卡通风坐姿，圆润可爱",
      bodyPart: "脚踝",
      size: "S",
      tattooPrompt: "Tattoo sticker design of a pet: cute sitting pose, cartoon chibi style, bold outlines, bright cheerful colors, kawaii aesthetic, transparent background, no text, no watermark, clean edges",
    },
    {
      id: "sketch_halfbody",
      title: "素描半身",
      styleEmoji: "🖊️",
      poseDesc: "上半身素描，细节精准",
      bodyPart: "小臂",
      size: "L",
      tattooPrompt: "Tattoo sticker design of a pet: upper body half portrait, detailed pencil sketch style, fine cross-hatching shading, realistic proportions, transparent background, no text, no watermark, clean edges",
    },
    {
      id: "geometric_minimal",
      title: "几何简约",
      styleEmoji: "🔺",
      poseDesc: "几何多边形风，时尚前卫",
      bodyPart: "耳后",
      size: "S",
      tattooPrompt: "Tattoo sticker design of a pet: geometric low-poly style, angular triangular shapes, modern minimal design, flat colors with geometric facets, transparent background, no text, no watermark, clean edges",
    },
    {
      id: "realistic_color",
      title: "写实彩色",
      styleEmoji: "🌈",
      poseDesc: "写实全彩，色彩鲜艳",
      bodyPart: "肩膀",
      size: "L",
      tattooPrompt: "Tattoo sticker design of a pet: full body realistic portrait, vibrant full color illustration, detailed fur texture, professional photo-realistic style, transparent background, no text, no watermark, clean edges",
    },
  ];
}
