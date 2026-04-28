import https from "https";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export interface CropSuggestion {
  id: string;
  title: string;
  desc: string;
  cropHint: string;
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

const SYSTEM_PROMPT = `你是一位专业的宠物纹身贴构图顾问。用户会上传一张宠物照片，你需要分析这张照片，针对"制作纹身贴"的使用场景，给出 2-3 种最适合的抠图方案建议。

每种方案必须包含：
- id: 英文简写标识（如 full_body / face_close / partial_scene）
- title: 2-6字中文标题（如"完整身形"）
- desc: 一句话用户说明（20字以内，说清楚抠什么、效果如何）
- cropHint: 传给抠图模型的英文提示词（描述要保留哪些区域/元素，供分割模型参考）

分析维度：
1. 照片中宠物的数量（单只还是多只）——注意：镜像、水面倒影、阴影等情况可能让同一只宠物看起来有多个，此时仍应视为1只
2. 宠物的姿态（侧卧/坐姿/趴着/站立等）
3. 有无标志性道具/装饰（项圈、帽子、玩具等）
4. 背景是否有可以保留的有趣元素
5. 脸部特写是否清晰有表情
6. 纹身贴尺寸通常 3-8cm，构图需简洁

常见方案类型参考（根据实际照片选择最合适的2-3个，不要照抄）：
- 完整全身：保留四肢+尾巴，适合姿态完整的照片
- 大脸特写：只抠头部+颈部，表情丰富时效果好
- 半身坐姿：上半身+爪子，构图简洁可爱
- 带道具：包含帽子/项圈等装饰，个性十足
- 局部场景：保留部分背景元素（如窗台、树叶）增加故事感
- 镜像组合：照片中有镜子/玻璃/水面倒影时，可保留宠物本体+镜中倒影，构图趣味十足

⚠️ 镜像/倒影场景特别规则：
- cropHint 中必须包含 "mirror reflection" 或 "glass reflection" 关键词，明确告知抠图模型需要保留倒影区域
- 正确示例："Precise silhouette of the cat and its mirror reflection, both bodies, clean fur edges, transparent background"
- 错误示例：只写 "cat full body"（会导致倒影被裁掉）

在 cropHint 中，请遵守以下规则：
1. 必须包含宠物的具体种类名词（如 dog、cat、rabbit），不能只写部位（如只写 head 或 fur）
2. 必须描述要保留的完整区域范围，不要只描述局部
3. 强调边缘质量，例如 "Precise silhouette of the dog's face and upper body, clean curly fur edges, transparent background"
4. 结尾始终加 "transparent background"
5. 错误示例："cat's head, clear fur edges"（缺少整体范围、物种写了但范围太窄不稳定）
6. 正确示例："Precise silhouette of the entire dog body, fluffy curly fur edges, transparent background"

请严格返回 JSON 数组格式，不要有任何额外文字：
[
  { "id": "...", "title": "...", "desc": "...", "cropHint": "..." },
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
            { type: "input_text", text: "请分析这张宠物照片，给出最适合制作纹身贴的 2-3 种抠图方案。" },
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
      return NextResponse.json({ error: `AI 分析失败（${status}），请重试` }, { status: 500 });
    }

    const result = JSON.parse(rawData);
    type ResponseOutput = { type: string; content?: Array<{ type: string; text?: string }> };
    const msgOutput = (result.output as ResponseOutput[])?.find((o) => o.type === "message");
    const content = msgOutput?.content?.find((c) => c.type === "output_text")?.text ?? "";

    let suggestions: CropSuggestion[] = [];
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { suggestions = JSON.parse(jsonMatch[0]); } catch {
        console.error("[analyze-crop] JSON parse failed:", jsonMatch[0]);
      }
    }

    if (!suggestions || suggestions.length === 0) {
      return NextResponse.json({ error: "AI 未能识别照片内容，请换一张更清晰的宠物照片" }, { status: 422 });
    }

    suggestions = suggestions.slice(0, 3).map((s, i) => ({
      id: s.id || `option_${i}`,
      title: s.title || "完整抠图",
      desc: s.desc || "保留宠物全身，去除背景",
      cropHint: s.cropHint || "full body of pet, remove background completely",
    }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("[analyze-crop]", error);
    const msg = error instanceof Error ? error.message : "照片分析服务异常";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function getDefaultSuggestions(): CropSuggestion[] {
  return [
    {
      id: "full_body",
      title: "完整全身",
      desc: "保留四肢尾巴，构图完整自然",
      cropHint: "Precise silhouette of the entire pet body including all four legs and tail, clean fur edges, transparent background",
    },
    {
      id: "face_close",
      title: "大脸特写",
      desc: "只保留头部，表情丰富更萌",
      cropHint: "Precise silhouette of the pet's face and head, detailed ear and whisker edges, portrait crop, transparent background",
    },
    {
      id: "half_body",
      title: "半身坐姿",
      desc: "上半身+前爪，简洁可爱",
      cropHint: "Precise silhouette of the pet's upper body and front paws, clean fur texture edges, sitting pose, transparent background",
    },
  ];
}
