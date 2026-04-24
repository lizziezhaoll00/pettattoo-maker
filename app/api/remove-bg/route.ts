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

    // PhotoRoom API（Vercel 海外服务器可访问，返回原始分辨率）
    const prFormData = new FormData();
    prFormData.append("image_file", file);

    const response = await fetch("https://sdk.photoroom.com/v1/segment", {
      method: "POST",
      headers: {
        "x-api-key": process.env.PHOTOROOM_API_KEY ?? "",
      },
      body: prFormData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[remove-bg] PhotoRoom error:", errText);
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
