import { NextResponse } from "next/server";
import { z } from "zod";
import { appraiseImages } from "@/lib/claude";

export const runtime = "nodejs";
// 鑑定は毎回モデルを呼ぶのでキャッシュしない
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  images: z
    .array(
      z.object({
        label: z.string(),
        data: z.string().min(1),
      })
    )
    .min(1),
});

// POST /api/appraise
// in : { images: [{ label, data(base64) }] }
// out: 鑑定書JSON（設計書 §5.2）
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正です（JSONを送ってください）。" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "画像(images)が必要です。ラベル付きで1枚以上送ってください。" },
      { status: 400 }
    );
  }

  try {
    const appraisal = await appraiseImages(parsed.data.images);
    return NextResponse.json(appraisal);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "鑑定中に不明なエラーが発生しました。";
    console.error("[/api/appraise]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
