import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppraisalSchema, type Appraisal } from "./appraisal";
import {
  CRITERIA_VERSION,
  criteriaTableText,
} from "./criteria/levis501";

// 鑑定に使うモデル（Vision対応・構造化JSON）。model_version に実IDを記録する。
export const APPRAISAL_MODEL = "claude-sonnet-5";

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type MediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export interface AppraisalImageInput {
  label: string; // 全体/タグ/刻印/その他
  data: string; // base64（data URI プレフィックスは除去済みでも付きでも可）
  mediaType?: MediaType;
}

const OUTPUT_SCHEMA_HINT = `{
  "item_type": "Levi's 501",
  "estimated_era": "1974-1976",
  "confidence": 0.82,
  "evidence": [
    {"feature": "ボタン裏刻印", "observed": "6", "implication": "1970年代の特定工場を示唆"}
  ],
  "red_flags": ["ステッチ色とパッチ年代の不整合"],
  "notes": "判定に使えなかった画像・不鮮明箇所の指摘",
  "model_version": "${APPRAISAL_MODEL}",
  "criteria_version": "${CRITERIA_VERSION}"
}`;

function buildSystemPrompt(): string {
  return [
    "あなたはヴィンテージLevi'sの鑑定士です。以下の判定基準表に基づき、",
    "画像から観察できる事実のみを根拠に年代を推定してください。",
    "推測で断定しないこと。観察できない特徴は evidence に含めないこと。",
    "出力は指定JSONスキーマのみ。前置き・説明・コードフェンス(```)は一切禁止。JSONオブジェクトだけを返すこと。",
    "",
    "# 判定基準表",
    criteriaTableText(),
    "",
    "# 出力スキーマ（この形に固定。JSONのみを返す）",
    OUTPUT_SCHEMA_HINT,
    "",
    "# ルール",
    "- evidence は必ず1件以上。判定に使える特徴が無ければ estimated_era を \"判定不能\" とし、notes に理由を書く。",
    "- confidence は evidence の整合性から算出する（矛盾があれば下げる）。0〜1の小数。",
    `- model_version は "${APPRAISAL_MODEL}"、criteria_version は "${CRITERIA_VERSION}" とする。`,
    "- 不鮮明・判定に使えなかった画像は notes に指摘する。",
  ].join("\n");
}

function normalizeBase64(data: string): {
  base64: string;
  mediaType: MediaType;
} {
  // data URI (data:image/png;base64,....) の場合はプレフィックスを剥がして media_type を拾う
  const match = data.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/s);
  if (match) {
    const mt = match[1] as MediaType;
    return {
      base64: match[2].replace(/\s/g, ""),
      mediaType: SUPPORTED_MEDIA_TYPES.includes(mt) ? mt : "image/jpeg",
    };
  }
  // base64 は改行を除去して渡す
  return { base64: data.replace(/\s/g, ""), mediaType: "image/jpeg" };
}

/**
 * JSONパース。コードフェンスが付いていたら剥がすフォールバックを入れる。
 */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // ```json ... ``` フェンス除去
    const fence = trimmed
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    // 最初の { から最後の } までを抜き出す最終フォールバック
    const first = fence.indexOf("{");
    const last = fence.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(fence.slice(first, last + 1));
    }
    return JSON.parse(fence);
  }
}

/**
 * 画像を鑑定して構造化JSON（設計書 §5.2）を返す。
 * zod でバリデーションし、model_version には実際のモデルIDを記録する。
 */
export async function appraiseImages(
  images: AppraisalImageInput[]
): Promise<Appraisal> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が未設定です。web/.env.local を確認してください。"
    );
  }
  if (images.length === 0) {
    throw new Error("画像が1枚もありません。");
  }

  const client = new Anthropic({ apiKey });

  // user メッセージ: 各画像 + ラベル
  const content: Anthropic.MessageParam["content"] = [];
  for (const img of images) {
    const { base64, mediaType } = normalizeBase64(img.data);
    content.push({
      type: "text",
      text: `画像ラベル: ${img.label}`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    });
  }
  content.push({
    type: "text",
    text: "上記画像を鑑定し、指定JSONスキーマのみを返してください。",
  });

  const response = await client.messages.create({
    model: APPRAISAL_MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("鑑定モデルからテキスト応答が得られませんでした。");
  }

  const raw = parseJsonLoose(textBlock.text);

  // model_version は実際に使ったモデルIDで上書き（モデルの自己申告に依存しない）
  const withMeta = {
    ...(raw as Record<string, unknown>),
    model_version: APPRAISAL_MODEL,
    criteria_version: CRITERIA_VERSION,
  };

  const parsed = AppraisalSchema.safeParse(withMeta);
  if (!parsed.success) {
    throw new Error(
      "鑑定結果が期待した形式ではありませんでした: " +
        parsed.error.issues.map((i) => i.path.join(".") + ":" + i.message).join(", ")
    );
  }
  return parsed.data;
}
