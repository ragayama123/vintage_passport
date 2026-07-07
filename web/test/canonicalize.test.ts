import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalize,
  canonicalBytes,
  sha256Hex,
  bytesAndHash,
  sha256HexOfBytes,
  hashesEqual,
} from "../lib/canonicalize.ts";

test("同じオブジェクトは何度でも同じhexになる", () => {
  const obj = { b: 1, a: "x", c: [3, 2, 1] };
  const h1 = bytesAndHash(obj).hashHex;
  const h2 = bytesAndHash(obj).hashHex;
  assert.equal(h1, h2);
  assert.match(h1, /^0x[0-9a-f]{64}$/);
});

test("キー順を変えても同じhexになる（決定的シリアライズ）", () => {
  const a = { item_type: "Levi's 501", confidence: 0.82, era: "1974" };
  const b = { era: "1974", item_type: "Levi's 501", confidence: 0.82 };
  assert.equal(bytesAndHash(a).hashHex, bytesAndHash(b).hashHex);
});

test("ネストしたオブジェクトのキーも再帰的にソートされる", () => {
  const a = { x: { z: 1, y: 2 }, list: [{ b: 1, a: 2 }] };
  const b = { list: [{ a: 2, b: 1 }], x: { y: 2, z: 1 } };
  assert.equal(canonicalize(a), canonicalize(b));
});

test("配列の順序は保持される（意味を持つため）", () => {
  const a = { arr: [1, 2, 3] };
  const b = { arr: [3, 2, 1] };
  assert.notEqual(canonicalize(a), canonicalize(b));
});

test("日本語はUTF-8のまま扱われ、pin対象bytesとhash対象bytesが一致する", () => {
  const obj = {
    evidence: [{ feature: "ボタン裏刻印", observed: "6" }],
    notes: "赤タブは片面スモールe",
  };
  const { bytes, hashHex } = bytesAndHash(obj);
  // pin される bytes を「そのまま」再ハッシュしたら同じ hash になる（verifyの再現）
  const rehash = sha256HexOfBytes(bytes);
  assert.equal(rehash, hashHex);
});

test("verify経路: canonicalBytes → hash と、その bytes を arrayBuffer 経由で再hash が一致", () => {
  const obj = { item_type: "Levi's 501", estimated_era: "1980-1982" };
  const bytes = canonicalBytes(obj);
  const original = sha256Hex(bytes);
  // gateway から取得したと想定した ArrayBuffer 相当
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  assert.equal(sha256HexOfBytes(ab), original);
});

test("hashesEqual は大文字小文字と0x有無を吸収する", () => {
  const h = sha256Hex(Buffer.from("hello"));
  assert.ok(hashesEqual(h, h.toUpperCase()));
  assert.ok(hashesEqual(h, h.slice(2))); // 0x なし
  assert.ok(!hashesEqual(h, sha256Hex(Buffer.from("world"))));
});

test("1文字違いのJSONはhashが変わる（改ざん検知＝✗デモの根拠）", () => {
  const a = { estimated_era: "1974-1976" };
  const b = { estimated_era: "1974-1977" };
  assert.notEqual(bytesAndHash(a).hashHex, bytesAndHash(b).hashHex);
});
