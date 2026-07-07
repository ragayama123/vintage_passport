import "server-only";
import { readAppraisal, getTransferHistory } from "./chain";
import { fetchBytesFromIpfs, cidFromTokenURI } from "./ipfs";
import { sha256HexOfBytes, hashesEqual } from "./canonicalize";
import {
  AppraisalDocumentSchema,
  type AppraisalDocument,
} from "./appraisal";

/**
 * 検証ロジックの共通実装（/api/verify と検証ページの両方から使う）。
 *
 * 【重要】所有履歴の取得失敗は verified 判定を巻き込まない。
 * ✓/✗ バッジ（デモの主役）はハッシュ照合だけで決まり、
 * 履歴が取れない場合は historyError にメッセージを入れて degrade する。
 */

export interface HistoryEntry {
  from: string;
  to: string;
  txHash: string;
  blockNumber: string;
  timestamp: number | null;
}

export interface VerificationResult {
  verified: boolean;
  tokenURI: string;
  docCid: string;
  onchain: {
    appraisalHash: string;
    criteriaHash: string;
    estimatedEra: string;
    confidence: number;
    appraisedAt: number;
  };
  recomputedHash: string;
  appraisal: AppraisalDocument | null;
  history: HistoryEntry[];
  historyError: string | null;
}

export async function verifyToken(
  tokenId: bigint
): Promise<VerificationResult> {
  // 1. オンチェーン読み取り（ここが失敗したら検証自体が不可能なので throw）
  const { appraisal: onchain, tokenURI } = await readAppraisal(tokenId);

  // 2. IPFS から鑑定書JSONのバイト列を取得（arrayBuffer そのまま）
  const cid = cidFromTokenURI(tokenURI);
  const bytes = await fetchBytesFromIpfs(cid);

  // 3. 取得バイト列をそのまま再ハッシュして照合（小文字比較）
  const recomputed = sha256HexOfBytes(bytes);
  const verified = hashesEqual(recomputed, onchain.appraisalHash);

  // 鑑定書JSONをパース（表示用。判定には関与しない）
  let doc: AppraisalDocument | null = null;
  try {
    doc = AppraisalDocumentSchema.parse(JSON.parse(bytes.toString("utf8")));
  } catch {
    doc = null;
  }

  // 4. 所有履歴（失敗しても ✓/✗ 判定は返す）
  let history: HistoryEntry[] = [];
  let historyError: string | null = null;
  try {
    const records = await getTransferHistory(tokenId);
    history = records.map((h) => ({
      from: h.from,
      to: h.to,
      txHash: h.txHash,
      blockNumber: h.blockNumber.toString(),
      timestamp: h.timestamp,
    }));
  } catch (e) {
    historyError =
      e instanceof Error
        ? `所有履歴を取得できませんでした: ${e.message}`
        : "所有履歴を取得できませんでした。";
  }

  return {
    verified,
    tokenURI,
    docCid: cid,
    onchain: {
      appraisalHash: onchain.appraisalHash,
      criteriaHash: onchain.criteriaHash,
      estimatedEra: onchain.estimatedEra,
      confidence: onchain.confidence,
      appraisedAt: Number(onchain.appraisedAt),
    },
    recomputedHash: recomputed,
    appraisal: doc,
    history,
    historyError,
  };
}
