import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/verify?tokenId=N
// 手順（lib/verify.ts に共通実装）:
//  1. appraisals(tokenId) と tokenURI を read
//  2. IPFSゲートウェイから arrayBuffer() で鑑定書JSONを取得
//  3. 取得バイト列をそのまま SHA-256 しオンチェーン値と比較（小文字比較）
//  4. Transfer イベントから所有履歴を構築（失敗しても ✓/✗ 判定は返す）
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenIdStr = url.searchParams.get("tokenId");
  if (tokenIdStr === null || !/^\d+$/.test(tokenIdStr)) {
    return NextResponse.json(
      { error: "tokenId(数値) を指定してください。" },
      { status: 400 }
    );
  }

  try {
    const result = await verifyToken(BigInt(tokenIdStr));
    return NextResponse.json({ tokenId: tokenIdStr, ...result });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "検証中に不明なエラーが発生しました。";
    console.error("[/api/verify]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
