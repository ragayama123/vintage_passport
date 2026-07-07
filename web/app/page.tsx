"use client";

import { useState } from "react";
import QRCode from "qrcode";

type Label = "全体" | "タグ" | "刻印" | "その他";
const LABELS: Label[] = ["全体", "タグ", "刻印", "その他"];

interface UploadImage {
  id: string;
  label: Label;
  data: string; // data URI
  mediaType: string;
}

interface Evidence {
  feature: string;
  observed: string;
  implication: string;
}
interface Appraisal {
  item_type: string;
  estimated_era: string;
  confidence: number;
  evidence: Evidence[];
  red_flags: string[];
  notes: string;
  model_version: string;
  criteria_version: string;
}
interface MintResult {
  tokenId: string;
  txHash: string;
  verifyUrl: string;
  docCid: string;
}

const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ||
  "https://testnet-explorer.hsk.xyz";

export default function Home() {
  const [images, setImages] = useState<UploadImage[]>([]);
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [loading, setLoading] = useState<"" | "appraise" | "mint">("");
  const [error, setError] = useState<string>("");

  async function onFiles(label: Label, files: FileList | null) {
    if (!files) return;
    const next: UploadImage[] = [];
    for (const file of Array.from(files)) {
      // 送信前にリサイズ（Claude APIの5MB/枚制限・HEIC対策・転送量削減）
      const { data, mediaType } = await fileToJpegDataUrl(file);
      next.push({
        id: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label,
        data,
        mediaType,
      });
    }
    setImages((prev) => [...prev, ...next]);
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleAppraise() {
    setError("");
    setLoading("appraise");
    setAppraisal(null);
    try {
      const res = await fetch("/api/appraise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((i) => ({ label: i.label, data: i.data })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "鑑定に失敗しました。");
      setAppraisal(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "鑑定に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  async function handleMint() {
    if (!appraisal) return;
    setError("");
    setLoading("mint");
    try {
      const res = await fetch("/api/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appraisal,
          images: images.map((i) => ({
            label: i.label,
            data: i.data,
            mediaType: i.mediaType,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ミントに失敗しました。");
      setMintResult(json);
      const qr = await QRCode.toDataURL(json.verifyUrl, { width: 240 });
      setQrDataUrl(qr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ミントに失敗しました。");
    } finally {
      setLoading("");
    }
  }

  function reset() {
    setImages([]);
    setAppraisal(null);
    setMintResult(null);
    setQrDataUrl("");
    setError("");
  }

  // ===== 完了画面 =====
  if (mintResult) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-lg font-bold tracking-tight">VINTAGE PASSPORT</h1>
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-3xl font-black text-emerald-700">✓ 記録完了</p>
          <p className="mt-2 text-sm text-emerald-800">
            鑑定書をチェーンに記録しました（Token #{mintResult.tokenId}）
          </p>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="検証ページQR"
              className="mx-auto mt-4 h-48 w-48 rounded-lg bg-white p-2"
            />
          )}
          <p className="mt-2 text-xs text-neutral-500">
            QRをスキャンして検証ページを開けます
          </p>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <a
            href={mintResult.verifyUrl}
            className="block rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white"
          >
            検証ページを開く →
          </a>
          <a
            href={`${EXPLORER}/tx/${mintResult.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-neutral-200 px-4 py-3 text-center text-blue-600"
          >
            Explorerでトランザクションを見る →
          </a>
          <button
            onClick={reset}
            className="block w-full rounded-lg border border-neutral-200 px-4 py-3 text-center text-neutral-600"
          >
            最初からやり直す
          </button>
        </div>
      </main>
    );
  }

  // ===== 出品フロー =====
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-lg font-bold tracking-tight">VINTAGE PASSPORT</h1>
      <p className="mt-1 text-sm text-neutral-500">
        AIが鑑定し、ブロックチェーンが記憶する。
      </p>

      {/* 1. 画像アップロード */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold">1. 画像をアップロード</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {LABELS.map((label) => (
            <label
              key={label}
              className="cursor-pointer rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-4 text-center text-sm hover:border-neutral-400"
            >
              <span className="font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-neutral-400">
                タップして選択
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(label, e.target.files)}
              />
            </label>
          ))}
        </div>

        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative">
                <img
                  src={img.data}
                  alt={img.label}
                  className="h-24 w-full rounded-lg object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {img.label}
                </span>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. 鑑定 */}
      <section className="mt-6">
        <button
          onClick={handleAppraise}
          disabled={images.length === 0 || loading !== ""}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {loading === "appraise" ? "鑑定中…" : "2. AI鑑定する"}
        </button>
      </section>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 鑑定書カード */}
      {appraisal && (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500">鑑定結果</h2>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-bold">
              {appraisal.estimated_era}
            </span>
            <span className="text-sm text-neutral-500">
              確信度 {Math.round(appraisal.confidence * 100)}%
            </span>
          </div>
          <p className="text-xs text-neutral-400">{appraisal.item_type}</p>

          <ul className="mt-3 space-y-2">
            {appraisal.evidence.map((ev, i) => (
              <li key={i} className="rounded-lg bg-neutral-50 p-3 text-sm">
                <span className="font-medium">{ev.feature}</span>：{ev.observed}
                <span className="mt-0.5 block text-xs text-neutral-500">
                  → {ev.implication}
                </span>
              </li>
            ))}
          </ul>

          {appraisal.red_flags.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-amber-600">
                レッドフラグ
              </h3>
              <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
                {appraisal.red_flags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {appraisal.notes && (
            <p className="mt-3 text-xs text-neutral-500">{appraisal.notes}</p>
          )}

          <button
            onClick={handleMint}
            disabled={loading !== ""}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {loading === "mint"
              ? "記録中…（数十秒かかります）"
              : "3. 鑑定書をチェーンに記録する"}
          </button>
        </section>
      )}
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 画像を長辺 maxEdge px 以下の JPEG に変換して data URI で返す。
 * - スマホ実写(4〜12MB)を Claude API の 5MB/枚 制限内に収める
 * - HEIC(iPhone) は canvas 経由で JPEG に変換される(Safariはネイティブでデコード可)
 * - デコードできない形式は原本のままフォールバック(サーバー側で受ける)
 */
async function fileToJpegDataUrl(
  file: File,
  maxEdge = 1568,
  quality = 0.85
): Promise<{ data: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(
        1,
        maxEdge / Math.max(bitmap.width, bitmap.height)
      );
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      ctx.drawImage(bitmap, 0, 0, w, h);
      return {
        data: canvas.toDataURL("image/jpeg", quality),
        mediaType: "image/jpeg",
      };
    } finally {
      bitmap.close();
    }
  } catch {
    // デコード不能な形式は原本のまま送る
    return {
      data: await fileToDataUrl(file),
      mediaType: file.type || "image/jpeg",
    };
  }
}
