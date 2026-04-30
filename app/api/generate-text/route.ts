import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * 文案生成接口
 * 优先调用火山方舟 Doubao 文本模型；模型未开通时自动 fallback 到本地预设文案。
 *
 * 开通文本模型：
 * 1. 登录 https://console.volcengine.com/ark
 * 2. 进入「模型推理」→「开通管理」，开通 doubao-1-5-pro-32k 或 doubao-1-5-lite-32k
 * 3. 进入「接入点管理」，新建接入点并绑定文本模型，获取接入点 ID（ep-xxx）
 * 4. 在 .env.local 中新增 ARK_TEXT_ENDPOINT=ep-xxx（或直接修改 ARK_API_KEY）
 *
 * POST body: { petName: string; styles: string }
 * Response: { text: string }
 */

/** 预设文案池——API 不可用时随机选一条，代入宠物名字 */
const FALLBACK_TEMPLATES = [
  "将{name}灵动的身影化作温柔的线条刻于肌肤，让这份轻盈的守护伴随你的每一次呼吸，装点此刻每一个斑斓的瞬间。",
  "把对{name}的爱意凝成永恒的印记，每一次相视而笑都是最温暖的注解，愿我们并肩走过每一个四季。",
  "以{name}的名字为墨，在皮肤上写下这份无声的约定——今天、明天，以及未来所有还没到来的朝夕。",
  "{name}踏着轻盈的步伐走进你的生命，从此每个清晨都染上了独属于你们的色彩，这道印记见证着你们的每一天。",
  "把{name}最可爱的样子留在这里，让它成为你随身携带的温柔。无论走到哪里，这份陪伴都从未离开。",
  "用纹身诉说那些无法言说的深情——{name}奔跑着的身影、湿漉漉的眼睛，是你最珍视的日常，也是皮肤上最美的风景。",
  "将与{name}共度的时光凝成一道永恒的符号，带着这份轻柔的重量，你走过的每一步都有它的印记相随。",
  "{name}给了你无数次的治愈，现在轮到这道印记——在你最疲惫的时候，轻轻提醒你：它一直都在。",
];

function getFallbackText(petName: string): string {
  const idx = Math.floor(Math.random() * FALLBACK_TEMPLATES.length);
  return FALLBACK_TEMPLATES[idx].replace(/{name}/g, petName);
}

export async function POST(req: NextRequest) {
  try {
    const { petName, styles } = (await req.json()) as {
      petName?: string;
      styles?: string;
    };

    const finalName = (petName ?? "").trim() || "小天使";
    const styleText = (styles ?? "").trim() || "水彩晕染";

    const apiKey = process.env.ARK_API_KEY;

    // ── 尝试调用火山方舟文本模型 ──
    if (apiKey) {
      const prompt = `作为一位富有同理心且具有文学素养的宠物纹身设计师，请为这只名叫"${finalName}"的可爱宠物写一段简短、温暖的专属纹身寓意（大概2句话）。所选的纹身视觉风格是：${styleText}。
【重要要求】：请将这只宠物视为正在陪伴主人的、鲜活快乐的生命。这是一份庆祝爱与陪伴的礼物，绝对不要使用任何暗示宠物已经去世、离开、或是去往"汪星/喵星/天堂"的悲伤字眼（例如：怀念、纪念、离别）。语气要积极、治愈，强调"现在的陪伴"和"未来的每一天"。只能使用中文回答。只输出寓意文案本身，不加任何前缀或解释。`;

      const body = JSON.stringify({
        model: "doubao-1-5-lite-32k-250115",
        messages: [
          {
            role: "system",
            content: "You are an empathetic tattoo artist and poet who writes warm, healing messages in Chinese.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.85,
      });

      try {
        const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });

        if (response.ok) {
          const result = await response.json();
          const text = result?.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log("[generate-text] ARK 成功，petName:", finalName);
            return NextResponse.json({ text });
          }
        } else {
          const errText = await response.text().catch(() => "");
          // ModelNotOpen / 模型未开通 → 直接 fallback，不报错
          if (errText.includes("ModelNotOpen") || errText.includes("NotFound")) {
            console.warn("[generate-text] 模型未开通，使用本地 fallback 文案");
          } else {
            console.error("[generate-text] ARK error:", response.status, errText.slice(0, 200));
          }
        }
      } catch (fetchErr) {
        console.warn("[generate-text] ARK 请求异常，fallback:", (fetchErr as Error).message);
      }
    }

    // ── Fallback：返回本地预设文案 ──
    const text = getFallbackText(finalName);
    console.log("[generate-text] 使用本地 fallback 文案，petName:", finalName);
    return NextResponse.json({ text });

  } catch (error) {
    console.error("[generate-text]", error);
    // 即使顶层出错，也尽量返回 fallback 文案而非报错
    return NextResponse.json({ text: getFallbackText("小天使") });
  }
}
