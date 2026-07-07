import { NextResponse } from "next/server";
import { AppraisalSchema, confidenceToUint8 } from "@/lib/appraisal";
import { bytesAndHash } from "@/lib/canonicalize";
import { CRITERIA_HASH } from "@/lib/criteria/levis501";
import { pinBytes, pinImageBase64 } from "@/lib/ipfs";
import { mintWithAppraisal, custodialAddress } from "@/lib/chain";
import { z } from "zod";
import { getAddress, isAddress, type Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  appraisal: AppraisalSchema,
  images: z
    .array(
      z.object({
        label: z.string(),
        data: z.string().min(1),
        mediaType: z.string().optional(),
      })
    )
    .default([]),
  // 受取先（省略時はサーバーのカストディアルウォレット＝出品者代理）
  to: z.string().optional(),
});

function baseUrl(req: Request): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  return new URL(req.url).origin;
}

// POST /api/mint
// 手順:
//  1. 画像を Pinata に pin → CID配列
//  2. 鑑定書JSONに image_cids を追記（ハッシュ計算より前に完了）
//  3. 【致命傷ポイント】canonicalize で bytes を1つ作り、pin と SHA-256 の両方に使う
//  4. mintWithAppraisal 実行
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正です。" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "appraisal(鑑定書JSON) が必要です。" },
      { status: 400 }
    );
  }

  const { appraisal, images, to } = parsed.data;

  // to が指定されたのに不正なアドレスなら 400（黙ってフォールバックしない）
  if (to && !isAddress(to)) {
    return NextResponse.json(
      { error: "受取先アドレス(to)が不正です。0x形式のアドレスを指定してください。" },
      { status: 400 }
    );
  }

  // 受取先を解決（未指定ならカストディアルウォレット）
  let recipient: `0x${string}`;
  try {
    recipient = to ? getAddress(to) : custodialAddress();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    // 1. 画像を pin
    const imageCids: string[] = [];
    for (const img of images) {
      const cid = await pinImageBase64(
        img.data,
        img.label,
        img.mediaType || "image/jpeg"
      );
      imageCids.push(cid);
    }

    // 2. 鑑定書JSONに image_cids を追記
    const doc = { ...appraisal, image_cids: imageCids };

    // 3. bytes を1つだけ作り、pin と hash の両方に使う
    const { bytes, hashHex } = bytesAndHash(doc);
    const docCid = await pinBytes(bytes, "appraisal.json", "application/json");

    // 4. ミント
    const appraisedAt = Math.floor(Date.now() / 1000);
    const { tokenId, txHash } = await mintWithAppraisal({
      to: recipient,
      tokenURI: `ipfs://${docCid}`,
      appraisalHash: hashHex as Hex,
      criteriaHash: CRITERIA_HASH as Hex,
      estimatedEra: appraisal.estimated_era,
      confidence: confidenceToUint8(appraisal.confidence),
      appraisedAt,
    });

    return NextResponse.json({
      tokenId: tokenId.toString(),
      txHash,
      tokenURI: `ipfs://${docCid}`,
      docCid,
      appraisalHash: hashHex,
      verifyUrl: `${baseUrl(req)}/passport/${tokenId.toString()}`,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "ミント中に不明なエラーが発生しました。";
    console.error("[/api/mint]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
