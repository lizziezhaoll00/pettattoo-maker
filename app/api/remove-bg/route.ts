import { NextRequest, NextResponse } from "next/server";

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

    // remove.bg API（稳定可用，免费版约 500px；Vercel 上可换 PhotoRoom）
    const rbFormData = new FormData();
    rbFormData.append("image_file", file);
    rbFormData.append("size", "regular");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": process.env.REMOVE_BG_API_KEY ?? "",
      },
      body: rbFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[remove-bg] remove.bg error:", errText);
      return NextResponse.json(
        { error: `抠图失败，请稍后重试（${response.status}）` },
        { status: 500 }
      );
    }

    const resultBuffer = await response.arrayBuffer();

    return new NextResponse(resultBuffer, {
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
