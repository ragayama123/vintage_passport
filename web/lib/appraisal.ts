import { z } from "zod";

/**
 * 鑑定書JSONのスキーマ（設計書 §5.2 の形に固定）。
 * evidence は必ず1件以上。判定不能なら estimated_era: "判定不能" + notes に理由。
 */
export const EvidenceSchema = z.object({
  feature: z.string(),
  observed: z.string(),
  implication: z.string(),
});

export const AppraisalSchema = z.object({
  item_type: z.string(),
  estimated_era: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema).min(1),
  red_flags: z.array(z.string()).default([]),
  notes: z.string().default(""),
  model_version: z.string(),
  criteria_version: z.string(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Appraisal = z.infer<typeof AppraisalSchema>;

/**
 * IPFS に pin される最終的な鑑定書JSON。
 * 鑑定結果 + image_cids（ミント時に追記）。この形のバイト列を hash と pin に使う。
 */
export const AppraisalDocumentSchema = AppraisalSchema.extend({
  image_cids: z.array(z.string()).default([]),
});

export type AppraisalDocument = z.infer<typeof AppraisalDocumentSchema>;

/**
 * confidence(0-1) を uint8(0-100) に変換（オンチェーン格納用）。
 */
export function confidenceToUint8(confidence: number): number {
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}
