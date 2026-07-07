import { createHash } from "crypto";

/**
 * 決定的JSONシリアライズ + SHA-256 の土台。
 *
 * 【最重要方針】ハッシュ照合が確実に「✓」になるために:
 *   - canonicalize でキーを再帰ソートし、決定的な文字列を作る
 *   - その文字列から bytes(Buffer) を **ただ1つ** 作る
 *   - 同一の bytes を (a)SHA-256 と (b)IPFS pin の両方に使う（別々に作らない）
 *   - verify 側は gateway から arrayBuffer() で取得したバイトをそのまま再ハッシュ
 *
 * この設計により、verify は「決定的シリアライズが完璧か」に依存せず、
 * 取得したバイトをそのまま食うだけなので事故らない。
 */

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

/**
 * オブジェクトのキーを再帰的にソートして決定的な JSON 文字列を返す。
 * 配列の順序は保持する（意味を持つため）。
 * undefined 値のキーは JSON.stringify と同様に除去される。
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value as Json));
}

function sortValue(value: Json): Json {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sortValue(v));
  }
  const sorted: { [key: string]: Json } = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined) continue;
    sorted[key] = sortValue(v as Json);
  }
  return sorted;
}

/**
 * canonicalize した文字列を UTF-8 の Buffer にする。
 * この Buffer を pin と hash の両方に渡すのが鉄則。
 * 日本語は UTF-8 のまま（余計な正規化・エスケープをしない）。
 */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}

/**
 * バイト列の SHA-256 を `0x` 付き小文字 hex で返す。
 * オンチェーンの bytes32 と比較しやすい形式。
 */
export function sha256Hex(bytes: Buffer): string {
  return "0x" + createHash("sha256").update(bytes).digest("hex");
}

/**
 * pin と hash に使う「1つの bytes」と、その hash をまとめて返すヘルパー。
 * 呼び出し側は bytes をそのまま Pinata に pin し、hash をオンチェーンに渡す。
 * 分岐でバイトがずれるのを構造的に防ぐ。
 */
export function bytesAndHash(value: unknown): {
  bytes: Buffer;
  hashHex: string;
} {
  const bytes = canonicalBytes(value);
  return { bytes, hashHex: sha256Hex(bytes) };
}

/**
 * 取得済みのバイト列（IPFS gateway の arrayBuffer など）を hash する。
 * verify 側で使う。ArrayBuffer / Uint8Array / Buffer を受ける。
 */
export function sha256HexOfBytes(
  data: ArrayBuffer | Uint8Array | Buffer
): string {
  const buf =
    data instanceof Buffer
      ? data
      : Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  return sha256Hex(buf);
}

/**
 * 2つの hash が一致するか（大文字小文字・0x prefix の差を吸収して比較）。
 */
export function hashesEqual(a: string, b: string): boolean {
  return normalizeHex(a) === normalizeHex(b);
}

function normalizeHex(h: string): string {
  const lower = h.toLowerCase();
  return lower.startsWith("0x") ? lower.slice(2) : lower;
}
